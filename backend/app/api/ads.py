import json
import asyncio
import uuid
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc

from app.database.session import get_db
from app.models.models import (
    Advertisement, AnalysisResult, Evidence, ExtractedEntity,
    Alert, AuditEvent, Case, case_advertisements, Notification
)
from app.schemas.schemas import (
    AdAnalyzeRequest, AdSummarySchema, AdDetailSchema,
    AdStatusUpdateRequest, AnalysisResultSchema, EvidenceSchema, EntitySchema,
    IngestPostRequest
)
from app.services.text_preprocessing import normalize_text, calculate_content_hash, clean_url_string
from app.services.entity_extraction import extract_entities
from app.services.rule_engine import evaluate_rules
from app.services.model_service import predict_risk
from app.services.similarity_service import check_exact_duplicate, find_near_duplicates, find_shared_entity_matches
from app.services.risk_scoring import calculate_composite_risk
from app.services.ocr_service import extract_text_from_image
from app.services.url_analysis import analyze_url
from app.services.ingestion import ingestion_service, IngestedPost, SourceNotConfiguredException
from app.services.broadcaster import broadcaster

router = APIRouter(prefix="/ads", tags=["Advertisements"])

def detect_platform(text: str, url: Optional[str] = None, user_platform: Optional[str] = None) -> str:
    if user_platform and user_platform.strip():
        return user_platform.strip()
    combined = f"{text} {url or ''}".lower()
    if "t.me" in combined or "telegram" in combined:
        return "Telegram"
    elif "instagram" in combined or "insta" in combined:
        return "Instagram"
    elif "wa.me" in combined or "whatsapp" in combined:
        return "WhatsApp"
    elif "facebook" in combined or "fb.com" in combined:
        return "Facebook"
    elif "twitter" in combined or "x.com" in combined:
        return "X"
    elif "youtube" in combined or "youtu.be" in combined:
        return "YouTube"
    elif url and len(url.strip()) > 3:
        return "Web"
    return "Unknown"

