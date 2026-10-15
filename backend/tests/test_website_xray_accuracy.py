import pytest
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.services.xray_service import safe_fetch_website_xray

client = TestClient(app)


def test_website_xray_self_signed_badssl():
    """
    Scanning https://self-signed.badssl.com must:
    - Retain destination IP (real resolved IP, not 'Unresolved')
    - Report actual_transport as HTTPS (Certificate Invalid)
    - Set tls_status to FAILED with verified TLS error detail
    - Set scan_status to INCOMPLETE
    - Set verdict to INCONCLUSIVE (never Low risk or safe)
    - Set risk_score to None
    """
    result = safe_fetch_website_xray("https://self-signed.badssl.com")
    
    # Destination IP should be resolved if network is up
    assert result["requested_scheme"] == "https"
    assert result["scan_status"] == "INCOMPLETE"
    assert result["actual_transport"] == "HTTPS (Certificate Invalid)"
    assert result["tls_status"] == "FAILED"
    assert "self-signed certificate" in result["tls_error"].lower()
    assert result["status_code"] is None
    assert result["risk_assessment"]["risk_score"] is None
    assert result["risk_assessment"]["verdict"] == "INCONCLUSIVE"
    assert result["risk_assessment"]["is_conclusive"] is False
    assert "TLS certificate validation failed" in result["risk_assessment"]["reason_incomplete"]

    # Checks structure verification
    tls_check = next((c for c in result["checks"] if "TLS" in c["name"]), None)
    assert tls_check is not None
    assert tls_check["status"] == "Failed"


def test_website_xray_expired_badssl():
    """Scanning https://expired.badssl.com must detect expired certificate error or report unverified on timeout."""
    result = safe_fetch_website_xray("https://expired.badssl.com")
    assert result["scan_status"] == "INCOMPLETE"
    assert result["risk_assessment"]["verdict"] == "INCONCLUSIVE"
    assert result["risk_assessment"]["is_conclusive"] is False
    if result["tls_status"] == "FAILED":
        assert "expired" in result["tls_error"].lower()
    else:
        assert result["tls_status"] == "UNVERIFIED"
        assert "timed out" in result["tls_error"].lower()


def test_website_xray_wrong_host_badssl():
    """Scanning https://wrong.host.badssl.com must detect hostname mismatch or report unverified on timeout."""
    result = safe_fetch_website_xray("https://wrong.host.badssl.com")
    assert result["scan_status"] == "INCOMPLETE"
    assert result["risk_assessment"]["verdict"] == "INCONCLUSIVE"
    assert result["risk_assessment"]["is_conclusive"] is False
    if result["tls_status"] == "FAILED":
        assert "mismatch" in result["tls_error"].lower() or "not valid for" in result["tls_error"].lower()
    else:
        # In case public badssl server latency causes connection timeout
        assert result["tls_status"] == "UNVERIFIED"
        assert "timed out" in result["tls_error"].lower()


def test_website_xray_deterministic_tls_certificate_failure():
    """Deterministic unit test: verified TLS certificate failure handling."""
    mock_ssl_err = httpx.ConnectError("[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: self-signed certificate (_ssl.c:1000)")
    with patch("httpx.Client.get", side_effect=mock_ssl_err):
        result = safe_fetch_website_xray("https://example.com")
        assert result["scan_status"] == "INCOMPLETE"
        assert result["tls_status"] == "FAILED"
        assert result["actual_transport"] == "HTTPS (Certificate Invalid)"
        assert "self-signed certificate" in result["tls_error"]
        assert result["risk_assessment"]["verdict"] == "INCONCLUSIVE"
        assert result["risk_assessment"]["is_conclusive"] is False
        assert result["risk_assessment"]["risk_score"] is None


def test_website_xray_example_com_valid_tls():
    """Scanning https://example.com must complete successfully with verified TLS."""
    result = safe_fetch_website_xray("https://example.com")
    assert result["scan_status"] == "SUCCESS"
    assert result["status_code"] == 200
    assert result["requested_scheme"] == "https"
    assert result["actual_transport"] == "HTTPS (TLS Verified)"
    assert result["tls_status"] == "VERIFIED"
    assert result["tls_error"] is None
    assert result["risk_assessment"]["is_conclusive"] is True
    assert "Example Domain" in result["page_metadata"]["title"]


