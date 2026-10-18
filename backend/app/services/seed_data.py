import os
import csv
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.models.models import (
    Advertisement, AnalysisResult, Evidence, ExtractedEntity,
    Case, CaseNote, Alert, AuditEvent, SystemSetting, case_advertisements, User
)
from app.core.security import hash_password
from app.services.text_preprocessing import normalize_text, calculate_content_hash
from app.services.entity_extraction import extract_entities
from app.services.rule_engine import evaluate_rules
from app.services.model_service import predict_risk
from app.services.risk_scoring import calculate_composite_risk

def seed_database_if_empty(db: Session, seed_demo_records: Optional[bool] = None):
    """
    Ensures default administrative / demonstration user and system settings exist.
    Loads sample demonstration advertisements only if synthetic demo seeding is enabled
    via seed_demo_records=True or environment variable DEMO_MODE=true.
    """
    if seed_demo_records is None:
        seed_demo_records = os.getenv("DEMO_MODE", "false").lower() in ("true", "1", "yes")

    # 1. Seed default demonstration user if users table is empty
    if db.query(User).count() == 0:
        demo_user = User(
            full_name="Lead Investigator",
            email="investigator@fraudscope.local",
            username="investigator",
            password_hash=hash_password("Password123!"),
            role="Investigator",
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )
        db.add(demo_user)
        db.commit()

    # 2. Default system settings (ensure created even in non-demo mode)
    default_settings = [
        ("risk_threshold_low", "35", "Boundary between Low and Medium risk bands (0-100)"),
        ("risk_threshold_high", "65", "Boundary between Medium and High risk bands (0-100)"),
        ("similarity_threshold", "0.78", "RapidFuzz token similarity threshold for near duplicates"),
        ("demo_mode", "true" if seed_demo_records else "false", "Displays DEMO DATA watermark and banners across UI"),
        ("ml_model_enabled", "true", "Enables Scikit-Learn TF-IDF classifier inference")
    ]
    for key, val, desc in default_settings:
        if not db.query(SystemSetting).filter_by(key=key).first():
            db.add(SystemSetting(key=key, value=val, description=desc))
    db.commit()

    # 3. Gate synthetic demonstration records behind DEMO_MODE
    if not seed_demo_records:
        print("[SeedData] DEMO_MODE is false (production mode). Skipping synthetic demonstration records seeding.")
        return

    # 4. Check whether advertisements already exist (preserve existing database records)
    existing_count = db.query(Advertisement).count()
    if existing_count > 0:
        print(f"[SeedData] Preserving existing database records ({existing_count} advertisements already present).")
        return

    csv_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "sample_ads.csv")
    if not os.path.exists(csv_path):
        print(f"[SeedData] Warning: {csv_path} not found.")
        return

    print("[SeedData] Seeding database with synthetic demonstration records...")

    ad_id_map = {} # maps custom_id (e.g. AD-DEMO-001) to DB Advertisement object

    now = datetime.now(timezone.utc)

    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            custom_id = row.get("id")
            raw_text = row.get("content", "")
            source_type = row.get("source_type", "text")
            submitted_url = row.get("submitted_url", None)

            norm_text = normalize_text(raw_text)
            c_hash = calculate_content_hash(norm_text)

            # Stagger timestamps across the past 5 days for realistic dashboard volume charts
            created_at = now - timedelta(days=(i % 5), hours=(i * 3) % 24, minutes=15 * (i % 4))

            # Review status variation
            if "001" in custom_id or "002" in custom_id:
                status = "UNDER_INVESTIGATION"
            elif "003" in custom_id or "004" in custom_id:
                status = "ESCALATED"
            elif "010" in custom_id or "011" in custom_id or "015" in custom_id:
                status = "CLOSED"
            elif "009" in custom_id or "012" in custom_id:
                status = "CLOSED"
            else:
                status = "NEEDS_REVIEW"

            ad = Advertisement(
                custom_id=custom_id,
                original_text=raw_text,
                normalized_text=norm_text,
                source_type=source_type,
                submitted_url=submitted_url,
                is_demo=True,
                data_source="SYNTHETIC_DEMO",
                content_hash=c_hash,
                created_at=created_at,
                review_status=status
            )
            db.add(ad)
            db.flush() # obtain ad.id

            ad_id_map[custom_id] = ad

            # Entity extraction
            entities_data = extract_entities(raw_text, submitted_url)
            for ed in entities_data:
                ee = ExtractedEntity(
                    advertisement_id=ad.id,
                    entity_type=ed["entity_type"],
                    entity_value=ed["entity_value"],
                    normalized_value=ed["normalized_value"]
                )
                db.add(ee)

            # Rule evaluation
            rule_res = evaluate_rules(norm_text)

            # ML prediction - contract returns:
            # (model_available, probability_score_0_to_1, predicted_class, model_version, contributing_tokens)
            ml_avail, ml_prob, ml_class, ml_version, ml_tokens = predict_risk(norm_text)

            # Risk scoring
            risk_info = calculate_composite_risk(
                rule_results=rule_res,
                model_available=ml_avail,
                model_signal=ml_prob,
                model_class=ml_class,
                model_version=ml_version,
                model_tokens=ml_tokens,
                is_duplicate=("006" in custom_id)
            )

            # Analysis result
            analysis = AnalysisResult(
                advertisement_id=ad.id,
                risk_score=risk_info["risk_score"],
                risk_level=risk_info["risk_level"],
                model_available=ml_avail,
                model_signal=ml_prob,
                model_score=risk_info.get("model_score"),
                model_version=risk_info.get("model_version"),
                model_class=risk_info.get("model_class"),
                explanation=risk_info["explanation"],
                recommended_review_action=risk_info["recommended_review_action"],
                created_at=created_at
            )
            db.add(analysis)
            db.flush()

            # Evidences
            for tr in rule_res["triggered_rules"]:
                for phrase in tr["matched_phrases"]:
                    ev = Evidence(
                        advertisement_id=ad.id,
                        analysis_result_id=analysis.id,
                        evidence_type=tr["category"],
                        matched_text=phrase,
                        description=f"Triggered by rule '{tr['rule_name']}': {tr['explanation']}",
                        source_location="Body text",
                        created_at=created_at
                    )
                    db.add(ev)

            # Alerts for high risk
            if risk_info["risk_level"] == "HIGH":
                alert = Alert(
                    advertisement_id=ad.id,
                    alert_type="HIGH_RISK_INDICATOR",
                    severity="HIGH",
                    message=f"High risk score ({risk_info['risk_score']}/100) identified in ad {custom_id}",
                    reviewed=(status in ["UNDER_INVESTIGATION", "ESCALATED", "CLOSED"]),
                    created_at=created_at
                )
                db.add(alert)

    # Create Sample Demonstration Cases
    case_1 = Case(
        case_ref="CASE-2026-001",
        title="Syndicate Campaign: Unchecked Accounts & Telegram Mule Ring",
        description="Investigation into coordinated financial account sales and mule recruiting operating via Telegram handle @FastCashDrop and WhatsApp +1-555-014-9981.",
        priority="CRITICAL",
        status="IN_PROGRESS",
        assigned_to="Senior Analyst Fox",
        created_at=now - timedelta(days=2),
        updated_at=now - timedelta(hours=1)
    )
    db.add(case_1)
    db.flush()

    # Link ads to case 1
    for cid in ["AD-DEMO-001", "AD-DEMO-004", "AD-DEMO-006", "AD-DEMO-007"]:
        if cid in ad_id_map:
            db.execute(case_advertisements.insert().values(
                case_id=case_1.id,
                advertisement_id=ad_id_map[cid].id
            ))

    # Notes for case 1
    db.add(CaseNote(
        case_id=case_1.id,
        note="Initial triage confirmed repeated advertisements with identical contact info and KYC bypass promises. Graph correlation indicates multi-channel operation.",
        actor="Senior Analyst Fox",
        created_at=now - timedelta(days=2, hours=1)
    ))
    db.add(CaseNote(
        case_id=case_1.id,
        note="Identified near-duplicate variations in AD-DEMO-007. Phone number +1-555-019-8234 verified across 3 distinct posts.",
        actor="Analyst Echo",
        created_at=now - timedelta(days=1)
    ))

    # Case 2
    case_2 = Case(
        case_ref="CASE-2026-002",
        title="ShadowVault Pre-loaded ATM Cards & Fake Pin Drops",
        description="Investigation into dark-web style card cloning services advertised on shadowvault-drop.xyz with alleged PIN guarantees.",
        priority="HIGH",
        status="OPEN",
        assigned_to="Analyst Vega",
        created_at=now - timedelta(days=1),
        updated_at=now - timedelta(hours=4)
    )
    db.add(case_2)
    db.flush()

    for cid in ["AD-DEMO-002", "AD-DEMO-013"]:
        if cid in ad_id_map:
            db.execute(case_advertisements.insert().values(
                case_id=case_2.id,
                advertisement_id=ad_id_map[cid].id
            ))

    db.add(CaseNote(
        case_id=case_2.id,
        note="Card drop pattern detected. Domain shadowvault-drop.xyz appears on multiple distinct card dump solicitations.",
        actor="Analyst Vega",
        created_at=now - timedelta(hours=12)
    ))

    # Audit Events
    db.add(AuditEvent(
        actor="System",
        action="INITIAL_SEED",
        entity_type="SYSTEM",
        entity_id="ROOT",
        details="Loaded 15 synthetic demonstration advertisement records and initialized demo threat network.",
        created_at=now
    ))

    db.commit()
    print("[SeedData] Successfully seeded database with synthetic cases, alerts, and advertisements.")