@router.post("/analyze", response_model=AdDetailSchema)
def analyze_advertisement(payload: AdAnalyzeRequest, db: Session = Depends(get_db)):
    """
    Submits advertisement content or OCR text for explainable AI risk analysis.
    Stores the advertisement record, evidence items, and extracted entities in SQLite.
    """
    raw_text = payload.content.strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Advertisement content cannot be empty.")

    norm_text = normalize_text(raw_text)
    content_hash = calculate_content_hash(norm_text)
    cleaned_url = clean_url_string(payload.submitted_url) if payload.submitted_url else None

    # Check for exact duplicate in database
    existing_dup = check_exact_duplicate(db, content_hash)
    is_duplicate = existing_dup is not None

    # 1. Entity Extraction
    extracted = extract_entities(raw_text, cleaned_url)

    # 2. Rule-Based Evaluation
    rule_res = evaluate_rules(norm_text)

    # 3. Baseline ML Model Evaluation
    model_avail, model_prob, model_class, model_version, model_tokens = predict_risk(norm_text)

    # 4. Composite Risk Scoring
    risk_info = calculate_composite_risk(
        rule_results=rule_res,
        model_available=model_avail,
        model_signal=model_prob,
        model_class=model_class,
        model_version=model_version,
        model_tokens=model_tokens,
        is_duplicate=is_duplicate
    )

    # Generate custom identifier e.g. AD-SCAN-A1B2
    if payload.external_id and not payload.external_id.startswith("AD-"):
        custom_id = f"AD-{payload.external_id.replace(' ', '-')[:24]}"
    else:
        short_uuid = uuid.uuid4().hex[:6].upper()
        custom_id = f"AD-SCAN-{short_uuid}"

    now = datetime.now(timezone.utc)
    detected_platform = detect_platform(raw_text, cleaned_url, payload.platform)

    # Create Advertisement record (persisted with provenance)
    ad = Advertisement(
        custom_id=custom_id,
        original_text=raw_text,
        normalized_text=norm_text,
        source_type=payload.source_type,
        submitted_url=cleaned_url,
        platform=detected_platform,
        advertiser_name=payload.advertiser_name,
        external_id=payload.external_id,
        is_demo=False,
        data_source=payload.data_source or "LIVE_SCAN",
        content_hash=content_hash,
        created_at=now,
        review_status="NEEDS_REVIEW" if risk_info["risk_level"] in ["HIGH", "MEDIUM"] else "NEW"
    )
    db.add(ad)
    db.flush()

    # Store Analysis Result with full model classification metadata
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
        entity_record = ExtractedEntity(
            advertisement_id=ad.id,
            entity_type=ed["entity_type"],
            entity_value=ed["entity_value"],
            normalized_value=ed["normalized_value"]
        )
        db.add(entity_record)

    # Store Evidence Items
    for tr in rule_res["triggered_rules"]:
        for phrase in tr["matched_phrases"]:
            ev = Evidence(
                advertisement_id=ad.id,
                analysis_result_id=analysis.id,
                evidence_type=tr["category"],
                matched_text=phrase,
                description=f"Rule trigger '{tr['rule_name']}': {tr['explanation']}",
                source_location="Body text",
                created_at=now
            )
            db.add(ev)

    # Perform static URL analysis if URL is present or found in entities
    target_url_for_analysis = cleaned_url
    if not target_url_for_analysis:
        for ed in extracted:
            if ed["entity_type"] in ["URL_DOMAIN", "URL"]:
                target_url_for_analysis = ed["entity_value"]
                break

    url_analysis_result = analyze_url(target_url_for_analysis) if target_url_for_analysis else None
    if url_analysis_result and url_analysis_result.get("risk_score", 0) > 0:
        ev_url = Evidence(
            advertisement_id=ad.id,
            analysis_result_id=analysis.id,
            evidence_type="SUSPICIOUS_URL",
            matched_text=target_url_for_analysis,
            description=f"Static URL heuristics: {', '.join(url_analysis_result.get('indicators', []))} (reputation: {url_analysis_result.get('reputation_status', 'not_checked')})",
            source_location="URL Analysis",
            created_at=now
        )
        db.add(ev_url)

    # If high risk, create Alert automatically
    if risk_info["risk_level"] == "HIGH":
        alert = Alert(
            advertisement_id=ad.id,
            alert_type="HIGH_RISK_INDICATOR",
            severity="HIGH",
            message=f"High risk score ({risk_info['risk_score']}/100) identified in ad {custom_id}",
            reviewed=False,
            created_at=now
        )
        db.add(alert)
        db.add(Notification(
            title=f"High Risk Alert: {custom_id}",
            message=f"High risk score ({risk_info['risk_score']}/100) detected on {detected_platform}.",
            type="HIGH_RISK_ALERT",
            severity="HIGH",
            is_read=False,
            target_type="alert",
            target_id=custom_id
        ))

    # Audit Trail
    db.add(AuditEvent(
        actor="Analyst",
        action="SCAN_AD",
        entity_type="ADVERTISEMENT",
        entity_id=str(ad.id),
        details=f"Analyzed ad {custom_id} with score {risk_info['risk_score']} ({risk_info['risk_level']}) on platform {detected_platform}",
        created_at=now
    ))

    db.commit()
    db.refresh(ad)

    # Broadcast real-time live event to SSE subscribers
    try:
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

    # Find related ads (near duplicates and shared entities)
    near_dups = find_near_duplicates(db, norm_text, exclude_id=ad.id)
    shared_ents = find_shared_entity_matches(db, extracted, exclude_id=ad.id)

    # Merge related
    related = []
    seen_related = set()
    for nd in near_dups:
        seen_related.add(nd["advertisement_id"])
        related.append({
            "id": nd["advertisement_id"],
            "custom_id": nd["custom_id"],
            "relation_type": f"TEXT_SIMILARITY ({nd['similarity_score']}%)",
            "preview": nd["preview"],
            "review_status": nd["review_status"]
        })
    for se in shared_ents:
        if se["advertisement_id"] not in seen_related:
            seen_related.add(se["advertisement_id"])
            related.append({
                "id": se["advertisement_id"],
                "custom_id": se["custom_id"],
                "relation_type": f"SHARED_{se['shared_entity_type']}: {se['shared_entity_value']}",
                "preview": se["preview"],
                "review_status": se["review_status"]
            })

    # Prepare response object
    analysis_schema = AnalysisResultSchema(
        id=analysis.id,
        risk_score=analysis.risk_score,
        risk_level=analysis.risk_level,
        classification=risk_info.get("classification", "SAFE"),
        model_available=analysis.model_available,
        model_signal=analysis.model_signal,
        model_score=analysis.model_score,
        model_version=analysis.model_version,
        model_class=analysis.model_class,
        model_tokens=risk_info.get("model_tokens", []),
        explanation=analysis.explanation,
        recommended_review_action=analysis.recommended_review_action,
        triggered_rules=rule_res["triggered_rules"],
        suspicious_phrases=rule_res["suspicious_phrases"],
        is_duplicate=is_duplicate,
        duplicate_of_id=existing_dup.custom_id if existing_dup else None,
        near_duplicate_matches=near_dups
    )

    return AdDetailSchema(
        id=ad.id,
        custom_id=ad.custom_id,
        original_text=ad.original_text,
        normalized_text=ad.normalized_text,
        source_type=ad.source_type,
        submitted_url=ad.submitted_url,
        platform=ad.platform or "Unknown",
        advertiser_name=ad.advertiser_name,
        external_id=ad.external_id,
        is_demo=ad.is_demo,
        data_source=ad.data_source,
        content_hash=ad.content_hash,
        review_status=ad.review_status,
        created_at=ad.created_at,
        analysis=analysis_schema,
        evidence_items=ad.evidence_items,
        entities=ad.entities,
        related_ads=related,
        cases=[],
        url_analysis=url_analysis_result
    )

