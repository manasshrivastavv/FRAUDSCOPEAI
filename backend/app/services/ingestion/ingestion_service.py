import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.models import (
    Advertisement, AnalysisResult, Evidence, ExtractedEntity,
    Alert, AuditEvent, Notification
)
from app.services.text_preprocessing import normalize_text, calculate_content_hash, clean_url_string
from app.services.entity_extraction import extract_entities
from app.services.rule_engine import evaluate_rules
from app.services.model_service import predict_risk
from app.services.risk_scoring import calculate_composite_risk
from app.services.url_analysis import analyze_url

from app.services.ingestion.base import BaseSourceAdapter, IngestedPost, SourceAdapterStatus, SourceNotConfiguredException
from app.services.ingestion.meta_adapter import MetaAdLibraryAdapter
from app.services.ingestion.telegram_adapter import TelegramSourceAdapter
from app.services.ingestion.manual_adapter import ManualSubmissionAdapter
from app.services.ingestion.synthetic_adapter import SyntheticDatasetAdapter

class IngestionService:
    """
    Central orchestration service for multi-source intelligence ingestion,
    data persistence, deduplication, and forensic risk assessment.
    """
    def __init__(self):
        self.adapters: Dict[str, BaseSourceAdapter] = {
            "meta_ad_library": MetaAdLibraryAdapter(),
            "telegram_feed": TelegramSourceAdapter(),
            "manual_submission": ManualSubmissionAdapter(),
            "synthetic_demo": SyntheticDatasetAdapter()
        }

    def register_adapter(self, adapter: BaseSourceAdapter):
        self.adapters[adapter.adapter_id] = adapter

    def get_adapter(self, adapter_id: str) -> Optional[BaseSourceAdapter]:
        return self.adapters.get(adapter_id)

    def get_sources_status(self, db: Session) -> List[SourceAdapterStatus]:
        """
        Returns live readiness and telemetry metrics for all registered source adapters.
        Counts real persisted database records associated with each adapter.
        """
        statuses = []
        for adapter_id, adapter in self.adapters.items():
            # Query real count from database
            if adapter_id == "meta_ad_library":
                count = db.query(Advertisement).filter(
                    or_(
                        Advertisement.platform.in_(["Facebook", "Instagram", "Meta"]),
                        Advertisement.external_id.like("META-%")
                    )
                ).count()
            elif adapter_id == "telegram_feed":
                count = db.query(Advertisement).filter(Advertisement.platform == "Telegram").count()
            elif adapter_id == "manual_submission":
                count = db.query(Advertisement).filter(
                    Advertisement.is_demo == False,
                    Advertisement.data_source.in_(["LIVE_SCAN", "MANUAL_SUBMISSION"])
                ).count()
            elif adapter_id == "synthetic_demo":
                count = db.query(Advertisement).filter(Advertisement.is_demo == True).count()
            else:
                count = 0

            statuses.append(adapter.get_status(db_count=count))
        return statuses

    def ingest_post(
        self,
        db: Session,
        post: IngestedPost,
        actor: str = "Analyst"
    ) -> Advertisement:
        """
        Persists an ingested post into the database with deduplication,
        entity extraction, rule evaluation, ML scoring, and audit logging.
        Guarantees persistence across server restarts and page refreshes.
        """
        raw_text = post.content.strip()
        if not raw_text:
            raise ValueError("Advertisement content cannot be empty.")

        norm_text = normalize_text(raw_text)
        content_hash = calculate_content_hash(norm_text)
        cleaned_url = clean_url_string(post.submitted_url) if post.submitted_url else None

        # Check for existing duplicate by external_id or content_hash
        existing_ad = None
        if post.external_id:
            existing_ad = db.query(Advertisement).filter(Advertisement.external_id == post.external_id).first()
        elif not existing_ad:
            existing_ad = db.query(Advertisement).filter(Advertisement.content_hash == content_hash).first()

        if existing_ad:
            # Record is already persisted, return existing record
            return existing_ad

        now = post.created_at or datetime.now(timezone.utc)

        # Determine stable custom_id
        if post.external_id and not post.external_id.startswith("AD-"):
            clean_ext = post.external_id.replace(" ", "-")[:24]
            custom_id = f"AD-{clean_ext}"
        else:
            short_uuid = uuid.uuid4().hex[:6].upper()
            prefix = "AD-DEMO" if post.is_demo else "AD-SCAN"
            custom_id = f"{prefix}-{short_uuid}"

        # 1. Entity Extraction
        extracted = extract_entities(raw_text, cleaned_url)

        # 2. Rule Evaluation
        rule_res = evaluate_rules(norm_text)

        # 3. ML Risk Prediction
        model_avail, model_prob, model_class, model_version, model_tokens = predict_risk(norm_text)

        # 4. Composite Risk Scoring
        risk_info = calculate_composite_risk(
            rule_results=rule_res,
            model_available=model_avail,
            model_signal=model_prob,
            model_class=model_class,
            model_version=model_version,
            model_tokens=model_tokens,
            is_duplicate=False
        )

        # Determine platform
        platform = post.platform
        if not platform or platform == "Unknown":
            lower_comb = f"{raw_text} {cleaned_url or ''}".lower()
            if "t.me" in lower_comb or "telegram" in lower_comb:
                platform = "Telegram"
            elif "instagram" in lower_comb or "insta" in lower_comb:
                platform = "Instagram"
            elif "facebook" in lower_comb or "fb.com" in lower_comb:
                platform = "Facebook"
            elif "wa.me" in lower_comb or "whatsapp" in lower_comb:
                platform = "WhatsApp"
            elif "twitter" in lower_comb or "x.com" in lower_comb:
                platform = "X"
            elif cleaned_url:
                platform = "Web"
            else:
                platform = "Unknown"

        # Serialize raw metadata if present
        raw_meta_str = None
        if post.raw_metadata:
            try:
                raw_meta_str = json.dumps(post.raw_metadata, ensure_ascii=False)
            except Exception:
                raw_meta_str = str(post.raw_metadata)

        # Create Advertisement Record
        ad = Advertisement(
            custom_id=custom_id,
            original_text=raw_text,
            normalized_text=norm_text,
            source_type=post.source_type,
            submitted_url=cleaned_url,
            platform=platform,
            advertiser_name=post.advertiser_name,
            external_id=post.external_id,
            is_demo=post.is_demo,
            data_source=post.data_source,
            raw_metadata=raw_meta_str,
            content_hash=content_hash,
            created_at=now,
            review_status="NEEDS_REVIEW" if risk_info["risk_level"] in ["HIGH", "MEDIUM"] else "NEW"
        )
        db.add(ad)
        db.flush()

        # Create Analysis Result
        analysis = AnalysisResult(
            advertisement_id=ad.id,
            risk_score=risk_info["risk_score"],
            risk_level=risk_info["risk_level"],
            model_available=model_avail,
            model_signal=model_prob,
            model_score=risk_info.get("model_score"),
            model_version=risk_info.get("model_version"),
            model_class=risk_info.get("model_class"),
            explanation=risk_info["explanation"],
            recommended_review_action=risk_info["recommended_review_action"],
            created_at=now
        )
        db.add(analysis)
        db.flush()

        # Store Extracted Entities
        for ed in extracted:
            db.add(ExtractedEntity(
                advertisement_id=ad.id,
                entity_type=ed["entity_type"],
                entity_value=ed["entity_value"],
                normalized_value=ed["normalized_value"]
            ))

        # Store Evidence Items
        for tr in rule_res["triggered_rules"]:
            for phrase in tr["matched_phrases"]:
                db.add(Evidence(
                    advertisement_id=ad.id,
                    analysis_result_id=analysis.id,
                    evidence_type=tr["category"],
                    matched_text=phrase,
                    description=f"Rule trigger '{tr['rule_name']}': {tr['explanation']}",
                    source_location="Body text",
                    created_at=now
                ))

        # Static URL heuristics if URL available
        target_url = cleaned_url
        if not target_url:
            for ed in extracted:
                if ed["entity_type"] in ["URL_DOMAIN", "URL"]:
                    target_url = ed["entity_value"]
                    break
        if target_url:
            url_res = analyze_url(target_url)
            if url_res and url_res.get("risk_score", 0) > 0:
                db.add(Evidence(
                    advertisement_id=ad.id,
                    analysis_result_id=analysis.id,
                    evidence_type="SUSPICIOUS_URL",
                    matched_text=target_url,
                    description=f"Static URL heuristics: {', '.join(url_res.get('indicators', []))}",
                    source_location="URL Analysis",
                    created_at=now
                ))

        # Dataset ground-truth provenance evidence (preserved separately from model score)
        if post.raw_metadata and isinstance(post.raw_metadata, dict):
            gt_label = post.raw_metadata.get("label") or post.raw_metadata.get("ground_truth_label")
            if gt_label:
                gt_cat = post.raw_metadata.get("category", "none")
                gt_cluster = post.raw_metadata.get("cluster_id", "")
                gt_note = post.raw_metadata.get("highlight_note", "")
                file_src = post.raw_metadata.get("file_source", "")
                details = f"Annotated category: '{gt_cat}'"
                if gt_cluster:
                    details += f", cluster: '{gt_cluster}'"
                if file_src:
                    details += f" (source: {file_src})"
                if gt_note:
                    details += f" - {gt_note}"

                db.add(Evidence(
                    advertisement_id=ad.id,
                    analysis_result_id=analysis.id,
                    evidence_type="DATASET_GROUND_TRUTH",
                    matched_text=f"Dataset Ground Truth Label: {gt_label}",
                    description=details,
                    source_location="Dataset Metadata",
                    created_at=now
                ))

        # High risk Alert
        if risk_info["risk_level"] == "HIGH":
            db.add(Alert(
                advertisement_id=ad.id,
                alert_type="HIGH_RISK_INDICATOR",
                severity="HIGH",
                message=f"High risk score ({risk_info['risk_score']}/100) identified in post {custom_id}",
                reviewed=False,
                created_at=now
            ))
            db.add(Notification(
                title=f"High Risk Alert: {custom_id}",
                message=f"High risk score ({risk_info['risk_score']}/100) flagged from {post.data_source}.",
                type="HIGH_RISK_ALERT",
                severity="HIGH",
                is_read=False,
                target_type="alert",
                target_id=custom_id
            ))

        # Audit Event
        db.add(AuditEvent(
            actor=actor,
            action="INGEST_POST",
            entity_type="ADVERTISEMENT",
            entity_id=str(ad.id),
            details=f"Ingested post {custom_id} via {post.data_source} ({platform}) with score {risk_info['risk_score']} ({risk_info['risk_level']})",
            created_at=now
        ))

        db.commit()
        db.refresh(ad)

        # Broadcast real-time live event to SSE subscribers
        try:
            from app.services.broadcaster import broadcaster
            broadcaster.broadcast_sync("NEW_FEED_RECORD", {
                "id": ad.id,
                "custom_id": ad.custom_id,
                "original_text": ad.original_text,
                "platform": ad.platform or "Unknown",
                "advertiser_name": ad.advertiser_name,
                "external_id": ad.external_id,
                "submitted_url": ad.submitted_url,
                "risk_score": analysis.risk_score if analysis else None,
                "risk_level": analysis.risk_level if analysis else "LOW",
                "review_status": ad.review_status,
                "data_source": ad.data_source,
                "is_demo": ad.is_demo,
                "created_at": ad.created_at.isoformat() if ad.created_at else now.isoformat(),
                "top_entities": [
                    {"entity_type": ed["entity_type"], "entity_value": ed["entity_value"]}
                    for ed in extracted[:3]
                ],
                "entities_count": len(extracted),
                "cases_count": 0
            })
        except Exception:
            pass

        return ad

# Singleton instance
ingestion_service = IngestionService()
