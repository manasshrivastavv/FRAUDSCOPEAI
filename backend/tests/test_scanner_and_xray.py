import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_url_scanner_benign():
    response = client.post("/api/scanner/url", json={"url": "https://rbi.org.in/advisory"})
    assert response.status_code == 200
    data = response.json()
    assert data["domain"] == "rbi.org.in"
    assert data["risk_level"] in ["LOW", "MEDIUM"]
    assert "checks_completed" in data
    assert len(data["checks_completed"]) >= 5
    assert "checks_unavailable" in data
    assert "disclaimer" in data

def test_url_scanner_shortener_and_deceptive():
    response = client.post("/api/scanner/url", json={"url": "https://bit.ly/verify-bank-kyc-update"})
    assert response.status_code == 200
    data = response.json()
    assert data["is_suspicious"] is True
    assert data["risk_score"] >= 30
    assert any("shortener" in str(ind).lower() for ind in data["indicators"])

def test_url_scanner_ssrf_mitigation():
    # Loopback IP
    res1 = client.post("/api/scanner/url", json={"url": "http://127.0.0.1:8000/api/admin"})
    assert res1.status_code == 200
    assert res1.json()["is_suspicious"] is True
    assert res1.json()["risk_level"] == "HIGH"

    # Cloud hypervisor metadata IP
    res2 = client.post("/api/scanner/url", json={"url": "http://169.254.169.254/computeMetadata/v1/"})
    assert res2.status_code == 200
    assert res2.json()["risk_level"] == "HIGH"

def test_website_xray_ssrf_blocked():
    response = client.post("/api/scanner/xray", json={"url": "http://127.0.0.1:9000/secret"})
    assert response.status_code == 200
    data = response.json()
    assert data["fetch_status"] == "SSRF_BLOCKED"
    assert data["risk_assessment"]["risk_level"] == "HIGH"

def test_website_xray_content_unavailable():
    response = client.post("/api/scanner/xray", json={"url": "https://this-domain-does-not-exist-at-all-xyz999.invalid"})
    assert response.status_code == 200
    data = response.json()
    assert data["scan_status"] == "INCOMPLETE"
    assert data["fetch_status"] in ["INCOMPLETE", "CONTENT_UNAVAILABLE"]
    assert data["risk_assessment"]["verdict"] == "INCONCLUSIVE"
    assert data["risk_assessment"]["is_conclusive"] is False
    assert "error_detail" in data
    assert "risk_assessment" in data

def test_case_lifecycle_and_delete():
    # 1. Create case
    create_res = client.post("/api/cases", json={
        "title": "Test Case for Deletion",
        "description": "Lifecycle test case",
        "priority": "LOW"
    })
    assert create_res.status_code == 200
    case_id = create_res.json()["id"]

    # 2. Delete case
    del_res = client.delete(f"/api/cases/{case_id}")
    assert del_res.status_code == 200
    assert "successfully deleted" in del_res.json()["message"]

    # 3. Verify case is gone
    get_res = client.get(f"/api/cases/{case_id}")
    assert get_res.status_code == 404