@router.post("/ocr-upload")
async def ocr_upload(file: UploadFile = File(...)):
    """
    Accepts an image file (PNG, JPG, WEBP), performs safe OCR extraction,
    and returns the extracted text for analyst review and scanning.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a valid image format.")
    
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size exceeds 10MB limit.")

    success, extracted_text, message = extract_text_from_image(contents)
    return {
        "success": success,
        "extracted_text": extracted_text,
        "filename": file.filename,
        "message": message
    }

@router.post("/bulk-analyze")
async def bulk_analyze(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Processes a CSV file containing advertisement rows for batch analysis.
    Validates CSV headers, prevents server overflow, and returns structured per-row metrics.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a CSV file.")
    
    content_bytes = await file.read()
    text_content = content_bytes.decode("utf-8", errors="replace")
    
    import csv
    import io
    reader = csv.DictReader(io.StringIO(text_content))
    
    rows_processed = []
    errors = []
    
    for idx, row in enumerate(reader):
        if idx >= 50: # sensible limit per batch to prevent denial of service
            break
        
        # Check text in row (support 'content', 'text', 'ad_text')
        text = row.get("content") or row.get("text") or row.get("ad_text") or ""
        text = text.strip()
        if not text:
            errors.append({"row": idx + 1, "error": "Empty text content"})
            continue
        
        url = row.get("submitted_url") or row.get("url") or None
        
        try:
            req = AdAnalyzeRequest(content=text, source_type="csv_batch", submitted_url=url)
            analyzed = analyze_advertisement(req, db)
            rows_processed.append({
                "row": idx + 1,
                "id": analyzed.id,
                "custom_id": analyzed.custom_id,
                "risk_score": analyzed.analysis.risk_score if analyzed.analysis else 0,
                "risk_level": analyzed.analysis.risk_level if analyzed.analysis else "UNKNOWN",
                "preview": text[:80] + ("..." if len(text) > 80 else "")
            })
        except Exception as e:
            errors.append({"row": idx + 1, "error": str(e)})

    return {
        "total_submitted": idx + 1 if 'idx' in locals() else 0,
        "successful_count": len(rows_processed),
        "failed_count": len(errors),
        "results": rows_processed,
        "errors": errors
    }

@router.get("", response_model=dict)
def list_advertisements(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
    review_status: Optional[str] = Query(None),
    is_demo: Optional[bool] = Query(None),
    data_source: Optional[str] = Query(None),
    sort_by: str = Query("created_at"), # created_at, risk_score
    sort_order: str = Query("desc") # desc, asc
):
    """
    Lists advertisement records with full pagination, multi-field search, platform filtering,
    risk filter, status filters, and clear separation of demo vs real data sources.
    """
    query = db.query(Advertisement).join(AnalysisResult, isouter=True)

    if search and search.strip():
        s_clean = search.strip()
        search_pattern = f"%{s_clean}%"
        search_clauses = [
            Advertisement.custom_id.ilike(search_pattern),
            Advertisement.original_text.ilike(search_pattern),
            Advertisement.submitted_url.ilike(search_pattern),
            Advertisement.platform.ilike(search_pattern),
            Advertisement.advertiser_name.ilike(search_pattern),
            Advertisement.external_id.ilike(search_pattern),
            AnalysisResult.risk_level.ilike(search_pattern),
            Advertisement.entities.any(
                or_(
                    ExtractedEntity.entity_value.ilike(search_pattern),
                    ExtractedEntity.normalized_value.ilike(search_pattern)
                )
            )
        ]
        if s_clean.isdigit():
            search_clauses.append(Advertisement.id == int(s_clean))
        query = query.filter(or_(*search_clauses))

    if platform and platform.strip() and platform.lower() != "all":
        query = query.filter(Advertisement.platform.ilike(f"%{platform.strip()}%"))

    if risk_level and risk_level.strip() and risk_level.lower() != "all":
        query = query.filter(AnalysisResult.risk_level == risk_level.upper())

    if review_status and review_status.strip() and review_status.lower() != "all":
        query = query.filter(Advertisement.review_status == review_status.upper())

    if is_demo is not None:
        query = query.filter(Advertisement.is_demo == is_demo)

    if data_source and data_source.strip() and data_source.lower() != "all":
        query = query.filter(Advertisement.data_source == data_source)

    # Sorting
    if sort_by == "risk_score":
        order_col = AnalysisResult.risk_score
    elif sort_by == "id":
        order_col = Advertisement.id
    else:
        order_col = Advertisement.created_at

    if sort_order.lower() == "asc":
        query = query.order_by(asc(order_col))
    else:
        query = query.order_by(desc(order_col))

    total = query.count()
    offset = (page - 1) * limit
    ads = query.offset(offset).limit(limit).all()

    items = []
    for ad in ads:
        top_ents = [
            {"type": e.entity_type, "value": e.entity_value, "norm": e.normalized_value}
            for e in ad.entities[:3]
        ]
        items.append({
            "id": ad.id,
            "custom_id": ad.custom_id,
            "original_text": ad.original_text,
            "source_type": ad.source_type,
            "submitted_url": ad.submitted_url,
            "platform": ad.platform or "Unknown",
            "advertiser_name": ad.advertiser_name,
            "external_id": ad.external_id,
            "is_demo": ad.is_demo,
            "data_source": ad.data_source or ("DATASET_IMPORT" if ad.is_demo else "LIVE_SCAN"),
            "risk_score": ad.analysis.risk_score if ad.analysis else None,
            "risk_level": ad.analysis.risk_level if ad.analysis else None,
            "review_status": ad.review_status,
            "created_at": ad.created_at,
            "entities_count": len(ad.entities),
            "cases_count": len(ad.cases),
            "top_entities": top_ents
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if limit > 0 else 1
    }

@router.get("/sources", response_model=List[dict])
def list_ingestion_sources(db: Session = Depends(get_db)):
    """
    Returns telemetry and authorization status for all intelligence source adapters
    (Meta Ad Library, Telegram, Manual Submissions, Synthetic Datasets).
    """
    statuses = ingestion_service.get_sources_status(db)
    return [s.model_dump() for s in statuses]

@router.post("/ingest", response_model=AdDetailSchema)
def ingest_post_endpoint(payload: IngestPostRequest, db: Session = Depends(get_db)):
    """
    Ingests an ad/post from an external stream, manual payload, or automated crawler.
    Deduplicates and guarantees immediate database persistence.
    """
    post = IngestedPost(
        content=payload.content,
        platform=payload.platform,
        advertiser_name=payload.advertiser_name,
        external_id=payload.external_id,
        submitted_url=payload.submitted_url,
        source_type=payload.source_type,
        data_source=payload.data_source,
        is_demo=payload.is_demo
    )
    ad = ingestion_service.ingest_post(db, post, actor="Analyst")
    return get_advertisement_detail(str(ad.id), db)

@router.post("/sync-source/{adapter_id}")
def sync_source_feed(adapter_id: str, query: Optional[str] = Query(None), limit: int = Query(20, ge=1, le=50), db: Session = Depends(get_db)):
    """
    Triggers an on-demand poll from an external source adapter.
    For unconfigured adapters (e.g. Meta pending token), returns informative diagnostic status.
    """
    adapter = ingestion_service.get_adapter(adapter_id)
    if not adapter:
        raise HTTPException(status_code=404, detail=f"Source adapter '{adapter_id}' not found.")
    
    if not adapter.is_configured:
        raise HTTPException(
            status_code=400,
            detail=f"Source adapter '{adapter.name}' is pending authorization or unconfigured. {adapter.get_status().auth_instructions}"
        )

    try:
        posts = adapter.fetch_posts(query=query, limit=limit)
        ingested_count = 0
        for p in posts:
            ingestion_service.ingest_post(db, p, actor=f"Sync:{adapter_id}")
            ingested_count += 1
        return {
            "status": "success",
            "adapter_id": adapter_id,
            "fetched_count": len(posts),
            "ingested_count": ingested_count,
            "message": f"Successfully ingested {ingested_count} records from {adapter.name}."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync from {adapter.name}: {str(e)}")

@router.get("/live-events")
async def live_events_stream(request: Request):
    """
    Server-Sent Events (SSE) streaming endpoint.
    Emits real-time live events to connected web clients as Telegram messages
    or new surveillance advertisements are persisted.
    """
    async def event_generator():
        q = broadcaster.subscribe()
        try:
            # Initial ping/connection ACK
            yield 'event: connected\ndata: {"status": "listening"}\n\n'
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(q.get(), timeout=12.0)
                    yield f"event: {item['event']}\ndata: {json.dumps(item['data'])}\n\n"
                except asyncio.TimeoutError:
                    # Periodic heartbeat to keep proxy and browser connections alive
                    yield f'event: ping\ndata: {{"timestamp": "{datetime.now(timezone.utc).isoformat()}"}}\n\n'
        finally:
            broadcaster.unsubscribe(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.get("/live-status")
def get_live_feed_status(db: Session = Depends(get_db)):
    """
    Lightweight endpoint returning latest record ID, total count,
    and Telegram adapter status for live monitoring indicators.
    """
    total = db.query(Advertisement).count()
    latest_ad = db.query(Advertisement).order_by(Advertisement.id.desc()).first()
    tg_adapter = ingestion_service.get_adapter("telegram_feed")
    tg_status = tg_adapter.get_status().model_dump() if tg_adapter else None

    return {
        "total_records": total,
        "latest_ad_id": latest_ad.id if latest_ad else 0,
        "latest_custom_id": latest_ad.custom_id if latest_ad else None,
        "latest_created_at": latest_ad.created_at.isoformat() if latest_ad and latest_ad.created_at else None,
        "telegram_status": tg_status
    }

@router.post("/telegram/poll")
async def poll_telegram_channels(db: Session = Depends(get_db)):
    """
    Triggers an immediate poll of configured public Telegram channels,
    ingests any newly detected messages, and returns count of saved records.
    """
    tg_adapter = ingestion_service.get_adapter("telegram_feed")
    if not tg_adapter:
        raise HTTPException(status_code=404, detail="Telegram source adapter not registered.")

    if not tg_adapter.is_configured:
        raise HTTPException(
            status_code=400,
            detail=f"Telegram adapter not configured. {tg_adapter.get_status().auth_instructions}"
        )

    try:
        posts = await tg_adapter.poll_channel_messages_async(limit_per_channel=10)
        persisted = []
        for post in posts:
            ad = ingestion_service.ingest_post(db, post, actor="Telegram:Poller")
            persisted.append(ad.id)

        return {
            "status": "success",
            "fetched_count": len(posts),
            "persisted_count": len(persisted),
            "channels": tg_adapter.get_configured_channels(),
            "message": f"Successfully checked Telegram channels. Ingested {len(persisted)} messages."
        }
    except SourceNotConfiguredException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Telegram poll failed: {str(e)}")

@router.post("/telegram/test-connection")
async def test_telegram_connection():
    """
    Tests MTProto connection and authorization with Telegram servers.
    Safely reports connection state, DC reachability, and authorization without exposing credentials.
    """
    tg_adapter = ingestion_service.get_adapter("telegram_feed")
    if not tg_adapter:
        raise HTTPException(status_code=404, detail="Telegram source adapter not registered.")

    return await tg_adapter.test_connection_async()

@router.get("/{id}", response_model=AdDetailSchema)
def get_advertisement_detail(id: str, db: Session = Depends(get_db)):
    """
    Retrieves full forensic details of a single advertisement by primary integer ID or custom ID.
    """
    if id.isdigit():
        ad = db.query(Advertisement).filter(Advertisement.id == int(id)).first()
    else:
        ad = db.query(Advertisement).filter(Advertisement.custom_id == id).first()

    if not ad:
        raise HTTPException(status_code=404, detail=f"Advertisement with identifier '{id}' not found.")

    # Reconstruct triggered rules and near duplicates
    rule_res = evaluate_rules(ad.normalized_text)
    near_dups = find_near_duplicates(db, ad.normalized_text, exclude_id=ad.id)
    shared_ents = find_shared_entity_matches(
        db,
        [{"entity_type": e.entity_type, "entity_value": e.entity_value, "normalized_value": e.normalized_value} for e in ad.entities],
        exclude_id=ad.id
    )

    related = []
    seen_related = set()
    for nd in near_dups:
        seen_related.add(nd["advertisement_id"])
        related.append({
            "id": nd["advertisement_id"],
            "custom_id": nd["custom_id"],
            "relation_type": f"TEXT_SIMILARITY ({nd['similarity_score']}%)",
            "preview": nd["preview"],
            "review_status": nd["review_status"]
        })
    for se in shared_ents:
        if se["advertisement_id"] not in seen_related:
            seen_related.add(se["advertisement_id"])
            related.append({
                "id": se["advertisement_id"],
                "custom_id": se["custom_id"],
                "relation_type": f"SHARED_{se['shared_entity_type']}: {se['shared_entity_value']}",
                "preview": se["preview"],
                "review_status": se["review_status"]
            })

    cases_linked = []
    for c in ad.cases:
        cases_linked.append({
            "id": c.id,
            "case_ref": c.case_ref,
            "title": c.title,
            "status": c.status,
            "priority": c.priority
        })

    analysis_schema = None
    if ad.analysis:
        analysis_schema = AnalysisResultSchema(
            id=ad.analysis.id,
            risk_score=ad.analysis.risk_score,
            risk_level=ad.analysis.risk_level,
            model_available=ad.analysis.model_available,
            model_signal=ad.analysis.model_signal,
            model_score=ad.analysis.model_score,
            model_version=ad.analysis.model_version,
            model_class=ad.analysis.model_class,
            explanation=ad.analysis.explanation,
            recommended_review_action=ad.analysis.recommended_review_action,
            triggered_rules=rule_res["triggered_rules"],
            suspicious_phrases=rule_res["suspicious_phrases"],
            is_duplicate=False,
            duplicate_of_id=None,
            near_duplicate_matches=near_dups
        )

    # Perform URL analysis
    target_url_detail = ad.submitted_url
    if not target_url_detail:
        for ent in ad.entities:
            if ent.entity_type in ["URL_DOMAIN", "URL"]:
                target_url_detail = ent.entity_value
                break
    url_analysis_detail = analyze_url(target_url_detail) if target_url_detail else None

    return AdDetailSchema(
        id=ad.id,
        custom_id=ad.custom_id,
        original_text=ad.original_text,
        normalized_text=ad.normalized_text,
        source_type=ad.source_type,
        submitted_url=ad.submitted_url,
        platform=ad.platform or "Unknown",
        advertiser_name=ad.advertiser_name,
        external_id=ad.external_id,
        is_demo=ad.is_demo,
        data_source=ad.data_source or ("DATASET_IMPORT" if ad.is_demo else "LIVE_SCAN"),
        content_hash=ad.content_hash,
        review_status=ad.review_status,
        created_at=ad.created_at,
        analysis=analysis_schema,
        evidence_items=ad.evidence_items,
        entities=ad.entities,
        related_ads=related,
        cases=cases_linked,
        url_analysis=url_analysis_detail
    )

@router.patch("/{id}/status")
def update_advertisement_status(id: str, payload: AdStatusUpdateRequest, db: Session = Depends(get_db)):
    """
    Updates the human review disposition of an advertisement.
    Maintains a strict audit event trail for accountable forensics.
    """
    if id.isdigit():
        ad = db.query(Advertisement).filter(Advertisement.id == int(id)).first()
    else:
        ad = db.query(Advertisement).filter(Advertisement.custom_id == id).first()

    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found.")

    old_status = ad.review_status
    ad.review_status = payload.review_status

    db.add(AuditEvent(
        actor=payload.actor or "Analyst",
        action="UPDATE_STATUS",
        entity_type="ADVERTISEMENT",
        entity_id=str(ad.id),
        details=f"Disposition changed from {old_status} to {payload.review_status}. Notes: {payload.notes or 'None'}",
        created_at=datetime.now(timezone.utc)
    ))

    db.commit()
    return {"message": "Status updated successfully", "old_status": old_status, "new_status": ad.review_status}

@router.delete("/{id}")
def delete_advertisement(id: str, db: Session = Depends(get_db)):
    """
    Deletes an advertisement record, associated evidence, and entities.
    """
    if id.isdigit():
        ad = db.query(Advertisement).filter(Advertisement.id == int(id)).first()
    else:
        ad = db.query(Advertisement).filter(Advertisement.custom_id == id).first()

    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found.")

    custom_id = ad.custom_id
    db.delete(ad)
    db.add(AuditEvent(
        actor="Analyst",
        action="DELETE_RECORD",
        entity_type="ADVERTISEMENT",
        entity_id=str(ad.id),
        details=f"Deleted advertisement {custom_id}",
        created_at=datetime.now(timezone.utc)
    ))
    db.commit()
    return {"message": f"Advertisement {custom_id} deleted successfully."}

# =====================================================================
# DATASET IMPORT & LIVE FEED REPLAY ENDPOINTS
# =====================================================================
from app.schemas.schemas import ReplayStartRequest, ReplayStatusSchema
from app.services.dataset_replay_service import dataset_replay_service
from app.services.dataset_import_service import dataset_import_service

@router.get("/replay/status", response_model=ReplayStatusSchema)
def get_replay_status():
    """Returns telemetry and operational state of the live dataset replay engine."""
    return dataset_replay_service.get_status()

@router.post("/replay/start", response_model=ReplayStatusSchema)
async def start_replay(payload: Optional[ReplayStartRequest] = None):
    """
    Starts or resumes continuous live replay of forensic records
    from the JSON/CSV dataset files into the Live Feed.
    """
    source = payload.source if payload else "both"
    interval = payload.interval_seconds if payload else 3.0
    loop = payload.loop if payload else False
    try:
        return await dataset_replay_service.start(source=source, interval_seconds=interval, loop=loop)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/replay/pause", response_model=ReplayStatusSchema)
async def pause_replay():
    """Pauses dataset replay at the current record index."""
    return await dataset_replay_service.pause()

@router.post("/replay/resume", response_model=ReplayStatusSchema)
async def resume_replay():
    """Resumes paused dataset replay."""
    return await dataset_replay_service.resume()

@router.post("/replay/stop", response_model=ReplayStatusSchema)
async def stop_replay():
    """Stops dataset replay."""
    return await dataset_replay_service.stop()

@router.post("/replay/restart", response_model=ReplayStatusSchema)
async def restart_replay(payload: Optional[ReplayStartRequest] = None):
    """Restarts dataset replay from record 0 without duplicating database items."""
    source = payload.source if payload else None
    interval = payload.interval_seconds if payload else None
    return await dataset_replay_service.restart(source=source, interval_seconds=interval)

@router.get("/dataset/info")
def get_dataset_info():
    """
    Returns filesystem locations, schema, record counts, and provenance information
    for the user's JSON and CSV datasets.
    """
    paths = dataset_import_service.locate_datasets()
    records, stats = dataset_import_service.load_dataset(source_type="both")
    sample = records[0] if records else None
    return {
        "paths": paths,
        "stats": stats,
        "sample": {
            "event_id": sample.get("event_id") if sample else None,
            "platform": sample.get("platform") if sample else None,
            "text": sample.get("text")[:100] if sample and sample.get("text") else None,
            "ground_truth": sample.get("ground_truth") if sample else None
        } if sample else None
    }

@router.post("/dataset/import")
def import_dataset(
    source: str = Query(default="both", description="Dataset source: 'both', 'json', or 'csv'"),
    db: Session = Depends(get_db)
):
    """
    Idempotently imports all eligible records from the JSON/CSV datasets
    into the database with ML scoring, entity extraction, and deduplication.
    """
    records, stats = dataset_import_service.load_dataset(source_type=source)
    summary = dataset_import_service.import_records_to_db(db=db, records=records)
    return {
        "status": "success",
        "source": source,
        "dataset_stats": stats,
        "import_summary": summary
    }