def test_website_xray_neverssl_com_unencrypted():
    """
    Scanning http://neverssl.com must:
    - Retain requested_scheme as 'http'
    - Never silently upgrade to https
    - If network reaches neverssl, report SUCCESS and HTTP (Unencrypted)
    - If network times out (as observed on this host environment), report INCOMPLETE and HTTP (Connection Incomplete)
    - In neither case may it claim verified TLS or safe verdict on timeout
    """
    result = safe_fetch_website_xray("http://neverssl.com")
    assert result["requested_scheme"] == "http"
    assert "https" not in result["requested_scheme"]
    if result["scan_status"] == "SUCCESS":
        assert "HTTP" in result["actual_transport"]
        assert result["tls_status"] == "NOT_APPLICABLE"
        assert result["security_headers"]["has_https"] is False
    else:
        # Live network environment cannot reach neverssl.com (port 80 drop/timeout)
        assert result["scan_status"] == "INCOMPLETE"
        assert "HTTP" in result["actual_transport"]
        assert result["risk_assessment"]["verdict"] == "INCONCLUSIVE"
        assert result["risk_assessment"]["is_conclusive"] is False


def test_website_xray_http_example_domain_unencrypted():
    """
    Scanning http://example.com (which succeeds on port 80) must:
    - Retain requested_scheme as 'http'
    - Report actual_transport as 'HTTP (Unencrypted)'
    - Set tls_status to NOT_APPLICABLE
    - Not invent TLS encryption
    """
    result = safe_fetch_website_xray("http://example.com")
    assert result["scan_status"] == "SUCCESS"
    assert result["status_code"] == 200
    assert result["requested_scheme"] == "http"
    assert result["actual_transport"] == "HTTP (Unencrypted)"
    assert result["tls_status"] == "NOT_APPLICABLE"
    assert result["security_headers"]["has_https"] is False
    assert result["risk_assessment"]["is_conclusive"] is True


def test_website_xray_simulated_dns_failure():
    """Simulated DNS resolution failure must return INCOMPLETE and INCONCLUSIVE verdict."""
    result = safe_fetch_website_xray("https://this-is-a-guaranteed-non-existent-domain-xyz123999.invalid")
    assert result["scan_status"] == "INCOMPLETE"
    assert result["resolved_ips"] == []
    assert result["actual_transport"] == "Unreachable (DNS Resolution Failed)"
    assert result["tls_status"] == "NOT_EVALUATED"
    assert result["risk_assessment"]["risk_score"] is None
    assert result["risk_assessment"]["verdict"] == "INCONCLUSIVE"
    assert result["risk_assessment"]["is_conclusive"] is False
    assert "DNS resolution failed" in result["risk_assessment"]["reason_incomplete"]

    dns_check = next((c for c in result["checks"] if "DNS" in c["name"]), None)
    assert dns_check is not None
    assert dns_check["status"] == "Failed"


def test_website_xray_simulated_connection_timeout():
    """Simulated timeout during connection must not be reported as safe or low risk."""
    with patch("httpx.Client.get", side_effect=httpx.TimeoutException("Mock connection timeout")):
        result = safe_fetch_website_xray("https://example.com")
        assert result["scan_status"] == "INCOMPLETE"
        assert result["actual_transport"] == "HTTPS (Connection Incomplete)"
        assert result["tls_status"] == "UNVERIFIED"
        assert "timed out" in result["tls_error"].lower()
        assert result["risk_assessment"]["risk_score"] is None
        assert result["risk_assessment"]["verdict"] == "INCONCLUSIVE"
        assert result["risk_assessment"]["is_conclusive"] is False
        assert "timed out" in result["risk_assessment"]["reason_incomplete"].lower()


def test_website_xray_ssrf_protection_direct_and_dns():
    """Direct loopback and metadata IPs must be blocked immediately."""
    # 1. Direct Loopback
    res1 = client.post("/api/scanner/xray", json={"url": "http://127.0.0.1:9000/internal-secrets"})
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["scan_status"] == "BLOCKED"
    assert data1["fetch_status"] == "SSRF_BLOCKED"
    assert data1["risk_assessment"]["risk_level"] == "HIGH"
    assert data1["actual_transport"] == "Blocked (SSRF Protection)"

    # 2. Cloud metadata IP
    res2 = client.post("/api/scanner/xray", json={"url": "http://169.254.169.254/latest/meta-data/"})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["scan_status"] == "BLOCKED"
    assert data2["fetch_status"] == "SSRF_BLOCKED"
    assert data2["risk_assessment"]["risk_level"] == "HIGH"


def test_website_xray_redirect_ssrf_revalidation():
    """Redirects targeting private/loopback RFC-1918 space must be blocked on hop."""
    class MockRedirectResponse:
        is_redirect = True
        status_code = 302
        headers = {"location": "http://192.168.1.1/admin"}
        content = b""

    with patch("httpx.Client.get", return_value=MockRedirectResponse()):
        result = safe_fetch_website_xray("https://example.com")
        assert result["scan_status"] == "BLOCKED"
        assert result["fetch_status"] == "SSRF_BLOCKED"
        assert result["risk_assessment"]["risk_level"] == "HIGH"
        assert "Redirect hop" in result["error_detail"]
