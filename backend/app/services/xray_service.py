import re
import socket
import ipaddress
from urllib.parse import urlparse, urljoin
from typing import Dict, Any, List, Tuple, Optional
import httpx

from app.services.url_analysis import is_private_or_loopback_ip, analyze_url
from app.services.model_service import predict_risk
from app.services.rule_engine import evaluate_rules
from app.services.text_preprocessing import normalize_text

MAX_FETCH_SIZE = 1024 * 1024  # 1 MB max response limit
FETCH_TIMEOUT = 5.0           # 5 seconds strict timeout
MAX_REDIRECTS = 3             # 3 hops max, each revalidated

FINANCIAL_FRAUD_PATTERNS = [
    {
        "category": "GUARANTEED_RETURNS",
        "severity": "HIGH",
        "pattern": r"(?i)\b(100%|guaranteed|assured|risk[- ]?free)\s+(return|profit|income|yield|doubling|payout)",
        "explanation": "Unrealistic promise of guaranteed or risk-free financial profits",
    },
    {
        "category": "ADVANCE_FEE_DEPOSIT",
        "severity": "HIGH",
        "pattern": r"(?i)\b(advance\s+fee|processing\s+charge|registration\s+fee|refundable\s+deposit|security\s+deposit)\s+(required|to\s+claim|before\s+withdrawal|mandatory)",
        "explanation": "Requirement for advance fee or upfront deposit prior to payout/loan disbursement",
    },
    {
        "category": "SUSPICIOUS_URGENCY",
        "severity": "MEDIUM",
        "pattern": r"(?i)\b(limited\s+slots?|expires\s+in\s+\d+|last\s+chance|urgent\s+registration|act\s+immediately)\b",
        "explanation": "High-pressure psychological urgency tactics designed to bypass diligence",
    },
    {
        "category": "CREDENTIAL_HARVESTING",
        "severity": "CRITICAL",
        "pattern": r"(?i)\b(enter\s+your\s+otp|share\s+password|netbanking\s+pin|atm\s+pin|upi\s+pin|card\s+cvv)\b",
        "explanation": "Solicitation of confidential banking credentials, PINs, or one-time passwords",
    },
    {
        "category": "UNREGULATED_INVESTMENT",
        "severity": "HIGH",
        "pattern": r"(?i)\b(vip\s+crypto\s+signals?|forex\s+autopilot|trading\s+bot\s+100%|daily\s+double\s+pool)\b",
        "explanation": "Unregistered algorithmic investment scheme or deceptive automated trading claims",
    },
]

def resolve_hostname_ips(hostname: str) -> Tuple[bool, List[str], Optional[str]]:
    """
    Safely resolves a hostname to IPv4/IPv6 addresses and verifies none belong to
    loopback, private, link-local, or cloud metadata IP ranges (Anti-SSRF).
    """
    if not hostname:
        return False, [], "Missing hostname"

    # Pre-check string literals
    if is_private_or_loopback_ip(hostname):
        return False, [hostname], "Hostname resolves to loopback, private RFC-1918, or cloud metadata address"

    resolved_ips = []
    try:
        addr_info = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for entry in addr_info:
            ip_str = entry[4][0]
            if ip_str not in resolved_ips:
                resolved_ips.append(ip_str)
    except socket.gaierror as e:
        return False, [], f"DNS resolution failed: {str(e)}"
    except Exception as e:
        return False, [], f"Resolution error: {str(e)}"

    if not resolved_ips:
        return False, [], "No DNS IP addresses found for hostname"

    # Validate each resolved IP against SSRF boundaries
    for ip_str in resolved_ips:
        if is_private_or_loopback_ip(ip_str):
            return False, resolved_ips, f"Blocked: Resolved IP ({ip_str}) is within private or restricted IP space (SSRF Protection)"

    return True, resolved_ips, None


def extract_html_metadata(html: str) -> Dict[str, Any]:
    """
    Safely extracts title, meta description, meta keywords, and plain text
    using standard regex without executing JavaScript.
    """
    title = ""
    title_match = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
    if title_match:
        title = re.sub(r'\s+', ' ', title_match.group(1)).strip()

    description = ""
    desc_match = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', html, re.IGNORECASE | re.DOTALL)
    if not desc_match:
        desc_match = re.search(r'<meta[^>]+content=["\'](.*?)["\'][^>]+name=["\']description["\']', html, re.IGNORECASE | re.DOTALL)
    if desc_match:
        description = desc_match.group(1).strip()

    # Clean body text: remove scripts, styles, noscript, svg, header/footer tags
    cleaned = re.sub(r'<(script|style|noscript|svg)[^>]*>.*?</\1>', ' ', html, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r'<[^>]+>', ' ', cleaned)
    cleaned = re.sub(r'&[a-zA-Z0-9#]+;', ' ', cleaned)
    plain_text = re.sub(r'\s+', ' ', cleaned).strip()

    # Extract hyperlinks
    href_matches = re.findall(r'<a[^>]+href=["\'](.*?)["\']', html, re.IGNORECASE)
    links = []
    for h in href_matches:
        h = h.strip()
        if h and not h.startswith(('javascript:', 'mailto:', 'tel:', '#')):
            links.append(h)

    return {
        "title": title[:200] if title else "No Title Found",
        "description": description[:500] if description else "No Meta Description",
        "plain_text": plain_text,
        "links": links[:50]
    }


