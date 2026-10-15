"""
FRAUDSCOPE AI — AI Investigation Report Generator Service
==========================================================
Generates detailed, evidence-based, professional AI investigation reports
for URL scans, suspicious messages, and dataset records.
Adheres strictly to factual findings, calibrated severity scales, and transparent
data provenance without fabricating detections or capabilities.
"""

import os
import re
import uuid
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.models import Advertisement, AnalysisResult, Evidence, ExtractedEntity, Case, InvestigationReport
from app.services.text_preprocessing import normalize_text, calculate_content_hash, clean_url_string
from app.services.entity_extraction import extract_entities
from app.services.rule_engine import evaluate_rules
from app.services.model_service import predict_risk, get_model_metadata
from app.services.risk_scoring import calculate_composite_risk
from app.services.url_analysis import analyze_url

logger = logging.getLogger("fraudscope.ai_report")

def get_severity_from_score(score: float) -> str:
    """Standardized severity mapping across backend and frontend."""
    if score >= 80:
        return "Critical"
    elif score >= 60:
        return "High"
    elif score >= 40:
        return "Medium"
    elif score >= 20:
        return "Low"
    return "Informational"

def get_verdict(score: float, indicators: List[Dict[str, Any]], input_type: str, has_sufficient_evidence: bool) -> str:
    """Deterministic verdict based on technical evidence."""
    if not has_sufficient_evidence:
        return "Inconclusive"
    if score >= 60:
        return "Suspicious"
    elif score >= 35:
        return "Likely Suspicious"
    elif score < 20:
        return "No Significant Threat Detected"
    return "Inconclusive"

CATEGORY_INDICATOR_MAP = {
    "ACCOUNT_TAKEOVER": "Suspicious Account Sale / Lease Language",
    "CARD_FRAUD": "Payment Card / PIN Solicitation Pattern",
    "SIM_LINKED_BANKING": "SIM-Linked Banking Infrastructure Pattern",
    "MONEY_LAUNDERING": "Mule Recruitment / Wire Forwarding Pattern",
    "PHISHING": "Credential Phishing / Lure Language",
    "SOCIAL_ENGINEERING": "Urgency / High-Pressure Lure Pattern",
    "EVASION": "Off-Platform Evasion Handle",
    "SUSPICIOUS_URL": "Suspicious URL Structure Heuristic",
    "DATASET_GROUND_TRUTH": "Historical Dataset Ground Truth Label"
}

def calculate_calibrated_confidence(
    evidence_count: int,
    entity_count: int,
    model_prob: Optional[float],
    model_available: bool,
    input_type: str,
    has_sufficient_evidence: bool,
    has_unverified_external_feeds: bool = True
) -> float:
    """
    Computes a calibrated diagnostic confidence score (0.0 to 0.88).
    Never claims 1.0 (100%) certainty because external live KYC / banking core
    and commercial phishing feeds are unconfigured/unavailable in this environment.
    """
    if not has_sufficient_evidence:
        return 0.35

    base = 0.45

    # Statistical margin from decision boundary (0.50)
    ml_contrib = 0.0
    if model_available and model_prob is not None:
        margin = abs(float(model_prob) - 0.5) * 2.0  # 0.0 to 1.0
        ml_contrib = margin * 0.20

    # Rule and entity triangulation (corroborating multiple distinct indicators)
    rule_contrib = min(0.18, evidence_count * 0.03)
    entity_contrib = min(0.08, entity_count * 0.04)

    raw_conf = base + ml_contrib + rule_contrib + entity_contrib

    # Strict epistemic ceiling: since external registrar/KYC feeds are unconfigured,
    # the maximum achievable diagnostic confidence is bounded below 0.88.
    max_ceiling = 0.88 if has_unverified_external_feeds else 0.95
    return round(min(max_ceiling, max(0.25, raw_conf)), 2)

