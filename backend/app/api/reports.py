import csv
import io
import html
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Response, Query
from sqlalchemy import or_, desc
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.models import (
    Advertisement, AnalysisResult, Case, Alert, Evidence, ExtractedEntity, InvestigationReport
)

router = APIRouter(prefix="/reports", tags=["Reports & Exports"])

def sanitize_csv_cell(val: Any) -> str:
    """
    Prevents CSV Formula Injection (CWE-1236) by neutralizing
    leading characters that spreadsheet applications interpret as executable formulas (=, +, -, @, tab, cr).
    """
    if val is None:
        return ""
    text = str(val)
    if text and text[0] in ('=', '+', '-', '@', '\t', '\r'):
        return "'" + text
    return text

@router.get("/summary")
def get_reports_summary(db: Session = Depends(get_db)):
    """
    Generates an executive investigative intelligence summary.
    """
    total_ads = db.query(Advertisement).count()
    high_risk = db.query(AnalysisResult).filter(AnalysisResult.risk_level == "HIGH").count()
    med_risk = db.query(AnalysisResult).filter(AnalysisResult.risk_level == "MEDIUM").count()
    low_risk = db.query(AnalysisResult).filter(AnalysisResult.risk_level == "LOW").count()

    total_cases = db.query(Case).count()
    open_cases = db.query(Case).filter(Case.status.in_(["OPEN", "IN_PROGRESS", "ESCALATED"])).count()
    closed_cases = db.query(Case).filter(Case.status == "CLOSED").count()

    return {
        "report_id": f"REP-{datetime.now().strftime('%Y%m%d')}-001",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "classification": "INTERNAL FORENSIC INVESTIGATION REPORT",
        "metrics": {
            "total_advertisements_evaluated": total_ads,
            "risk_distribution": {
                "high_risk": high_risk,
                "medium_risk": med_risk,
                "low_risk": low_risk
            },
            "cases": {
                "total": total_cases,
                "open": open_cases,
                "closed": closed_cases
            }
        },
        "disclaimer": (
            "NOTICE: FraudScope AI scores and findings are investigative signals designed to aid human analysts. "
            "They do not constitute legal proof of criminal activity, certified fraud findings, or verified probabilities of guilt."
        )
    }

@router.get("/export")
def export_advertisements_csv(db: Session = Depends(get_db)):
    """
    Exports all analyzed advertisement records, risk scores, and disposition status
    as a sanitized, downloadable CSV file.
    """
    ads = db.query(Advertisement).order_by(Advertisement.id.asc()).all()

    output = io.StringIO()
    writer = csv.writer(output)

    # Headers
    headers = [
        "Record ID",
        "Source Type",
        "Risk Score (0-100)",
        "Risk Level",
        "Review Status",
        "Submitted URL",
        "Extracted Entities Count",
        "Created At (UTC)",
        "Advertisement Text Preview"
    ]
    writer.writerow(headers)

    for ad in ads:
        risk_score = ad.analysis.risk_score if ad.analysis else ""
        risk_level = ad.analysis.risk_level if ad.analysis else ""
        preview = ad.original_text.replace("\n", " ")[:200]

        row = [
            sanitize_csv_cell(ad.custom_id or ad.id),
            sanitize_csv_cell(ad.source_type),
            sanitize_csv_cell(risk_score),
            sanitize_csv_cell(risk_level),
            sanitize_csv_cell(ad.review_status),
            sanitize_csv_cell(ad.submitted_url or ""),
            sanitize_csv_cell(len(ad.entities)),
            sanitize_csv_cell(ad.created_at.isoformat() if ad.created_at else ""),
            sanitize_csv_cell(preview)
        ]
        writer.writerow(row)

    csv_data = output.getvalue()
    filename = f"fraudscope_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# =====================================================================