def build_xray_checks(
    ssrf_status: str, ssrf_detail: str,
    dns_status: str, dns_detail: str,
    tls_status: str, tls_detail: str,
    fetch_status: str, fetch_detail: str,
    metadata_status: str, metadata_detail: str,
    rules_status: str, rules_detail: str,
    ml_status: str, ml_detail: str,
    reputation_status: str = "Unavailable",
    reputation_detail: str = "External reputation feeds unconfigured"
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Builds structured check reports adhering to [Passed, Failed, Not Evaluated, Unavailable].
    Also provides legacy checks_completed and checks_unavailable for backwards compatibility.
    """
    all_checks = [
        {"name": "Anti-SSRF & Restricted IP Check", "status": ssrf_status, "details": ssrf_detail},
        {"name": "DNS Hostname Resolution", "status": dns_status, "details": dns_detail},
        {"name": "TLS Certificate & Transport Validation", "status": tls_status, "details": tls_detail},
        {"name": "Sandboxed HTTP Content Fetch (1MB limit)", "status": fetch_status, "details": fetch_detail},
        {"name": "HTML Metadata & Structure Extraction", "status": metadata_status, "details": metadata_detail},
        {"name": "Deceptive Content & Heuristic Pattern Matching", "status": rules_status, "details": rules_detail},
        {"name": "Text ML Fraud Model Inference", "status": ml_status, "details": ml_detail},
        {"name": "Commercial Threat Intelligence Feeds", "status": reputation_status, "details": reputation_detail},
    ]

    checks_completed = []
    checks_unavailable = []

    for c in all_checks:
        if c["status"] in ("Passed", "Failed"):
            checks_completed.append({
                "check": c["name"],
                "status": "COMPLETED",
                "result": f"[{c['status']}] {c['details']}"
            })
        else:
            checks_unavailable.append({
                "check": c["name"],
                "status": c["status"].upper().replace(" ", "_"),
                "reason": c["details"]
            })

    return all_checks, checks_completed, checks_unavailable


def safe_fetch_website_xray(raw_url: str) -> Dict[str, Any]:
    """
    Fetches and inspects a public webpage with strict anti-SSRF defense, redirect re-validation,
    mandatory TLS certificate verification, HTML metadata parsing, ML scoring, and honest
    inconclusive verdict determination when evidence is missing or unreachable.
    """
    raw_url_clean = (raw_url or "").strip()
    if not raw_url_clean:
        return {
            "scan_status": "INCOMPLETE",
            "fetch_status": "INCOMPLETE",
            "url": raw_url_clean,
            "error_detail": "Target URL cannot be empty.",
            "risk_assessment": {
                "risk_score": None,
                "risk_level": "INCONCLUSIVE",
                "verdict": "INCONCLUSIVE",
                "verdict_summary": "Empty URL provided. No scan was performed.",
                "is_conclusive": False,
                "reason_incomplete": "Target URL cannot be empty."
            }
        }

    # 1. Determine requested scheme vs normalized target
    raw_has_scheme = bool(re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*://', raw_url_clean))
    if raw_has_scheme:
        requested_scheme = urlparse(raw_url_clean).scheme.lower()
        target_url = raw_url_clean
    else:
        requested_scheme = "https"
        target_url = f"https://{raw_url_clean}"

    # 2. Run static URL heuristic analysis
    static_url_res = analyze_url(target_url)
    static_url_score = static_url_res.get("risk_score", 0)

    # Check for direct SSRF in static URL
    if static_url_res.get("is_ssrf_risk"):
        checks, c_comp, c_unavail = build_xray_checks(
            ssrf_status="Failed", ssrf_detail="Hostname targets loopback, private RFC-1918, or cloud metadata address",
            dns_status="Not Evaluated", dns_detail="DNS skipped due to immediate SSRF block",
            tls_status="Not Evaluated", tls_detail="Transport aborted due to SSRF risk",
            fetch_status="Not Evaluated", fetch_detail="Fetch aborted due to SSRF boundary",
            metadata_status="Not Evaluated", metadata_detail="No content retrieved",
            rules_status="Not Evaluated", rules_detail="No content retrieved",
            ml_status="Not Evaluated", ml_detail="Inference skipped",
            reputation_status="Unavailable", reputation_detail="External feeds unconfigured"
        )
        return {
            "scan_status": "BLOCKED",
            "fetch_status": "SSRF_BLOCKED",
            "url": raw_url_clean,
            "normalized_url": static_url_res.get("normalized_url", target_url),
            "domain": static_url_res.get("domain", ""),
            "status_code": None,
            "requested_scheme": requested_scheme,
            "actual_transport": "Blocked (SSRF Protection)",
            "tls_status": "NOT_EVALUATED",
            "tls_error": None,
            "resolved_ips": [static_url_res.get("domain", "")],
            "error_detail": "Direct SSRF Risk: Hostname specifies a loopback, private network, or cloud metadata address.",
            "url_analysis": static_url_res,
            "metadata": None,
            "detected_signals": [
                {
                    "category": "SSRF_ATTEMPT",
                    "severity": "CRITICAL",
                    "source_quote": raw_url_clean,
                    "explanation": "Target URL attempts access to private internal infrastructure or cloud hypervisor metadata"
                }
            ],
            "ml_analysis": None,
            "checks": checks,
            "checks_completed": c_comp,
            "checks_unavailable": c_unavail,
            "risk_assessment": {
                "risk_score": 95,
                "risk_level": "HIGH",
                "verdict": "BLOCKED",
                "verdict_summary": "Access blocked: URL targets internal or restricted IP range (SSRF vector).",
                "is_conclusive": True,
                "reason_incomplete": None,
                "calculation_breakdown": {
                    "static_url_heuristics_score": 95,
                    "content_signals_score": 0,
                    "ml_classifier_score": 0,
                }
            }
        }

    parsed = urlparse(target_url)
    hostname = (parsed.hostname or "").lower()

    # 3. DNS Resolution & Anti-SSRF verification on resolved IPs
    is_safe, resolved_ips, ssrf_err = resolve_hostname_ips(hostname)
    if not is_safe:
        is_ssrf_violation = bool(resolved_ips and any(is_private_or_loopback_ip(ip) for ip in resolved_ips))
        if is_ssrf_violation or (ssrf_err and "SSRF" in ssrf_err):
            # Target resolved to an internal/restricted IP
            checks, c_comp, c_unavail = build_xray_checks(
                ssrf_status="Failed", ssrf_detail=ssrf_err or "Resolved to restricted IP address",
                dns_status="Passed", dns_detail=f"Resolved to {resolved_ips[0]} (Restricted)",
                tls_status="Not Evaluated", tls_detail="Transport aborted due to SSRF boundary",
                fetch_status="Not Evaluated", fetch_detail="Fetch aborted due to SSRF boundary",
                metadata_status="Not Evaluated", metadata_detail="No content retrieved",
                rules_status="Not Evaluated", rules_detail="No content retrieved",
                ml_status="Not Evaluated", ml_detail="Inference skipped",
                reputation_status="Unavailable", reputation_detail="External feeds unconfigured"
            )
            return {
                "scan_status": "BLOCKED",
                "fetch_status": "SSRF_BLOCKED",
                "url": raw_url_clean,
                "normalized_url": target_url,
                "domain": hostname,
                "status_code": None,
                "requested_scheme": requested_scheme,
                "actual_transport": "Blocked (SSRF Protection)",
                "tls_status": "NOT_EVALUATED",
                "tls_error": None,
                "resolved_ips": resolved_ips,
                "error_detail": ssrf_err or "Resolved IP within restricted range (SSRF)",
                "url_analysis": static_url_res,
                "metadata": None,
                "detected_signals": [
                    {
                        "category": "SSRF_ATTEMPT",
                        "severity": "CRITICAL",
                        "source_quote": raw_url_clean,
                        "explanation": f"Target host resolved to restricted internal address: {ssrf_err}"
                    }
                ],
                "ml_analysis": None,
                "checks": checks,
                "checks_completed": c_comp,
                "checks_unavailable": c_unavail,
                "risk_assessment": {
                    "risk_score": 95,
                    "risk_level": "HIGH",
                    "verdict": "BLOCKED",
                    "verdict_summary": f"Access blocked: {ssrf_err}",
                    "is_conclusive": True,
                    "reason_incomplete": None,
                    "calculation_breakdown": {
                        "static_url_heuristics_score": 95,
                        "content_signals_score": 0,
                        "ml_classifier_score": 0,
                    }
                }
            }
        else:
            # Genuine DNS Resolution Failure
            checks, c_comp, c_unavail = build_xray_checks(
                ssrf_status="Not Evaluated", ssrf_detail="Could not evaluate IPs; host resolution failed",
                dns_status="Failed", dns_detail=ssrf_err or "DNS resolution failed",
                tls_status="Not Evaluated", tls_detail="Host could not be reached",
                fetch_status="Not Evaluated", fetch_detail="No HTTP connection possible",
                metadata_status="Not Evaluated", metadata_detail="No content retrieved",
                rules_status="Not Evaluated", rules_detail="No content retrieved",
                ml_status="Not Evaluated", ml_detail="Inference skipped",
                reputation_status="Unavailable", reputation_detail="External feeds unconfigured"
            )
            return {
                "scan_status": "INCOMPLETE",
                "fetch_status": "INCOMPLETE",
                "url": raw_url_clean,
                "normalized_url": target_url,
                "domain": hostname,
                "status_code": None,
                "requested_scheme": requested_scheme,
                "actual_transport": "Unreachable (DNS Resolution Failed)",
                "tls_status": "NOT_EVALUATED",
                "tls_error": None,
                "resolved_ips": [],
                "error_detail": f"DNS resolution failed: {ssrf_err}",
                "url_analysis": static_url_res,
                "metadata": None,
                "detected_signals": [],
                "ml_analysis": None,
                "checks": checks,
                "checks_completed": c_comp,
                "checks_unavailable": c_unavail,
                "risk_assessment": {
                    "risk_score": None,
                    "provisional_risk_score": static_url_score,
                    "risk_level": "INCONCLUSIVE",
                    "verdict": "INCONCLUSIVE",
                    "verdict_summary": f"Analysis incomplete: DNS resolution failed ({ssrf_err}). Target server is non-existent or unreachable. Evidence is insufficient to verify site safety.",
                    "is_conclusive": False,
                    "reason_incomplete": f"DNS resolution failed: {ssrf_err}",
                    "calculation_breakdown": {
                        "static_url_heuristics_score": static_url_score,
                        "content_signals_score": None,
                        "ml_classifier_score": None,
                    }
                }
            }

    redirect_chain = [target_url]
    current_url = target_url
    response_body = ""
    status_code = None
    headers_dict = {}

    # 4. Controlled fetch with verified TLS and redirect re-validation
    try:
        # verify=True ensures real TLS certificate verification (never disabled)
        with httpx.Client(timeout=FETCH_TIMEOUT, follow_redirects=False, verify=True) as client:
            for hop in range(MAX_REDIRECTS + 1):
                cur_parsed = urlparse(current_url)
                cur_host = (cur_parsed.hostname or "").lower()

                # Re-validate IP on every hop (Anti-SSRF)
                hop_safe, hop_ips, hop_err = resolve_hostname_ips(cur_host)
                if not hop_safe:
                    is_hop_ssrf = bool(hop_ips and any(is_private_or_loopback_ip(ip) for ip in hop_ips))
                    if is_hop_ssrf or (hop_err and "SSRF" in hop_err):
                        checks, c_comp, c_unavail = build_xray_checks(
                            ssrf_status="Failed", ssrf_detail=f"Redirect hop {hop + 1} targets private IP: {hop_err}",
                            dns_status="Passed", dns_detail=f"Resolved hop host {cur_host}",
                            tls_status="Not Evaluated", tls_detail="Redirect aborted due to SSRF",
                            fetch_status="Not Evaluated", fetch_detail="Redirect aborted",
                            metadata_status="Not Evaluated", metadata_detail="No content retrieved",
                            rules_status="Not Evaluated", rules_detail="No content retrieved",
                            ml_status="Not Evaluated", ml_detail="Inference skipped"
                        )
                        return {
                            "scan_status": "BLOCKED",
                            "fetch_status": "SSRF_BLOCKED",
                            "url": raw_url_clean,
                            "normalized_url": current_url,
                            "domain": cur_host,
                            "status_code": None,
                            "requested_scheme": requested_scheme,
                            "actual_transport": "Blocked (SSRF Protection)",
                            "tls_status": "NOT_EVALUATED",
                            "tls_error": None,
                            "resolved_ips": hop_ips,
                            "error_detail": f"Redirect hop {hop + 1} blocked by SSRF filter: {hop_err}",
                            "redirect_chain": redirect_chain,
                            "url_analysis": static_url_res,
                            "metadata": None,
                            "detected_signals": [
                                {
                                    "category": "SSRF_ATTEMPT",
                                    "severity": "CRITICAL",
                                    "source_quote": current_url,
                                    "explanation": f"Redirect destination targeted restricted address space ({cur_host})"
                                }
                            ],
                            "ml_analysis": None,
                            "checks": checks,
                            "checks_completed": c_comp,
                            "checks_unavailable": c_unavail,
                            "risk_assessment": {
                                "risk_score": 85,
                                "risk_level": "HIGH",
                                "verdict": "BLOCKED",
                                "verdict_summary": f"Redirect chain redirected to an unsafe private IP address ({cur_host}).",
                                "is_conclusive": True,
                                "reason_incomplete": None,
                            }
                        }
                    else:
                        # Redirect DNS failed
                        checks, c_comp, c_unavail = build_xray_checks(
                            ssrf_status="Passed", ssrf_detail="Initial target passed SSRF checks",
                            dns_status="Failed", dns_detail=f"Redirect hop {hop + 1} ({cur_host}) DNS failed: {hop_err}",
                            tls_status="Not Evaluated", tls_detail="Host unreachable",
                            fetch_status="Failed", fetch_detail="Redirect host DNS failed",
                            metadata_status="Not Evaluated", metadata_detail="No content retrieved",
                            rules_status="Not Evaluated", rules_detail="No content retrieved",
                            ml_status="Not Evaluated", ml_detail="Inference skipped"
                        )
                        return {
                            "scan_status": "INCOMPLETE",
                            "fetch_status": "INCOMPLETE",
                            "url": raw_url_clean,
                            "normalized_url": current_url,
                            "domain": cur_host,
                            "status_code": None,
                            "requested_scheme": requested_scheme,
                            "actual_transport": "Unreachable (Redirect DNS Failure)",
                            "tls_status": "NOT_EVALUATED",
                            "tls_error": None,
                            "resolved_ips": hop_ips,
                            "error_detail": f"Redirect hop {hop + 1} failed DNS resolution: {hop_err}",
                            "redirect_chain": redirect_chain,
                            "url_analysis": static_url_res,
                            "metadata": None,
                            "detected_signals": [],
                            "ml_analysis": None,
                            "checks": checks,
                            "checks_completed": c_comp,
                            "checks_unavailable": c_unavail,
                            "risk_assessment": {
                                "risk_score": None,
                                "provisional_risk_score": static_url_score,
                                "risk_level": "INCONCLUSIVE",
                                "verdict": "INCONCLUSIVE",
                                "verdict_summary": f"Analysis incomplete: Redirect destination '{cur_host}' failed DNS resolution. Evidence is insufficient to determine site safety.",
                                "is_conclusive": False,
                                "reason_incomplete": f"Redirect hop {hop + 1} DNS failed: {hop_err}",
                            }
                        }

                resp = client.get(
                    current_url,
                    headers={
                        "User-Agent": "FraudScope-Forensic-Scanner/2.0 (+https://fraudscope.internal/bot; verification-scanner)",
                        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
                    }
                )
                status_code = resp.status_code
                headers_dict = dict(resp.headers)

                # Handle redirect
                if resp.is_redirect and "location" in resp.headers:
                    next_loc = resp.headers["location"]
                    next_url = urljoin(current_url, next_loc)
                    if not (next_url.startswith("http://") or next_url.startswith("https://")):
                        break
                    current_url = next_url
                    redirect_chain.append(current_url)
                    continue

                # Finished redirect chain or non-redirect response
                content_bytes = resp.content[:MAX_FETCH_SIZE]
                response_body = content_bytes.decode("utf-8", errors="replace")
                break

    except httpx.ConnectError as e:
        err_str = str(e)
        # Check if error is specifically an SSL / TLS verification error
        is_tls_error = (
            "CERTIFICATE_VERIFY_FAILED" in err_str or
            "certificate verify failed" in err_str.lower() or
            "hostname mismatch" in err_str.lower() or
            "self-signed certificate" in err_str.lower() or
            "certificate has expired" in err_str.lower() or
            "sslv3 alert" in err_str.lower()
        )

        if is_tls_error:
            # Extract clean verified TLS error description
            tls_err_clean = err_str
            match = re.search(r'certificate verify failed:\s*([^\(\n\r]+)', err_str, re.IGNORECASE)
            if match:
                tls_err_clean = f"certificate verify failed: {match.group(1).strip()}"
            elif "hostname mismatch" in err_str.lower():
                h_match = re.search(r'Hostname mismatch[^\(\n\r]+', err_str, re.IGNORECASE)
                tls_err_clean = h_match.group(0).strip() if h_match else "Hostname mismatch"

            checks, c_comp, c_unavail = build_xray_checks(
                ssrf_status="Passed", ssrf_detail=f"Validated destination IP ({resolved_ips[0] if resolved_ips else 'N/A'})",
                dns_status="Passed", dns_detail=f"Resolved {hostname} to {resolved_ips[0] if resolved_ips else 'IP'}",
                tls_status="Failed", tls_detail=tls_err_clean,
                fetch_status="Not Evaluated", fetch_detail="Fetch aborted to prevent insecure communication",
                metadata_status="Not Evaluated", metadata_detail="No content retrieved due to TLS rejection",
                rules_status="Not Evaluated", rules_detail="No content retrieved",
                ml_status="Not Evaluated", ml_detail="Inference skipped",
                reputation_status="Unavailable", reputation_detail="External feeds unconfigured"
            )

            tls_signal = {
                "category": "INVALID_TLS_CERTIFICATE",
                "severity": "HIGH",
                "source_quote": raw_url_clean,
                "context": "TLS / Transport Security Validation",
                "explanation": f"TLS certificate validation failed: {tls_err_clean}. Remote host certificate is invalid, self-signed, expired, or mismatched."
            }

            return {
                "scan_status": "INCOMPLETE",
                "fetch_status": "INCOMPLETE",
                "url": raw_url_clean,
                "normalized_url": current_url,
                "domain": hostname,
                "status_code": None,
                "requested_scheme": requested_scheme,
                "actual_transport": "HTTPS (Certificate Invalid)",
                "tls_status": "FAILED",
                "tls_error": tls_err_clean,
                "resolved_ips": resolved_ips,
                "redirect_chain": redirect_chain,
                "error_detail": f"TLS Certificate Validation Failed: {tls_err_clean}",
                "url_analysis": static_url_res,
                "metadata": None,
                "detected_signals": [tls_signal],
                "ml_analysis": None,
                "checks": checks,
                "checks_completed": c_comp,
                "checks_unavailable": c_unavail,
                "risk_assessment": {
                    "risk_score": None,
                    "provisional_risk_score": max(45, static_url_score),
                    "risk_level": "INCONCLUSIVE",
                    "verdict": "INCONCLUSIVE",
                    "verdict_summary": f"Analysis incomplete: Remote host presented an invalid TLS certificate ({tls_err_clean}). Webpage content was not retrieved to prevent insecure communication. Evidence is insufficient to verify site safety.",
                    "is_conclusive": False,
                    "reason_incomplete": f"TLS certificate validation failed: {tls_err_clean}",
                    "calculation_breakdown": {
                        "static_url_heuristics_score": static_url_score,
                        "content_signals_score": None,
                        "ml_classifier_score": None,
                    }
                }
            }
        else:
            # Generic connection error (e.g. Connection Refused, No route to host)
            checks, c_comp, c_unavail = build_xray_checks(
                ssrf_status="Passed", ssrf_detail="Anti-SSRF check passed",
                dns_status="Passed", dns_detail=f"Resolved {hostname} to {resolved_ips[0] if resolved_ips else 'IP'}",
                tls_status="Unavailable", tls_detail="Connection failed before TLS negotiation",
                fetch_status="Failed", fetch_detail=f"TCP connection failed: {err_str}",
                metadata_status="Not Evaluated", metadata_detail="No content retrieved",
                rules_status="Not Evaluated", rules_detail="No content retrieved",
                ml_status="Not Evaluated", ml_detail="Inference skipped",
                reputation_status="Unavailable", reputation_detail="External feeds unconfigured"
            )
            return {
                "scan_status": "INCOMPLETE",
                "fetch_status": "INCOMPLETE",
                "url": raw_url_clean,
                "normalized_url": current_url,
                "domain": hostname,
                "status_code": None,
                "requested_scheme": requested_scheme,
                "actual_transport": "HTTPS (Connection Failed)" if current_url.startswith("https") else "HTTP (Connection Failed)",
                "tls_status": "UNVERIFIED",
                "tls_error": f"Connection failed: {err_str}",
                "resolved_ips": resolved_ips,
                "redirect_chain": redirect_chain,
                "error_detail": f"Connection error: {err_str}",
                "url_analysis": static_url_res,
                "metadata": None,
                "detected_signals": [],
                "ml_analysis": None,
                "checks": checks,
                "checks_completed": c_comp,
                "checks_unavailable": c_unavail,
                "risk_assessment": {
                    "risk_score": None,
                    "provisional_risk_score": static_url_score,
                    "risk_level": "INCONCLUSIVE",
                    "verdict": "INCONCLUSIVE",
                    "verdict_summary": f"Analysis incomplete: Connection to remote host failed ({err_str}). Evidence is insufficient to verify site safety.",
                    "is_conclusive": False,
                    "reason_incomplete": f"Connection failed: {err_str}",
                }
            }

    except httpx.TimeoutException:
        checks, c_comp, c_unavail = build_xray_checks(
            ssrf_status="Passed", ssrf_detail=f"Destination IP ({resolved_ips[0] if resolved_ips else 'N/A'}) passed SSRF checks",
            dns_status="Passed", dns_detail=f"Resolved {hostname} to {resolved_ips[0] if resolved_ips else 'IP'}",
            tls_status="Unavailable", tls_detail=f"Connection timed out before TLS handshake could complete ({FETCH_TIMEOUT}s)",
            fetch_status="Failed", fetch_detail=f"HTTP connection timed out after {FETCH_TIMEOUT}s",
            metadata_status="Not Evaluated", metadata_detail="No content retrieved due to timeout",
            rules_status="Not Evaluated", rules_detail="No content retrieved",
            ml_status="Not Evaluated", ml_detail="Inference skipped",
            reputation_status="Unavailable", reputation_detail="External feeds unconfigured"
        )
        return {
            "scan_status": "INCOMPLETE",
            "fetch_status": "INCOMPLETE",
            "url": raw_url_clean,
            "normalized_url": current_url,
            "domain": hostname,
            "status_code": None,
            "requested_scheme": requested_scheme,
            "actual_transport": "HTTPS (Connection Incomplete)" if current_url.startswith("https") else "HTTP (Connection Incomplete)",
            "tls_status": "UNVERIFIED",
            "tls_error": f"Connection timed out before TLS handshake could be completed ({FETCH_TIMEOUT}s)",
            "resolved_ips": resolved_ips,
            "redirect_chain": redirect_chain,
            "error_detail": f"Connection timed out after {FETCH_TIMEOUT}s. Target server is unreachable or unresponsive.",
            "url_analysis": static_url_res,
            "metadata": None,
            "detected_signals": [],
            "ml_analysis": None,
            "checks": checks,
            "checks_completed": c_comp,
            "checks_unavailable": c_unavail,
            "risk_assessment": {
                "risk_score": None,
                "provisional_risk_score": static_url_score,
                "risk_level": "INCONCLUSIVE",
                "verdict": "INCONCLUSIVE",
                "verdict_summary": f"Analysis incomplete: Remote host timed out after {FETCH_TIMEOUT}s. Webpage content could not be inspected. Evidence is insufficient to determine site safety.",
                "is_conclusive": False,
                "reason_incomplete": f"Connection timed out after {FETCH_TIMEOUT}s. Target server is unreachable or unresponsive.",
                "calculation_breakdown": {
                    "static_url_heuristics_score": static_url_score,
                    "content_signals_score": None,
                    "ml_classifier_score": None,
                }
            }
        }
    except Exception as e:
        checks, c_comp, c_unavail = build_xray_checks(
            ssrf_status="Passed", ssrf_detail="Anti-SSRF check passed",
            dns_status="Passed", dns_detail=f"Resolved {hostname}",
            tls_status="Unavailable", tls_detail=f"Fetch error: {str(e)}",
            fetch_status="Failed", fetch_detail=f"HTTP fetch error: {str(e)}",
            metadata_status="Not Evaluated", metadata_detail="No content retrieved",
            rules_status="Not Evaluated", rules_detail="No content retrieved",
            ml_status="Not Evaluated", ml_detail="Inference skipped",
            reputation_status="Unavailable", reputation_detail="External feeds unconfigured"
        )
        return {
            "scan_status": "INCOMPLETE",
            "fetch_status": "INCOMPLETE",
            "url": raw_url_clean,
            "normalized_url": current_url,
            "domain": hostname,
            "status_code": status_code,
            "requested_scheme": requested_scheme,
            "actual_transport": "HTTPS (Fetch Incomplete)" if current_url.startswith("https") else "HTTP (Fetch Incomplete)",
            "tls_status": "UNVERIFIED",
            "tls_error": f"HTTP fetch error: {str(e)}",
            "resolved_ips": resolved_ips,
            "redirect_chain": redirect_chain,
            "error_detail": f"HTTP fetch error: {str(e)}",
            "url_analysis": static_url_res,
            "metadata": None,
            "detected_signals": [],
            "ml_analysis": None,
            "checks": checks,
            "checks_completed": c_comp,
            "checks_unavailable": c_unavail,
            "risk_assessment": {
                "risk_score": None,
                "provisional_risk_score": static_url_score,
                "risk_level": "INCONCLUSIVE",
                "verdict": "INCONCLUSIVE",
                "verdict_summary": f"Analysis incomplete: Could not retrieve webpage content ({str(e)}). Evidence is insufficient to verify site safety.",
                "is_conclusive": False,
                "reason_incomplete": f"HTTP fetch error: {str(e)}",
            }
        }

    # 5. Extract webpage metadata and body text
    meta = extract_html_metadata(response_body)
    plain_text = meta["plain_text"]
    title = meta["title"]
    description = meta["description"]

    # 6. ML Model evaluation on visible webpage text
    sample_text = f"{title}. {description}. {plain_text[:1200]}"
    norm_sample = normalize_text(sample_text)
    model_avail, model_prob, model_class, model_version, model_tokens = predict_risk(norm_sample)

    # 7. Financial Fraud Pattern matching
    detected_signals: List[Dict[str, Any]] = []
    signals_score = 0

    for rule in FINANCIAL_FRAUD_PATTERNS:
        matches = re.finditer(rule["pattern"], plain_text)
        for m in matches:
            quote = m.group(0)
            start = max(0, m.start() - 40)
            end = min(len(plain_text), m.end() + 40)
            context_snippet = plain_text[start:end].strip()

            detected_signals.append({
                "category": rule["category"],
                "severity": rule["severity"],
                "source_quote": quote,
                "context": f"...{context_snippet}...",
                "explanation": rule["explanation"]
            })
            if rule["severity"] == "CRITICAL":
                signals_score += 40
            elif rule["severity"] == "HIGH":
                signals_score += 25
            else:
                signals_score += 15
            break

    # Rule engine evaluation
    rule_results = evaluate_rules(norm_sample)
    for tr in rule_results.get("triggered_rules", []):
        detected_signals.append({
            "category": tr["category"],
            "severity": tr["severity"],
            "source_quote": ", ".join(tr["matched_phrases"]),
            "context": f"Rule: {tr['rule_name']}",
            "explanation": tr["description"]
        })
        signals_score += tr["score"]

    # 8. Discrepancy checks: brand name claimed vs actual domain
    trusted_brands = ["sbi", "hdfc", "icici", "rbi", "paytm", "phonepe", "googlepay"]
    title_lower = title.lower()
    for brand in trusted_brands:
        if brand in title_lower and brand not in hostname:
            detected_signals.append({
                "category": "BRAND_IMPERSONATION_MISMATCH",
                "severity": "CRITICAL",
                "source_quote": f"Title mentions '{brand.upper()}' on third-party domain '{hostname}'",
                "context": f"Page Title: {title}",
                "explanation": f"Page title claims official association with {brand.upper()}, but the host domain is unverified ({hostname})."
            })
            signals_score += 45
            break

    # 9. Calculate Composite Risk
    url_score = static_url_score
    ml_score = int((model_prob or 0.0) * 100) if model_avail else 0

    composite_score = min(100, int((url_score * 0.25) + (signals_score * 0.45) + (ml_score * 0.30)))

    if composite_score >= 60:
        risk_level = "HIGH"
        verdict = "Multiple high-risk indicators detected: deceptive claims, financial triggers, or credential requests."
    elif composite_score >= 30:
        risk_level = "MEDIUM"
        verdict = "Moderate risk signals detected on webpage. Analyst review recommended before user interaction."
    else:
        risk_level = "LOW"
        verdict = "No explicit deceptive financial indicators detected in accessible page content. Domain remains subject to ongoing surveillance."

    # Identify external domains linked
    external_domains = set()
    for lk in meta["links"]:
        try:
            l_parsed = urlparse(urljoin(target_url, lk))
            l_host = (l_parsed.hostname or "").lower()
            if l_host and l_host != hostname:
                external_domains.add(l_host)
        except Exception:
            pass

    # Transport classification
    is_tls = current_url.startswith("https://")
    actual_transport = "HTTPS (TLS Verified)" if is_tls else "HTTP (Unencrypted)"
    tls_status = "VERIFIED" if is_tls else "NOT_APPLICABLE"

    checks, c_comp, c_unavail = build_xray_checks(
        ssrf_status="Passed", ssrf_detail=f"Destination IP ({resolved_ips[0] if resolved_ips else 'N/A'}) passed SSRF checks",
        dns_status="Passed", dns_detail=f"Resolved {hostname} to {resolved_ips[0] if resolved_ips else 'IP'}",
        tls_status="Passed" if is_tls else "Not Evaluated", tls_detail="TLS certificate verified with valid root trust chain" if is_tls else "HTTP scheme requested (no TLS certificate)",
        fetch_status="Passed", fetch_detail=f"HTTP status {status_code}, {len(response_body)} bytes retrieved",
        metadata_status="Passed", metadata_detail=f"Extracted title ('{title[:35]}...'), meta description, and {len(meta['links'])} links",
        rules_status="Passed", rules_detail=f"Heuristic scan completed ({len(detected_signals)} signals identified)",
        ml_status="Passed" if model_avail else "Not Evaluated", ml_detail=f"Model probability: {round(model_prob or 0.0, 4)} ({model_class})" if model_avail else "Model unavailable",
        reputation_status="Unavailable", reputation_detail="External feeds unconfigured"
    )

    return {
        "scan_status": "SUCCESS",
        "fetch_status": "SUCCESS",
        "url": raw_url_clean,
        "normalized_url": current_url,
        "domain": hostname,
        "status_code": status_code,
        "requested_scheme": requested_scheme,
        "actual_transport": actual_transport,
        "tls_status": tls_status,
        "tls_error": None,
        "resolved_ips": resolved_ips,
        "redirect_chain": redirect_chain,
        "security_headers": {
            "has_https": is_tls,
            "has_hsts": "strict-transport-security" in headers_dict,
            "has_csp": "content-security-policy" in headers_dict,
        },
        "page_metadata": {
            "title": title,
            "description": description,
            "total_links_found": len(meta["links"]),
            "external_domains": list(external_domains)[:10],
        },
        "visible_text_snippet": plain_text[:600] + ("..." if len(plain_text) > 600 else ""),
        "detected_signals": detected_signals,
        "url_analysis": static_url_res,
        "ml_analysis": {
            "model_available": model_avail,
            "model_probability": round(model_prob or 0.0, 4),
            "model_class": model_class,
            "model_version": model_version,
            "model_tokens": model_tokens,
        },
        "checks": checks,
        "checks_completed": c_comp,
        "checks_unavailable": c_unavail,
        "risk_assessment": {
            "risk_score": composite_score,
            "risk_level": risk_level,
            "verdict": risk_level,
            "signals_detected_count": len(detected_signals),
            "verdict_summary": verdict,
            "is_conclusive": True,
            "reason_incomplete": None,
            "calculation_breakdown": {
                "static_url_heuristics_score": url_score,
                "content_signals_score": min(100, signals_score),
                "ml_classifier_score": ml_score,
            }
        }
    }


inspect_website_xray = safe_fetch_website_xray