class AiReportService:
    """
    Core engine generating comprehensive, reproducible, and verifiable
    AI Investigation Reports.
    """

    @classmethod
    def generate_report_for_ad(
        cls,
        db: Session,
        ad: Advertisement,
        scan_time: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Generates a complete investigation report from a persisted Advertisement record.
        """
        now = datetime.now(timezone.utc)
        scan_time = scan_time or ad.created_at or now

        analysis = ad.analysis
        risk_score = float(analysis.risk_score) if analysis else 0.0
        severity = get_severity_from_score(risk_score)

        # Determine input type
        if ad.source_type == "url":
            input_type = "url"
        elif ad.data_source in ("DATASET_REPLAY", "SYNTHETIC_DEMO", "DATASET_IMPORT"):
            input_type = "dataset_record"
        else:
            input_type = "message"

        # Safe text preview
        raw_text = ad.original_text or ""
        text_preview = (raw_text[:280] + "...") if len(raw_text) > 280 else raw_text
        target_summary = ad.submitted_url or text_preview or f"Record {ad.custom_id or ad.id}"

        # Indicators assembly - factual, non-exaggerated labeling
        indicators: List[Dict[str, Any]] = []
        for ev in ad.evidence_items:
            is_gt = ev.evidence_type == "DATASET_GROUND_TRUTH"
            is_url = "URL" in ev.evidence_type
            
            # Map technical category to honest indicator name (e.g. pattern observed, not confirmed crime)
            clean_name = CATEGORY_INDICATOR_MAP.get(ev.evidence_type, ev.evidence_type.replace("_", " ").title())
            if not is_gt and not is_url and not clean_name.endswith("Pattern") and not clean_name.endswith("Language"):
                clean_name = f"{clean_name} Pattern"

            indicators.append({
                "indicator_name": clean_name,
                "observed_evidence": ev.matched_text,
                "why_it_matters": ev.description,
                "severity": "Critical" if "CRITICAL" in ev.evidence_type or risk_score >= 80 else ("High" if risk_score >= 60 else "Medium"),
                "evidence_source": "Dataset Label" if is_gt else ("URL Parser" if is_url else "Rule Engine"),
                "verification_status": "Dataset-Provided" if is_gt else "Verified",
                "score_contribution": round(min(30.0, risk_score / max(1, len(ad.evidence_items))), 1)
            })

        # Add entity indicators if relevant
        for ent in ad.entities:
            if ent.entity_type in ("PHONE", "UPI", "TELEGRAM"):
                indicators.append({
                    "indicator_name": f"Extracted {ent.entity_type} Identifier",
                    "observed_evidence": ent.entity_value,
                    "why_it_matters": f"Technical financial or communication contact point extracted from text: '{ent.entity_value}'",
                    "severity": "Medium",
                    "evidence_source": "Entity Extraction",
                    "verification_status": "Verified",
                    "score_contribution": 10.0
                })

        # Model analysis section
        model_meta = get_model_metadata()
        model_analysis = None
        if analysis and analysis.model_available:
            prob = analysis.model_signal
            model_analysis = {
                "model_name": "TF-IDF + Logistic Regression Baseline",
                "model_version": analysis.model_version or model_meta.get("model_version", "fraudscope-v1.0"),
                "prediction": analysis.model_class or ("suspicious" if (prob or 0) >= 0.65 else "safe"),
                "suspicious_probability": round(float(prob), 4) if prob is not None else None,
                "risk_score": float(analysis.risk_score),
                "prediction_threshold": 0.65,
                "detected_patterns": [
                    {"token": ev.matched_text, "type": "rule_pattern", "contribution": 1.0}
                    for ev in ad.evidence_items if ev.evidence_type != "DATASET_GROUND_TRUTH"
                ][:6],
                "important_limitations": [
                    "Model analyzes statistical n-gram token distributions in financial advertisement text.",
                    "Raw probability reflects linguistic similarity to documented fraud templates, not certified guilt.",
                    "External commercial threat intelligence feeds are unconfigured."
                ]
            }

        # URL Analysis section (if target URL present)
        url_analysis = None
        if ad.submitted_url:
            parsed = analyze_url(ad.submitted_url)
            url_analysis = {
                "hostname": parsed.get("domain", ""),
                "domain": parsed.get("domain", ""),
                "https_status": "HTTPS" if "https://" in ad.submitted_url.lower() else "HTTP (Unencrypted)",
                "url_length": len(ad.submitted_url),
                "suspicious_symbols": [h for h in parsed.get("heuristics", []) if "Keyword" in h or "Homograph" in h],
                "is_ip_hostname": parsed.get("is_ssrf_risk", False),
                "subdomains": parsed.get("domain", "").split(".")[:-2] if "." in parsed.get("domain", "") else [],
                "redirect_chain": [],
                "dns_intelligence": "Not evaluated (WHOIS/DNS querying unconfigured)",
                "external_reputation": {
                    "provider": parsed.get("reputation_provider", "unconfigured"),
                    "status": parsed.get("reputation_status", "check_unavailable"),
                    "checked_at": now.isoformat()
                }
            }

        # Detect language patterns (urgency, credentials, impersonation)
        urgency_regex = re.compile(r"\b(urgent|immediately|immediate|right now|locked|suspended|alert|warning|expires|action required|limited time|risk of suspension)\b", re.IGNORECASE)
        cred_regex = re.compile(r"\b(otp|pin|password|cvv|bank account|verify identity|verify account|login credentials|ssn|debit card|credit card)\b", re.IGNORECASE)
        imp_regex = re.compile(r"\b(bank of|rbi|sbi|hdfc|icici|police|cyber cell|security team|support desk|customer care)\b", re.IGNORECASE)

        raw_text = ad.original_text or ""
        urgency_found = list(dict.fromkeys(
            [ev.matched_text for ev in ad.evidence_items if "URGENCY" in ev.evidence_type or "PRESSURE" in ev.evidence_type] +
            urgency_regex.findall(raw_text)
        ))
        cred_found = list(dict.fromkeys(
            [ev.matched_text for ev in ad.evidence_items if "PIN" in ev.matched_text or "OTP" in ev.matched_text or "account" in ev.matched_text.lower()] +
            cred_regex.findall(raw_text)
        ))
        imp_found = list(dict.fromkeys(
            [ev.matched_text for ev in ad.evidence_items if "IMPERSONATION" in ev.evidence_type or "BANK" in ev.evidence_type] +
            imp_regex.findall(raw_text)
        ))

        # Message Analysis section
        message_analysis = {
            "message_text": text_preview,
            "urgency_or_threats": urgency_found,
            "credential_or_payment_requests": cred_found,
            "extracted_links": [ad.submitted_url] if ad.submitted_url else [],
            "extracted_entities": [
                {"type": e.entity_type, "value": e.entity_value}
                for e in ad.entities
            ],
            "impersonation_indicators": imp_found,
            "reasons_for_uncertainty": [
                "Sender identity cannot be cryptographically verified without server handshake.",
                "Short colloquial phrases may exhibit contextual variance across regional dialects."
            ]
        }

        # Risk breakdown
        has_url = bool(ad.submitted_url)
        risk_breakdown = [
            {
                "category": "Message Language & Forensic Rules",
                "score": min(100.0, float(len(ad.evidence_items) * 25)),
                "status": "Evaluated",
                "details": f"{len(ad.evidence_items)} suspicious patterns triggered in message body."
            },
            {
                "category": "AI Baseline Classifier (TF-IDF + LR)",
                "score": round(float((analysis.model_signal or 0.0) * 100), 1) if analysis else 0.0,
                "status": "Evaluated" if (analysis and analysis.model_available) else "Not evaluated",
                "details": f"Model evaluated n-gram feature tokens with signal {((analysis.model_signal or 0.0)*100):.1f}%." if (analysis and analysis.model_available) else "Model unavailable."
            },
            {
                "category": "URL Structure & SSRF Inspection",
                "score": 30.0 if (url_analysis and url_analysis.get("is_ip_hostname")) else (15.0 if has_url else None),
                "status": "Evaluated" if has_url else "Not evaluated",
                "details": "Evaluated host structure, protocol, and loopback risks." if has_url else "No target URL provided."
            },
            {
                "category": "External Threat Intelligence",
                "score": None,
                "status": "Not evaluated",
                "details": "External commercial reputation APIs (VirusTotal/Google Safe Browsing) unconfigured."
            }
        ]

        # Potential Impacts
        potential_impacts = []
        if risk_score >= 60:
            potential_impacts.extend([
                "Money Mule Facilitation: Recruitment of banking infrastructure to route illicit transaction flows (PMLA violation).",
                "Financial Exploitation: Loss of account ownership, debit card seizure, or legal exposure under Cybercrime helpline 1930."
            ])
        if any("UPI" in ev.evidence_type for ev in ad.evidence_items) or any(e.entity_type == "UPI" for e in ad.entities):
            potential_impacts.append("Merchant UPI Laundering: Unauthorized third-party rotation through personal UPI VPA.")
        if any("ATM" in ev.evidence_type for ev in ad.evidence_items) or any("PIN" in ev.matched_text for ev in ad.evidence_items):
            potential_impacts.append("Direct Cash-Out Interception: Unauthorized ATM cash withdrawal using surrendered PIN & SIM.")
        if not potential_impacts:
            potential_impacts.append("No immediate high-severity criminal infrastructure impacts identified.")

        # Recommended actions
        recommended_actions = []
        if risk_score >= 60:
            recommended_actions.extend([
                "Do NOT share bank account numbers, debit cards, PINs, or OTPs under any circumstances.",
                "Preserve chat transcripts and message metadata; report the post to Cyber Crime helpline (1930 / cybercrime.gov.in).",
                "Isolate and escalate this record as an active investigation case."
            ])
        elif risk_score >= 40:
            recommended_actions.extend([
                "Exercise caution and verify the source account independently.",
                "Review complete message context before authorizing any transaction or handle exchange.",
                "Seek secondary forensic review from senior compliance personnel."
            ])
        else:
            recommended_actions.extend([
                "Standard digital hygiene: continue normal operation.",
                "Ensure ongoing surveillance if new contact details emerge from the same channel."
            ])

        # Timeline
        timeline = [
            {"timestamp": scan_time.isoformat(), "event": "Record Ingested", "details": f"Source: {ad.platform} via {ad.data_source}"},
            {"timestamp": scan_time.isoformat(), "event": "Forensic Rule Evaluation", "details": f"{len(ad.evidence_items)} pattern indicators observed"},
            {"timestamp": scan_time.isoformat(), "event": "ML Model Scoring", "details": f"Model signal: {((analysis.model_signal or 0.0)*100):.1f}%"} if analysis else None,
            {"timestamp": now.isoformat(), "event": "AI Investigation Report Generated", "details": f"Verdict: {get_verdict(risk_score, indicators, input_type, True)} ({severity})"}
        ]
        timeline = [t for t in timeline if t is not None]

        # Checks performed vs unavailable
        checks_performed = [
            {"check": "Text Normalization & Tokenization", "status": "COMPLETED", "result": f"{len(ad.normalized_text)} normalized characters"},
            {"check": "Forensic Rule Matching", "status": "COMPLETED", "result": f"{len(ad.evidence_items)} evidence items documented"},
            {"check": "Entity Extraction (Phone/UPI/Handle)", "status": "COMPLETED", "result": f"{len(ad.entities)} technical entities extracted"},
        ]
        if analysis and analysis.model_available:
            checks_performed.append({"check": "TF-IDF Logistic Regression Scoring", "status": "COMPLETED", "result": f"Signal: {((analysis.model_signal or 0.0)*100):.1f}%"})
        if has_url:
            checks_performed.append({"check": "URL Syntax & Anti-SSRF Inspection", "status": "COMPLETED", "result": "Analyzed domain and private range protection"})

        unavailable_checks = [
            {"check": "Live Bank Account KYC Verification", "status": "UNAVAILABLE", "reason": "Requires authorized NPCI/banking core API access"},
            {"check": "Commercial Phishing Feeds (VirusTotal)", "status": "UNAVAILABLE", "reason": "External API keys unconfigured in environment"},
            {"check": "Reverse Phone/UPI Identity Lookup", "status": "UNAVAILABLE", "reason": "Telecom subscriber registry access requires law enforcement warrant"}
        ]

        # Provenance
        provenance = {
            "source_type": ad.source_type,
            "data_source": ad.data_source,
            "is_demo": ad.is_demo,
            "external_id": ad.external_id,
            "custom_id": ad.custom_id,
            "content_hash": ad.content_hash,
            "provenance_badge": "DATASET REPLAY" if ad.data_source == "DATASET_REPLAY" else ("DEMO DATA" if ad.is_demo else "LIVE INVESTIGATION")
        }

        # Executive summary text
        verdict_str = get_verdict(risk_score, indicators, input_type, True)
        exec_summary = (
            f"FraudScope AI performed a multi-layer technical evaluation of a {ad.platform} {input_type.replace('_', ' ')}. "
            f"The final assessment is '{verdict_str}' with an overall risk score of {risk_score:.0f}/100 ({severity} severity). "
            f"Key findings include {len(ad.evidence_items)} forensic rule match(es) and {len(ad.entities)} technical identifier(s). "
            f"{'Baseline ML model confirmed suspicious linguistic patterns with high probability. ' if (analysis and (analysis.model_signal or 0) >= 0.65) else ''}"
            f"Recommended operational action: {recommended_actions[0]}"
        )

        report_id = f"RPT-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

        report_dict = {
            "report_id": report_id,
            "scan_id": ad.custom_id or f"AD-{ad.id}",
            "created_at": now.isoformat(),
            "input_type": input_type,
            "source_type": ad.source_type or "manual_scan",
            "target_summary": target_summary,
            "verdict": verdict_str,
            "severity": severity,
            "risk_score": risk_score,
            "model_probability": round(float(analysis.model_signal), 4) if (analysis and analysis.model_signal is not None) else None,
            "confidence_score": calculate_calibrated_confidence(
                evidence_count=len(ad.evidence_items),
                entity_count=len(ad.entities),
                model_prob=analysis.model_signal if analysis else None,
                model_available=analysis.model_available if analysis else False,
                input_type=input_type,
                has_sufficient_evidence=bool(ad.original_text and len(ad.original_text.strip()) > 10),
                has_unverified_external_feeds=True
            ),
            "scan_status": "Completed",
            "executive_summary": exec_summary,
            "indicators": indicators,
            "model_analysis": model_analysis,
            "url_analysis": url_analysis,
            "message_analysis": message_analysis,
            "risk_breakdown": risk_breakdown,
            "calculation_explanation": (
                "The composite risk score is derived from weighted heuristic pattern triggers, "
                "context-aware ML model probability, and entity risk factors. "
                "Raw model probability is strictly separated from rule contributions."
            ),
            "potential_impacts": potential_impacts,
            "recommended_actions": recommended_actions,
            "evidence_timeline": timeline,
            "checks_performed": checks_performed,
            "unavailable_checks": unavailable_checks,
            "provenance": provenance,
            "limitations": [
                "Diagnostic assessment only: Absence of detected indicators does not certify absolute legitimacy.",
                "Dataset-provided labels represent historical ground truth benchmarks and are preserved separately from model predictions.",
                "Commercial external reputation intelligence was not queried."
            ]
        }

        # Persist report in database
        try:
            db_report = InvestigationReport(
                report_id=report_id,
                scan_id=ad.custom_id or f"AD-{ad.id}",
                advertisement_id=ad.id,
                input_type=input_type,
                source_type=ad.source_type or "manual_scan",
                target_summary=target_summary[:512],
                verdict=verdict_str,
                severity=severity,
                risk_score=risk_score,
                model_probability=report_dict["model_probability"],
                confidence_score=report_dict["confidence_score"],
                status="Completed",
                report_data=json.dumps(report_dict, ensure_ascii=False),
                created_at=now
            )
            db.add(db_report)
            db.commit()
            db.refresh(db_report)
            report_dict["id"] = db_report.id
        except Exception as e:
            logger.error(f"Failed to persist investigation report to DB: {e}")
            db.rollback()

        return report_dict

    @classmethod
    def generate_report_for_url(
        cls,
        db: Session,
        raw_url: str,
        title: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generates an investigation report from a standalone URL scan result.
        """
        now = datetime.now(timezone.utc)
        parsed = analyze_url(raw_url)
        risk_score = float(parsed.get("risk_score", 0.0))
        severity = get_severity_from_score(risk_score)
        is_ssrf = parsed.get("is_ssrf_risk", False)

        has_sufficient_evidence = bool(parsed.get("domain"))
        verdict = get_verdict(risk_score, [], "url", has_sufficient_evidence)
        if is_ssrf:
            verdict = "Suspicious"
            severity = "Critical"

        indicators: List[Dict[str, Any]] = []
        for h in parsed.get("heuristics", []):
            ind_name = "Suspicious URL Structure"
            if "SSRF" in h or "Private" in h or "Loopback" in h or "IP" in h:
                ind_name = "Private / Loopback IP (SSRF Risk)"
            elif "Port" in h:
                ind_name = "Non-Standard Port Heuristic"
            elif "Homograph" in h or "Character" in h:
                ind_name = "Lookalike Domain / Suspicious Encoding"
            elif "Shortener" in h:
                ind_name = "URL Shortener Detected"
            indicators.append({
                "indicator_name": ind_name,
                "observed_evidence": h,
                "why_it_matters": "Direct reference to private/restricted internal IP." if "IP" in ind_name else "Technical structural anomaly in hostname, protocol, or path.",
                "severity": "Critical" if "SSRF" in h or "Private" in h else "High",
                "evidence_source": "URL Parser",
                "verification_status": "Verified",
                "score_contribution": 25.0
            })

        url_analysis = {
            "hostname": parsed.get("domain", ""),
            "domain": parsed.get("domain", ""),
            "https_status": "HTTPS (Transport encrypted; does not certify site legitimacy)" if raw_url.lower().startswith("https://") else "HTTP (Insecure unencrypted transport)",
            "url_length": len(raw_url),
            "suspicious_symbols": [h for h in parsed.get("heuristics", []) if "Keyword" in h or "Homograph" in h],
            "is_ip_hostname": is_ssrf,
            "subdomains": parsed.get("domain", "").split(".")[:-2] if "." in parsed.get("domain", "") else [],
            "redirect_chain": [],
            "dns_intelligence": "Not evaluated (Requires external WHOIS provider)",
            "external_reputation": {
                "provider": parsed.get("reputation_provider", "unconfigured"),
                "status": parsed.get("reputation_status", "check_unavailable"),
                "checked_at": now.isoformat()
            }
        }

        # Text ML Model is not executed on raw URLs without textual copy (per Quality Rule 3)
        model_analysis = {
            "model_name": "TF-IDF + Logistic Regression Baseline",
            "model_version": "fraudscope-context-lr-v2.0",
            "prediction": "not_evaluated",
            "suspicious_probability": None,
            "risk_score": risk_score,
            "prediction_threshold": 0.65,
            "detected_patterns": [],
            "important_limitations": [
                "Notice: Text-classification ML model was NOT applied to this URL.",
                "Model requires body copy/text content and is not validated as a standalone URL classifier.",
                "URL findings reflect static structural heuristics and SSRF mitigation checks."
            ]
        }

        risk_breakdown = [
            {
                "category": "URL Structure & Syntax",
                "score": risk_score,
                "status": "Evaluated",
                "details": f"{len(indicators)} structural indicator(s) identified."
            },
            {
                "category": "Private IP & SSRF Protection",
                "score": 100.0 if is_ssrf else 0.0,
                "status": "Evaluated",
                "details": "Restricted loopback/private range detected." if is_ssrf else "No private IP/metadata endpoint detected."
            },
            {
                "category": "Message Language Analysis",
                "score": None,
                "status": "Not evaluated",
                "details": "Input was a direct URL without post text."
            },
            {
                "category": "External Threat Intelligence",
                "score": None,
                "status": "Not evaluated",
                "details": "Commercial feed credentials unconfigured."
            }
        ]

        potential_impacts = []
        if is_ssrf:
            potential_impacts.append("Server-Side Request Forgery (SSRF): Potential targeting of internal cloud metadata or local microservices.")
        if risk_score >= 40:
            potential_impacts.append("Phishing / Credential Harvesting: Deceptive lookalike landing page designed to intercept user credentials.")
        else:
            potential_impacts.append("Low immediate architectural risk detected based on static syntax analysis.")

        recommended_actions = [
            "Verify the official organization domain through an independent search engine or corporate directory.",
            "Never enter passwords, PINs, or banking credentials on unverified domains.",
            "If suspicious, run Website X-Ray before visiting directly."
        ]

        timeline = [
            {"timestamp": now.isoformat(), "event": "URL Scan Initiated", "details": f"Target: {raw_url}"},
            {"timestamp": now.isoformat(), "event": "Anti-SSRF & Syntax Validation Completed", "details": f"Domain: {parsed.get('domain')}"},
            {"timestamp": now.isoformat(), "event": "AI Investigation Report Generated", "details": f"Verdict: {verdict} ({severity})"}
        ]

        report_id = f"RPT-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

        report_dict = {
            "report_id": report_id,
            "scan_id": f"URL-{uuid.uuid4().hex[:6].upper()}",
            "created_at": now.isoformat(),
            "input_type": "url",
            "source_type": "url_scanner",
            "target_summary": raw_url[:512],
            "verdict": verdict,
            "severity": severity,
            "risk_score": risk_score,
            "model_probability": None,
            "confidence_score": calculate_calibrated_confidence(
                evidence_count=len(indicators),
                entity_count=0,
                model_prob=None,
                model_available=False,
                input_type="url",
                has_sufficient_evidence=has_sufficient_evidence,
                has_unverified_external_feeds=True
            ),
            "scan_status": "Completed",
            "executive_summary": (
                f"FraudScope AI evaluated URL target '{raw_url}'. "
                f"Assessment verdict is '{verdict}' with risk score {risk_score:.0f}/100 ({severity} severity). "
                f"{'Critical SSRF threat detected: Target resides in restricted/private IP range. ' if is_ssrf else ''}"
                f"Recommended action: {recommended_actions[0]}"
            ),
            "indicators": indicators,
            "model_analysis": model_analysis,
            "url_analysis": url_analysis,
            "message_analysis": None,
            "risk_breakdown": risk_breakdown,
            "calculation_explanation": "URL risk score is computed strictly from structural heuristics (protocol, punycode, subdomain depth, and anti-SSRF protections).",
            "potential_impacts": potential_impacts,
            "recommended_actions": recommended_actions,
            "evidence_timeline": timeline,
            "checks_performed": [
                {"check": "URL Syntax & Scheme Normalization", "status": "COMPLETED", "result": f"Normalized: {parsed.get('normalized_url')}"},
                {"check": "Anti-SSRF Loopback/Private IP Filter", "status": "COMPLETED", "result": "Passed" if not is_ssrf else "BLOCKED"}
            ],
            "unavailable_checks": [
                {"check": "Commercial Phishing Feeds (VirusTotal)", "status": "UNAVAILABLE", "reason": "External API keys unconfigured in environment"},
                {"check": "Live WHOIS Registrar Domain Age", "status": "UNAVAILABLE", "reason": "Requires authenticated WHOIS query credentials"}
            ],
            "provenance": {
                "source_type": "url_scanner",
                "data_source": "MANUAL_SUBMISSION",
                "is_demo": False,
                "provenance_badge": "LIVE URL SCAN"
            },
            "limitations": [
                "Static syntax check only: Target webpage was not executed or crawled.",
                "A low risk score on structural checks does not guarantee domain safety.",
                "External threat intelligence feeds were not queried."
            ]
        }

        # Persist report
        try:
            db_report = InvestigationReport(
                report_id=report_id,
                scan_id=report_dict["scan_id"],
                input_type="url",
                source_type="url_scanner",
                target_summary=raw_url[:512],
                verdict=verdict,
                severity=severity,
                risk_score=risk_score,
                model_probability=None,
                confidence_score=report_dict["confidence_score"],
                status="Completed",
                report_data=json.dumps(report_dict, ensure_ascii=False),
                created_at=now
            )
            db.add(db_report)
            db.commit()
            db.refresh(db_report)
            report_dict["id"] = db_report.id
        except Exception as e:
            logger.error(f"Failed to persist URL report to DB: {e}")
            db.rollback()

        return report_dict

ai_report_service = AiReportService()