# STRUCTURED AI INVESTIGATION REPORT ENDPOINTS
# =====================================================================
import json
from typing import List, Optional
from sqlalchemy import or_, desc
from app.models.models import InvestigationReport
from app.schemas.schemas import (
    InvestigationReportSchema,
    InvestigationReportSummarySchema,
    ReportGenerateRequest
)
from app.services.ai_report_service import ai_report_service

@router.post("/generate", response_model=InvestigationReportSchema)
def generate_ai_report(payload: ReportGenerateRequest, db: Session = Depends(get_db)):
    """
    Generates a complete, evidence-based AI Investigation Report
    for a scanned advertisement, message, or URL target.
    Persists the report into SQLite and returns the full structured dossier.
    """
    # 1. Target is a URL
    if payload.input_type == "url" or (payload.url and not payload.content):
        target_url = (payload.url or "").strip()
        if not target_url:
            raise HTTPException(status_code=400, detail="Target URL cannot be empty for URL report generation.")
        return ai_report_service.generate_report_for_url(db=db, raw_url=target_url, title=payload.title)

    # 2. Target is an existing Advertisement ID
    ad = None
    if payload.advertisement_id:
        ad = db.query(Advertisement).filter(Advertisement.id == payload.advertisement_id).first()
    elif payload.scan_id:
        ad = db.query(Advertisement).filter(
            or_(
                Advertisement.custom_id == payload.scan_id,
                Advertisement.external_id == payload.scan_id
            )
        ).first()

    if ad:
        return ai_report_service.generate_report_for_ad(db=db, ad=ad)

    # 3. Target is fresh text/message content provided directly
    if payload.content and payload.content.strip():
        from app.services.ingestion.base import IngestedPost
        from app.services.ingestion.ingestion_service import ingestion_service

        post = IngestedPost(
            content=payload.content.strip(),
            platform="Manual Scan",
            submitted_url=payload.url.strip() if payload.url else None,
            source_type="manual_scan",
            data_source="MANUAL_SUBMISSION",
            is_demo=False
        )
        new_ad = ingestion_service.ingest_post(db=db, post=post, actor="Investigator")
        return ai_report_service.generate_report_for_ad(db=db, ad=new_ad)

    raise HTTPException(
        status_code=400,
        detail="Please provide an advertisement_id, scan_id, url, or content to generate an investigation report."
    )


