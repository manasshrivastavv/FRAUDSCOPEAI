import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_generate_report_for_suspicious_message():
    # 1. Post a suspicious message report
    response = client.post("/api/reports/generate", json={
        "content": "URGENT NOTICE: Your bank account is locked! Send OTP immediately to verify account at http://phish-secure-verify.com/login",
        "input_type": "message",
        "source_type": "manual_scan"
    })
    assert response.status_code == 200, response.text
    data = response.json()
    
    # Verify all mandatory sections exist
    assert "report_id" in data
    assert data["report_id"].startswith("RPT-")
    assert data["input_type"] == "message"
    assert data["verdict"] in ["Suspicious", "Likely Suspicious", "Inconclusive", "No Significant Threat Detected"]
    assert data["severity"] in ["Critical", "High", "Medium", "Low", "Informational"]
    assert 0 <= data["risk_score"] <= 100
    assert "executive_summary" in data
    assert len(data["executive_summary"]) > 20
    assert "indicators" in data
    assert isinstance(data["indicators"], list)
    assert len(data["indicators"]) > 0
    
    # Check indicator structure
    first_ind = data["indicators"][0]
    assert "indicator_name" in first_ind
    assert "observed_evidence" in first_ind
    assert "why_it_matters" in first_ind
    assert "evidence_source" in first_ind
    assert first_ind["verification_status"] in ["Verified", "Model-Inferred", "Dataset-Provided", "Unknown"]
    
    # Check model analysis
    assert "model_analysis" in data
    assert "prediction" in data["model_analysis"]
    assert "model_name" in data["model_analysis"]
    assert "important_limitations" in data["model_analysis"]
    
    # Check message analysis
    assert "message_analysis" in data
    assert data["message_analysis"] is not None
    assert "urgency_or_threats" in data["message_analysis"]
    assert len(data["message_analysis"]["urgency_or_threats"]) > 0
    assert len(data["message_analysis"]["credential_or_payment_requests"]) > 0
    
    # Check breakdown, impact, actions, timeline, limitations
    assert "risk_breakdown" in data
    assert isinstance(data["risk_breakdown"], list)
    assert "potential_impacts" in data
    assert "recommended_actions" in data
    assert len(data["recommended_actions"]) > 0
    assert "evidence_timeline" in data
    assert "provenance" in data
    assert "limitations" in data

def test_generate_report_for_benign_url():
    response = client.post("/api/reports/generate", json={
        "url": "https://www.google.com",
        "input_type": "url",
        "source_type": "manual_scan"
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["input_type"] == "url"
    assert data["risk_score"] < 40
    assert data["url_analysis"] is not None
    assert data["url_analysis"]["hostname"] == "www.google.com"
    assert "HTTPS" in data["url_analysis"]["https_status"]
    # Pure URL should not falsely run text classification model
    assert "model_analysis" in data
    assert data["model_analysis"]["prediction"] == "not_evaluated"
    assert data["model_analysis"]["suspicious_probability"] is None

def test_generate_report_ssrf_protection():
    # Attempting to scan a private loopback or metadata IP
    response = client.post("/api/reports/generate", json={
        "url": "http://127.0.0.1:8000/internal-secrets",
        "input_type": "url"
    })
    assert response.status_code == 200, response.text
    data = response.json()
    # It must detect IP-based hostname and flag private/local IP
    assert data["risk_score"] >= 40
    assert any("IP" in ind["indicator_name"] or "Loopback" in ind["indicator_name"] or "Private" in ind["indicator_name"] for ind in data["indicators"])

def test_generate_report_missing_inputs():
    response = client.post("/api/reports/generate", json={})
    assert response.status_code == 400
    assert "detail" in response.json()

def test_report_persistence_and_retrieval():
    # 1. Create a report
    create_res = client.post("/api/reports/generate", json={
        "content": "Special promotional reward claim your bitcoin now",
        "input_type": "message"
    })
    assert create_res.status_code == 200
    created = create_res.json()
    report_id = created["report_id"]
    
    # 2. Retrieve by report_id
    get_res = client.get(f"/api/reports/{report_id}")
    assert get_res.status_code == 200
    retrieved = get_res.json()
    assert retrieved["report_id"] == report_id
    assert retrieved["verdict"] == created["verdict"]
    assert retrieved["risk_score"] == created["risk_score"]

def test_report_listing_and_pagination():
    list_res = client.get("/api/reports?page=1&limit=10")
    assert list_res.status_code == 200
    data = list_res.json()
    assert "reports" in data
    assert "total" in data
    assert "page" in data
    assert "limit" in data
    assert len(data["reports"]) <= 10

def test_report_exports():
    # Create report
    res = client.post("/api/reports/generate", json={
        "content": "Verify your identity now or risk account suspension",
        "input_type": "message"
    })
    report_id = res.json()["report_id"]
    
    # Test JSON export
    json_res = client.get(f"/api/reports/{report_id}/export/json")
    assert json_res.status_code == 200
    assert json_res.headers["content-type"] == "application/json"
    exported_data = json_res.json()
    assert exported_data["report_id"] == report_id
    
    # Test HTML printable export
    html_res = client.get(f"/api/reports/{report_id}/export/html")
    assert html_res.status_code == 200
    assert "text/html" in html_res.headers["content-type"]
    assert report_id in html_res.text
    assert "FRAUDSCOPE AI" in html_res.text

def test_confidence_score_never_equals_one():
    # Even on extreme multi-indicator fraud lures, confidence score must not be 1.0 (100%)
    res = client.post("/api/reports/generate", json={
        "content": "Bank account kiraye pe available hai! Fresh current account with linked SIM card aur ATM card + PIN ready for immediate delivery. Urgent buyers only message on Telegram @CashDropDeal or call +91 98765 43210. 100% genuine guaranteed.",
        "input_type": "message"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["confidence_score"] is not None
    # Must never claim absolute 1.0 certainty
    assert data["confidence_score"] < 1.0
    assert 0.30 <= data["confidence_score"] <= 0.88

def test_html_export_xss_protection():
    # Scanned content with malicious script injection
    malicious_text = "Urgent notice <script>alert('XSS_ATTACK')</script> <img src=x onerror=alert('PWNED')>"
    res = client.post("/api/reports/generate", json={
        "content": malicious_text,
        "input_type": "message"
    })
    assert res.status_code == 200
    report_id = res.json()["report_id"]

    html_res = client.get(f"/api/reports/{report_id}/export/html")
    assert html_res.status_code == 200
    # Must NOT contain raw unescaped script tag
    assert "<script>alert('XSS_ATTACK')</script>" not in html_res.text
    assert "<img src=x onerror=alert('PWNED')>" not in html_res.text
    # Must contain HTML escaped representation
    assert "&lt;script&gt;" in html_res.text
    assert "&lt;img" in html_res.text
