import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, HttpUrl
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.models import Advertisement, AnalysisResult, ExtractedEntity, Case, case_advertisements, AuditEvent
from app.services.url_analysis import analyze_url
from app.services.xray_service import safe_fetch_website_xray

router = APIRouter(prefix="/scanner", tags=["Unified Forensic Scanner"])


class UrlScanRequest(BaseModel):
    url: str
    title: Optional[str] = None
    save_as_case: Optional[bool] = False


class WebsiteXRayRequest(BaseModel):
    url: str
    save_as_case: Optional[bool] = False


@router.post("/url")
def scan_url(payload: UrlScanRequest, db: Session = Depends(get_db)):
    """
    Module 1: Smart URL Scanner
    Validates URL syntax, normalizes hostname, checks for misleading subdomains,
    punycode homographs, shorteners, private/loopback SSRF targets, and deceptive keywords.
    Clearly distinguishes unverified domains from certified safe results.
    """
    raw_url = payload.url.strip() if payload.url else ""
    if not raw_url:
        raise HTTPException(status_code=400, detail="Target URL cannot be empty.")

    analysis = analyze_url(raw_url)
    risk_score = analysis.get("risk_score", 0)

    if risk_score >= 60 or analysis.get("is_ssrf_risk"):
        risk_level = "HIGH"
        verdict = "High-risk URL indicators detected. Potential phishing, credential theft, or infrastructure evasion."
    elif risk_score >= 20:
        risk_level = "MEDIUM"
        verdict = "Suspicious technical properties detected. Exercise caution and verify domain credentials."
    else:
        risk_level = "LOW"
        verdict = "Standard structural properties observed. Note: Domain is unverified against external certificate registries."

    # Document which checks completed vs unavailable
    checks_completed = [
        {"check": "Syntax & Scheme Validation", "status": "COMPLETED", "result": f"Normalized to {analysis.get('normalized_url')}"},
        {"check": "SSRF & IP Range Inspection", "status": "COMPLETED", "result": "Private loopback check passed" if not analysis.get("is_ssrf_risk") else "BLOCKED: Target in restricted IP range"},
        {"check": "Punycode & Homograph Detection", "status": "COMPLETED", "result": "No punycode spoof detected" if "xn--" not in analysis.get("domain", "") else "Punycode domain detected"},
        {"check": "URL Shortener / Obfuscation Check", "status": "COMPLETED", "result": "Direct domain" if "URL Shortener" not in str(analysis.get("heuristics", [])) else "URL Shortener detected"},
        {"check": "Subdomain Depth Analysis", "status": "COMPLETED", "result": f"Analyzed {analysis.get('domain')}"},
        {"check": "Deceptive Phishing Keyword Filter", "status": "COMPLETED", "result": "Pattern evaluation finished"},
    ]

    checks_unavailable = [
        {"check": "Live Domain WHOIS Registrar Query", "status": "UNAVAILABLE", "reason": "WHOIS registry query requires authenticated registrar credentials"},
        {"check": "Commercial Threat Intelligence Feeds", "status": "UNAVAILABLE", "reason": f"External reputation provider is {analysis.get('reputation_provider')}"},
    ]

    recommended_steps = []
    if risk_level == "HIGH":
        recommended_steps = [
            "Block internal domain routing at corporate firewall/DNS.",
            "Inspect full page content via Website X-Ray before opening in sandboxed browser.",
            "Report malicious domain to national CERT / Cyber Crime reporting portal.",
            "File investigation case dossier."
        ]
    elif risk_level == "MEDIUM":
        recommended_steps = [
            "Run Website X-Ray to examine actual text and payment mechanisms.",
            "Verify official organization website through independent search.",
            "Do not enter passwords or financial identifiers on this destination."
        ]
    else:
        recommended_steps = [
            "Proceed with standard digital security precautions.",
            "Run Website X-Ray if link originated from unsolicited SMS, WhatsApp, or Telegram message."
        ]

    response_data = {
        "url": raw_url,
        "normalized_url": analysis.get("normalized_url", raw_url),
        "domain": analysis.get("domain", ""),
        "investigation_title": payload.title or f"URL Scan: {analysis.get('domain')}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "risk_level": risk_level,
        "risk_score": risk_score,
        "is_suspicious": analysis.get("is_suspicious", False),
        "status": analysis.get("status", "unverified"),
        "indicators": analysis.get("heuristics", []),
        "reputation_provider": analysis.get("reputation_provider", "unconfigured"),
        "reputation_status": analysis.get("reputation_status", "check_unavailable"),
        "checks_completed": checks_completed,
        "checks_unavailable": checks_unavailable,
        "recommended_steps": recommended_steps,
        "disclaimer": "FraudScope AI risk assessments are diagnostic signals for investigators. Absence of suspicious patterns does not constitute certified proof of domain legitimacy."
    }

    # Optionally persist as an investigation case
    if payload.save_as_case:
        short_id = uuid.uuid4().hex[:6].upper()
        case_ref = f"CASE-{datetime.now().strftime('%Y')}-{short_id}"
        case = Case(
            case_ref=case_ref,
            title=payload.title or f"URL Investigation: {analysis.get('domain')}",
            description=f"Automated URL analysis for {raw_url}. Risk: {risk_level} (Score: {risk_score}).",
            priority="HIGH" if risk_level == "HIGH" else ("MEDIUM" if risk_level == "MEDIUM" else "LOW"),
            status="OPEN",
            assigned_to="Analyst Alpha"
        )
        db.add(case)
        db.commit()
        response_data["saved_case_ref"] = case_ref
        response_data["saved_case_id"] = case.id

    return response_data


@router.post("/xray")
def inspect_website_xray(payload: WebsiteXRayRequest, db: Session = Depends(get_db)):
    """
    Module 2: Website X-Ray
    Safely fetches and inspects public webpage content with anti-SSRF protections,
    redirect chain revalidation, HTML metadata parsing, ML model scoring, and financial fraud indicator extraction.
    """
    raw_url = payload.url.strip() if payload.url else ""
    if not raw_url:
        raise HTTPException(status_code=400, detail="Target URL cannot be empty.")

    report = safe_fetch_website_xray(raw_url)

    # Optionally save to database if requested
    if payload.save_as_case and report.get("fetch_status") != "SSRF_BLOCKED":
        short_id = uuid.uuid4().hex[:6].upper()
        case_ref = f"CASE-{datetime.now().strftime('%Y')}-{short_id}"
        risk_level = report.get("risk_assessment", {}).get("risk_level", "INCONCLUSIVE")
        case_priority = "HIGH" if risk_level == "HIGH" else ("MEDIUM" if risk_level in ("MEDIUM", "INCONCLUSIVE") else "LOW")
        case = Case(
            case_ref=case_ref,
            title=f"Website X-Ray: {report.get('domain', raw_url)}",
            description=f"Website X-Ray inspection of {raw_url}. Verdict: {report.get('risk_assessment', {}).get('verdict_summary')}",
            priority=case_priority,
            status="OPEN",
            assigned_to="Analyst Alpha"
        )
        db.add(case)
        db.commit()
        report["saved_case_ref"] = case_ref
        report["saved_case_id"] = case.id

    return report