@router.get("", response_model=Dict[str, Any])
def list_investigation_reports(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    input_type: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Lists paginated historical AI Investigation Reports with optional search & severity filtering.
    """
    query = db.query(InvestigationReport)

    if severity and severity.lower() != "all":
        query = query.filter(InvestigationReport.severity.ilike(severity))

    if input_type and input_type.lower() != "all":
        query = query.filter(InvestigationReport.input_type.ilike(input_type))

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                InvestigationReport.report_id.ilike(term),
                InvestigationReport.scan_id.ilike(term),
                InvestigationReport.target_summary.ilike(term),
                InvestigationReport.verdict.ilike(term)
            )
        )

    total = query.count()
    items = query.order_by(desc(InvestigationReport.created_at)).offset((page - 1) * limit).limit(limit).all()

    report_items = []
    for r in items:
        report_items.append({
            "id": r.id,
            "report_id": r.report_id,
            "scan_id": r.scan_id,
            "input_type": r.input_type,
            "source_type": r.source_type,
            "target_summary": r.target_summary,
            "verdict": r.verdict,
            "severity": r.severity,
            "risk_score": r.risk_score,
            "created_at": r.created_at.isoformat() if r.created_at else ""
        })

    pages = max(1, (total + limit - 1) // limit)
    return {
        "items": report_items,
        "reports": report_items,
        "total": total,
        "page": page,
        "pages": pages,
        "limit": limit
    }


@router.get("/{report_identifier}", response_model=Dict[str, Any])
def get_investigation_report(report_identifier: str, db: Session = Depends(get_db)):
    """
    Retrieves a single complete AI Investigation Report by its report_id or database integer ID.
    """
    report = None
    if report_identifier.isdigit():
        report = db.query(InvestigationReport).filter(InvestigationReport.id == int(report_identifier)).first()
    if not report:
        report = db.query(InvestigationReport).filter(InvestigationReport.report_id == report_identifier).first()
    if not report:
        # Check by scan_id (custom_id)
        report = db.query(InvestigationReport).filter(InvestigationReport.scan_id == report_identifier).order_by(desc(InvestigationReport.id)).first()

    # If no report generated yet, but an advertisement exists with this custom_id or ID, auto-generate it!
    if not report:
        ad = None
        if report_identifier.isdigit():
            ad = db.query(Advertisement).filter(Advertisement.id == int(report_identifier)).first()
        if not ad:
            ad = db.query(Advertisement).filter(
                or_(
                    Advertisement.custom_id == report_identifier,
                    Advertisement.external_id == report_identifier
                )
            ).first()
        if ad:
            return ai_report_service.generate_report_for_ad(db=db, ad=ad)

        raise HTTPException(status_code=404, detail=f"Investigation report '{report_identifier}' not found.")

    try:
        data = json.loads(report.report_data)
        data["id"] = report.id
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to decode stored report data: {str(e)}")


@router.get("/{report_identifier}/export/json")
def export_report_json(report_identifier: str, db: Session = Depends(get_db)):
    """
    Exports the investigation report as a clean downloadable JSON file.
    """
    report_dict = get_investigation_report(report_identifier, db)
    json_bytes = json.dumps(report_dict, indent=2, ensure_ascii=False).encode("utf-8")
    report_id = report_dict.get("report_id", "report")
    return Response(
        content=json_bytes,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=fraudscope_ai_report_{report_id}.json"}
    )


@router.get("/{report_identifier}/export/html")
def export_report_html(report_identifier: str, db: Session = Depends(get_db)):
    """
    Exports a professional, print-styled HTML document for browser viewing, printing, and saving as PDF.
    """
    r = get_investigation_report(report_identifier, db)
    report_id = html.escape(str(r.get("report_id", "RPT-2026")))
    verdict = html.escape(str(r.get("verdict", "Unknown")))
    severity = html.escape(str(r.get("severity", "Medium")))
    risk_score = float(r.get("risk_score", 0.0))
    target_summary = html.escape(str(r.get("target_summary", "")))
    executive_summary = html.escape(str(r.get("executive_summary", "")))
    created_at = html.escape(str(r.get("created_at", "")))
    provenance_badge = html.escape(str(r.get("provenance", {}).get("provenance_badge", "UNKNOWN")))
    source_type = html.escape(str(r.get("source_type", "")))

    # Indicator rows
    indicators_html = ""
    for ind in r.get("indicators", []):
        ind_name = html.escape(str(ind.get('indicator_name', '')))
        obs_ev = html.escape(str(ind.get('observed_evidence', '')))
        why = html.escape(str(ind.get('why_it_matters', '')))
        sev = html.escape(str(ind.get('severity', '')))
        ver_st = html.escape(str(ind.get('verification_status', '')))
        indicators_html += f"""
        <tr>
            <td style="padding: 8px; border: 1px solid #D9CFBA; font-weight: bold;">{ind_name}</td>
            <td style="padding: 8px; border: 1px solid #D9CFBA; font-family: monospace;">{obs_ev}</td>
            <td style="padding: 8px; border: 1px solid #D9CFBA;">{why}</td>
            <td style="padding: 8px; border: 1px solid #D9CFBA; font-weight: bold;">{sev}</td>
            <td style="padding: 8px; border: 1px solid #D9CFBA;">{ver_st}</td>
        </tr>
        """

    # Actions list
    actions_html = "".join([f"<li style='margin-bottom: 4px;'>{html.escape(str(act))}</li>" for act in r.get("recommended_actions", [])])
    impacts_html = "".join([f"<li style='margin-bottom: 4px;'>{html.escape(str(imp))}</li>" for imp in r.get("potential_impacts", [])])

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>FRAUDSCOPE AI Investigation Report — {report_id}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 40px; background: #FBF7EE; color: #26221D; line-height: 1.5; }}
        .header {{ border-bottom: 2px solid #D9482B; padding-bottom: 16px; margin-bottom: 24px; }}
        .title {{ font-size: 24px; font-weight: bold; color: #26221D; margin: 0; }}
        .subtitle {{ font-size: 13px; color: #6F675B; font-family: monospace; }}
        .badge {{ display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; font-family: monospace; }}
        .badge-critical {{ background: #FDE8E8; color: #A8341C; border: 1px solid #F8B4B6; }}
        .badge-high {{ background: #FEF3D6; color: #8A5A00; border: 1px solid #FCD34D; }}
        .badge-low {{ background: #E6F7F0; color: #1D6B4F; border: 1px solid #A3E3CB; }}
        .section {{ background: #FFFFFF; border: 1px solid #D9CFBA; border-radius: 4px; padding: 20px; margin-bottom: 20px; }}
        .section-title {{ font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #EDE5D3; padding-bottom: 8px; margin-bottom: 14px; color: #2F4B45; }}
        table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
        th {{ background: #F2ECDF; padding: 8px; border: 1px solid #D9CFBA; text-align: left; font-family: monospace; }}
        @media print {{
            body {{ margin: 20px; background: #FFFFFF; }}
            .no-print {{ display: none; }}
        }}
    </style>
</head>
<body>
    <div class="no-print" style="margin-bottom: 16px;">
        <button onclick="window.print()" style="background: #D9482B; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">Print / Save as PDF</button>
    </div>

    <div class="header">
        <h1 class="title">FRAUDSCOPE AI — Forensic Investigation Report</h1>
        <div class="subtitle">REPORT ID: {report_id} | GENERATED: {created_at} | CLASSIFICATION: CONFIDENTIAL / INVESTIGATIVE</div>
    </div>

    <div class="section">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <span class="badge badge-high">{verdict}</span>
                <span style="margin-left: 8px; font-size: 12px; font-family: monospace;">SEVERITY: {severity.upper()}</span>
            </div>
            <div style="font-size: 28px; font-weight: bold; color: #D9482B; font-family: monospace;">
                {risk_score:.0f} <span style="font-size: 14px; color: #6F675B;">/ 100</span>
            </div>
        </div>
        <div style="margin-top: 14px; font-size: 13px;">
            <strong>Target Analyzed:</strong> <span style="font-family: monospace;">{target_summary}</span>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Executive Summary</div>
        <p style="font-size: 13px; line-height: 1.6;">{executive_summary}</p>
    </div>

    <div class="section">
        <div class="section-title">Observed Threat Indicators & Technical Evidence</div>
        <table>
            <thead>
                <tr>
                    <th>Indicator</th>
                    <th>Observed Evidence</th>
                    <th>Forensic Relevance</th>
                    <th>Severity</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                {indicators_html if indicators_html else "<tr><td colspan='5' style='padding: 12px; text-align: center;'>No threat indicators identified.</td></tr>"}
            </tbody>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Recommended Investigative & Defensive Actions</div>
        <ul style="font-size: 13px; padding-left: 20px;">
            {actions_html}
        </ul>
    </div>

    <div class="section">
        <div class="section-title">Potential Infrastructure & Fraud Impacts</div>
        <ul style="font-size: 13px; padding-left: 20px;">
            {impacts_html}
        </ul>
    </div>

    <div class="section" style="font-size: 11px; color: #6F675B; font-family: monospace;">
        <div>DATA PROVENANCE: {provenance_badge} ({source_type})</div>
        <div style="margin-top: 4px;">DISCLAIMER: FraudScope AI findings represent diagnostic and investigative intelligence. Absence of detected patterns does not guarantee safety.</div>
    </div>
</body>
</html>"""

    return Response(content=html_content, media_type="text/html")
