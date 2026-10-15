import io
import uuid
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.database.session import SessionLocal
from app.models.models import User, Advertisement, Case, case_advertisements
from app.services.text_preprocessing import normalize_text, calculate_content_hash
from app.services.entity_extraction import extract_entities, sanitize_phone_number
from app.services.rule_engine import evaluate_rules
from app.services.model_service import predict_risk, load_model, get_model_metadata
from app.services.risk_scoring import calculate_composite_risk
from app.services.url_analysis import analyze_url, is_private_or_loopback_ip
from app.services.xray_service import inspect_website_xray, resolve_hostname_ips
from app.services.ocr_service import extract_text_from_image
from app.api.reports import sanitize_csv_cell

client = TestClient(app)


# ============================================================================
# A. AUTHENTICATION AND USER ACCOUNTS
# ============================================================================

def test_auth_registration_validation():
    """Verify input validation for user registration."""
    # Invalid email
    r1 = client.post("/api/auth/register", json={
        "full_name": "Test User",
        "email": "invalid-email-format",
        "username": "valid_user_1",
        "password": "Password123!",
        "confirm_password": "Password123!",
        "role": "Investigator"
    })
    assert r1.status_code == 400
    assert "email" in r1.json()["detail"].lower()

    # Invalid username (special characters)
    r2 = client.post("/api/auth/register", json={
        "full_name": "Test User",
        "email": "valid@example.com",
        "username": "user!@#$%",
        "password": "Password123!",
        "confirm_password": "Password123!",
        "role": "Investigator"
    })
    assert r2.status_code == 400
    assert "username" in r2.json()["detail"].lower()

    # Password mismatch
    r3 = client.post("/api/auth/register", json={
        "full_name": "Test User",
        "email": "valid@example.com",
        "username": "valid_user_2",
        "password": "Password123!",
        "confirm_password": "DifferentPassword123!",
        "role": "Investigator"
    })
    assert r3.status_code == 400
    assert "match" in r3.json()["detail"].lower()

    # Weak password (less than 8 chars)
    r4 = client.post("/api/auth/register", json={
        "full_name": "Test User",
        "email": "valid@example.com",
        "username": "valid_user_3",
        "password": "pwd",
        "confirm_password": "pwd",
        "role": "Investigator"
    })
    assert r4.status_code in [400, 422]

    # Unauthorized role escalation (Administrator)
    r5 = client.post("/api/auth/register", json={
        "full_name": "Hacker Admin",
        "email": "hacker@example.com",
        "username": "hacker_adm",
        "password": "Password123!",
        "confirm_password": "Password123!",
        "role": "Administrator"
    })
    assert r5.status_code == 403
    assert "prohibited" in r5.json()["detail"].lower()


def test_auth_full_lifecycle_and_persistence():
    """Verify registration, login, profile retrieval, logout, and token protection."""
    uid = uuid.uuid4().hex[:8]
    email = f"analyst_{uid}@fraudscope.internal"
    username = f"analyst_{uid}"
    password = "SecuRePassword#2026"

    # 1. Register
    reg_res = client.post("/api/auth/register", json={
        "full_name": f"Forensic Analyst {uid}",
        "email": email,
        "username": username,
        "password": password,
        "confirm_password": password,
        "role": "Fraud Analyst"
    })
    assert reg_res.status_code == 201
    user_id = reg_res.json()["id"]

    # 2. Duplicate registration rejected
    dup_res = client.post("/api/auth/register", json={
        "full_name": "Duplicate User",
        "email": email,
        "username": f"other_{uid}",
        "password": password,
        "confirm_password": password,
        "role": "Investigator"
    })
    assert dup_res.status_code == 409

    # 3. Bad password login rejected
    bad_login = client.post("/api/auth/login", json={
        "username_or_email": username,
        "password": "WrongPassword123!"
    })
    assert bad_login.status_code == 401

    # 4. Valid login succeeds
    good_login = client.post("/api/auth/login", json={
        "username_or_email": username,
        "password": password
    })
    assert good_login.status_code == 200
    token = good_login.json()["access_token"]
    assert token is not None

    # 5. Access protected /me endpoint with token
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["username"] == username
    assert me_res.json()["email"] == email

    # 6. Access without token rejected (401)
    client.cookies.clear()
    unauth_res = client.get("/api/auth/me")
    assert unauth_res.status_code == 401

    # 7. Logout succeeds
    logout_res = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_res.status_code == 200

    # 8. Verify database persistence directly
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.id == user_id).first()
        assert db_user is not None
        assert db_user.username == username
        assert db_user.email == email
        assert db_user.password_hash.startswith("$2b$")  # bcrypt hash
    finally:
        db.close()


# ============================================================================
# B. ADVERTISEMENT AND MESSAGE FRAUD DETECTION
# ============================================================================

def test_ad_detection_empty_input():
    """Verify empty or whitespace-only inputs are rejected with 400 Bad Request."""
    r1 = client.post("/api/ads/analyze", json={"content": ""})
    assert r1.status_code == 400
    r2 = client.post("/api/ads/analyze", json={"content": "     "})
    assert r2.status_code == 400


def test_ad_detection_generic_words_not_flagged():
    """Verify legitimate transactional messages with generic words are not flagged as fraud."""
    generic_text = "Big summer sale now available! Daily fresh arrivals for order. Transfer funds anytime via standard store cashier."
    res = client.post("/api/ads/analyze", json={"content": generic_text})
    assert res.status_code == 200
    data = res.json()
    assert data["analysis"]["risk_level"] == "LOW"
    assert data["analysis"]["risk_score"] < 35.0


def test_ad_detection_obvious_mule_advertising():
    """Verify explicit financial account selling and mule recruitment is flagged HIGH risk."""
    mule_text = "GUARANTEED UNCHECKED BANK ACCOUNTS FOR QUICK SALE! Get fully activated current accounts with debit cards. No KYC verification needed. Contact @FastMuleDrop on Telegram now!"
    res = client.post("/api/ads/analyze", json={"content": mule_text, "platform": "Telegram"})
    assert res.status_code == 200
    data = res.json()
    assert data["analysis"]["risk_level"] == "HIGH"
    assert data["analysis"]["risk_score"] >= 70.0
    assert len(data["evidence_items"]) > 0
    assert len(data["entities"]) > 0


def test_ad_detection_hinglish_and_slang():
    """Verify Hinglish mule phrases (bikau, paisa milega, kiraye pe) are correctly detected."""
    hinglish_text = "Fresh savings bank account bikau hai urgent paisa milega kiraye pe account do DM fast"
    res = client.post("/api/ads/analyze", json={"content": hinglish_text})
    assert res.status_code == 200
    data = res.json()
    assert data["analysis"]["risk_level"] in ["HIGH", "MEDIUM"]
    assert data["analysis"]["risk_score"] >= 40.0


def test_ad_detection_benign_regulatory_and_inquiry_mitigation():
    """Verify official banking advisories and consumer inquiries are protected from false positives."""
    advisory_text = "RBI Official Advisory: Beware of fraudulent account sale offers. Never share your netbanking password, OTP, or UPI pin with third parties."
    res = client.post("/api/ads/analyze", json={"content": advisory_text})
    assert res.status_code == 200
    data = res.json()
    assert data["analysis"]["risk_level"] == "LOW"
    assert "BENIGN CONTEXT MITIGATION" in data["analysis"]["explanation"]


# ============================================================================
# C. SMART URL SCANNER
# ============================================================================

def test_url_scanner_schemes_and_normalization():
    """Verify URL syntax validation and scheme prepending."""
    # Prepend scheme if missing
    r1 = client.post("/api/scanner/url", json={"url": "rbi.org.in"})
    assert r1.status_code == 200
    assert r1.json()["normalized_url"] == "https://rbi.org.in"

    # HTTPS preservation
    r2 = client.post("/api/scanner/url", json={"url": "https://secure-portal.com/login"})
    assert r2.status_code == 200
    assert r2.json()["domain"] == "secure-portal.com"


def test_url_scanner_deceptive_keywords_and_shorteners():
    """Verify deceptive banking keywords and known shorteners are flagged."""
    # Deceptive keyword
    r1 = client.post("/api/scanner/url", json={"url": "https://sbi-card-unblock-kyc-update.xyz"})
    assert r1.status_code == 200
    assert r1.json()["is_suspicious"] is True
    assert any("kyc-update" in ind.lower() for ind in r1.json()["indicators"])

    # URL shortener
    r2 = client.post("/api/scanner/url", json={"url": "https://tinyurl.com/claim-reward-cash"})
    assert r2.status_code == 200
    assert r2.json()["is_suspicious"] is True
    assert any("shortener" in ind.lower() for ind in r2.json()["indicators"])


def test_url_scanner_anti_ssrf_protections():
    """Verify localhost, private IPs, and AWS/GCP metadata IPs are flagged as critical SSRF risks."""
    # Localhost
    r1 = client.post("/api/scanner/url", json={"url": "http://localhost:8000/internal"})
    assert r1.json()["is_suspicious"] is True
    assert r1.json()["risk_level"] == "HIGH"

    # 127.0.0.1
    r2 = client.post("/api/scanner/url", json={"url": "http://127.0.0.1/admin"})
    assert r2.json()["risk_level"] == "HIGH"

    # Cloud hypervisor metadata
    r3 = client.post("/api/scanner/url", json={"url": "http://169.254.169.254/latest/meta-data/"})
    assert r3.json()["risk_level"] == "HIGH"


# ============================================================================
# D. WEBSITE X-RAY ANALYSIS
# ============================================================================

def test_website_xray_ssrf_blocked_safely():
    """Verify Website X-Ray terminates immediately when targeting loopback or internal infrastructure."""
    res = client.post("/api/scanner/xray", json={"url": "http://127.0.0.1:8000/api/health"})
    assert res.status_code == 200
    data = res.json()
    assert data["fetch_status"] == "SSRF_BLOCKED"
    assert data["risk_assessment"]["risk_level"] == "HIGH"
    assert "SSRF" in data["error_detail"]


def test_website_xray_content_unavailable_handling():
    """Verify unreachable websites return INCOMPLETE without crashing and verdict is INCONCLUSIVE."""
    res = client.post("/api/scanner/xray", json={"url": "https://unreachable-fake-domain-9992384.invalid"})
    assert res.status_code == 200
    data = res.json()
    assert data["scan_status"] == "INCOMPLETE"
    assert data["fetch_status"] in ["INCOMPLETE", "CONTENT_UNAVAILABLE"]
    assert "error_detail" in data
    assert data["risk_assessment"]["verdict"] == "INCONCLUSIVE"
    assert data["risk_assessment"]["is_conclusive"] is False


def test_website_xray_public_example_domain():
    """Verify public website fetch and HTML metadata extraction."""
    res = client.post("/api/scanner/xray", json={"url": "http://example.com"})
    assert res.status_code == 200
    data = res.json()
    assert data["fetch_status"] == "SUCCESS"
    assert data["status_code"] == 200
    assert "Example Domain" in data["page_metadata"]["title"]
    assert "Example Domain" in data["visible_text_snippet"]
    assert data["security_headers"]["has_https"] is False
    assert data["risk_assessment"]["risk_level"] == "LOW"


# ============================================================================
# E. IMAGE UPLOAD AND OCR
# ============================================================================

def test_ocr_upload_content_type_validation():
    """Verify non-image files are rejected with 400 Bad Request."""
    txt_file = io.BytesIO(b"Hello world, this is a plain text file, not an image.")
    res = client.post(
        "/api/ads/ocr-upload",
        files={"file": ("notes.txt", txt_file, "text/plain")}
    )
    assert res.status_code == 400
    assert "valid image" in res.json()["detail"].lower()


def test_ocr_upload_oversized_validation():
    """Verify images exceeding 10MB are rejected with 400 Bad Request."""
    huge_bytes = b"0" * (11 * 1024 * 1024)
    res = client.post(
        "/api/ads/ocr-upload",
        files={"file": ("large_image.png", io.BytesIO(huge_bytes), "image/png")}
    )
    assert res.status_code == 400
    assert "10mb" in res.json()["detail"].lower()


def test_ocr_upload_valid_synthetic_image():
    """Verify valid synthetic PNG image is accepted and processed gracefully."""
    img = Image.new("RGB", (200, 100), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    res = client.post(
        "/api/ads/ocr-upload",
        files={"file": ("test_ad.png", buf, "image/png")}
    )
    assert res.status_code == 200
    data = res.json()
    assert "success" in data
    assert "extracted_text" in data
    assert "message" in data


# ============================================================================
# F. ML MODEL AND DATASET REPRODUCIBILITY
# ============================================================================

def test_ml_model_metadata_and_threshold_integrity():
    """Verify model metadata structure and calibrated thresholds."""
    meta = get_model_metadata()
    assert meta["model_version"] == "fraudscope-context-lr-v2.0"
    assert meta["thresholds"]["suspicious"] == 0.65
    assert meta["thresholds"]["needs_review"] == 0.45
    assert meta["dataset_rows"]["total"] == 745
    assert meta["test_metrics"]["roc_auc"] > 0.90
    assert meta["test_metrics"]["recall"] == 1.0


def test_ml_inference_reproducibility():
    """Verify reproducible probability scores for standard test inputs."""
    sample_text = "Corporate business account for instant transfer available DM telegram"
    norm = normalize_text(sample_text)
    avail, prob1, cls1, ver1, toks1 = predict_risk(norm)
    avail2, prob2, cls2, ver2, toks2 = predict_risk(norm)

    assert avail is True
    assert prob1 == prob2
    assert cls1 == cls2
    assert ver1 == ver2


# ============================================================================
# G. FRAUD NETWORK DETECTIVE
# ============================================================================

def test_network_graph_api_structure():
    """Verify threat network API returns nodes, edges, and cluster stats."""
    res = client.get("/api/network?limit=25")
    assert res.status_code == 200
    data = res.json()
    assert "nodes" in data
    assert "edges" in data
    assert "stats" in data
    assert data["stats"]["total_nodes"] == len(data["nodes"])
    assert data["stats"]["total_edges"] == len(data["edges"])


def test_network_entity_normalization_sanitizing():
    """Verify phone, UPI, and Telegram normalization excludes dummy and generic handles."""
    # Generic platform domains must not become hubs
    from app.services.network_service import normalize_graph_identifier
    assert normalize_graph_identifier("URL", "t.me") is None
    assert normalize_graph_identifier("URL", "wa.me") is None
    assert normalize_graph_identifier("URL", "instagram.com") is None

    # Dummy UPI handles must not become hubs
    assert normalize_graph_identifier("UPI_ID", "example@upi") is None
    assert normalize_graph_identifier("UPI_ID", "user@upi") is None

    # Valid phone normalization
    phone_res = normalize_graph_identifier("PHONE", "+91 98765-43210")
    assert phone_res is not None
    assert phone_res[0] == "PHONE"
    assert "9876543210" in phone_res[1]


# ============================================================================
# H. EXPLAINABLE FRAUD VERDICT
# ============================================================================

def test_composite_risk_scoring_bounds():
    """Verify that composite scores are strictly bounded within [0.0, 100.0]."""
    # Max possible rules + max ML
    max_rules = {
        "raw_rule_score": 150.0,
        "is_financial_relevance": True,
        "is_benign_context": False,
        "triggered_rules": [{"rule_id": "R01", "rule_name": "Account Sale", "category": "MULE_SALE", "weight": 50}],
        "suspicious_phrases": ["account for sale"]
    }
    high_risk = calculate_composite_risk(
        rule_results=max_rules,
        model_available=True,
        model_signal=0.99,
        model_class="suspicious",
        model_version="v2.0"
    )
    assert high_risk["risk_score"] <= 100.0
    assert high_risk["risk_level"] == "HIGH"

    # Zero rules + zero ML
    zero_rules = {
        "raw_rule_score": 0.0,
        "is_financial_relevance": False,
        "is_benign_context": False,
        "triggered_rules": [],
        "suspicious_phrases": []
    }
    low_risk = calculate_composite_risk(
        rule_results=zero_rules,
        model_available=True,
        model_signal=0.0,
        model_class="safe",
        model_version="v2.0"
    )
    assert low_risk["risk_score"] == 0.0
    assert low_risk["risk_level"] == "LOW"


# ============================================================================
# I. INVESTIGATION HISTORY AND REPORTS
# ============================================================================

def test_case_crud_full_lifecycle():
    """Verify case creation, retrieval, filtering, notes, and deletion."""
    uid = uuid.uuid4().hex[:6]
    title = f"Syndicate KYC Ring Investigation {uid}"

    # 1. Create Case
    create_res = client.post("/api/cases", json={
        "title": title,
        "description": "Cross-platform mule ring test",
        "priority": "HIGH",
        "assigned_to": "Lead Investigator"
    })
    assert create_res.status_code == 200
    case_data = create_res.json()
    case_id = case_data["id"]
    assert case_data["title"] == title
    assert case_data["priority"] == "HIGH"
    assert case_data["status"] == "OPEN"

    # 2. Get Case Detail
    get_res = client.get(f"/api/cases/{case_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == case_id

    # 3. List and Filter Cases
    list_res = client.get("/api/cases?priority=HIGH")
    assert list_res.status_code == 200
    assert any(c["id"] == case_id for c in list_res.json())

    # 4. Add Case Note
    note_res = client.post(f"/api/cases/{case_id}/notes", json={
        "note": "Correlated telephone number matches external blacklist.",
        "actor": "Lead Investigator"
    })
    assert note_res.status_code == 200
    assert note_res.json()["note"] == "Correlated telephone number matches external blacklist."

    # 5. Delete Case
    del_res = client.delete(f"/api/cases/{case_id}")
    assert del_res.status_code == 200
    assert "successfully deleted" in del_res.json()["message"]

    # 6. Verify 404 after deletion
    verify_404 = client.get(f"/api/cases/{case_id}")
    assert verify_404.status_code == 404


def test_reports_and_csv_injection_prevention():
    """Verify report summary generation and CSV formula injection neutralization."""
    # Summary report
    rep_res = client.get("/api/reports/summary")
    assert rep_res.status_code == 200
    rep_data = rep_res.json()
    assert "report_id" in rep_data
    assert "metrics" in rep_data
    assert "disclaimer" in rep_data

    # CSV injection sanitization unit test (CWE-1236)
    assert sanitize_csv_cell("=1+1") == "'=1+1"
    assert sanitize_csv_cell("@SUM(A1:A10)") == "'@SUM(A1:A10)"
    assert sanitize_csv_cell("+cmd|'/C calc'!A0") == "'+cmd|'/C calc'!A0"
    assert sanitize_csv_cell("-5+2") == "'-5+2"
    assert sanitize_csv_cell("Regular Text") == "Regular Text"

    # Live CSV Export
    csv_res = client.get("/api/reports/export")
    assert csv_res.status_code == 200
    assert csv_res.headers["content-type"].startswith("text/csv")
    assert "Record ID,Source Type" in csv_res.text


# ============================================================================
# J. COMPLETE USER WORKFLOW INTEGRATION
# ============================================================================

def test_workflow_1_auth_flow():
    """Workflow 1: Register -> Login -> Me -> Logout."""
    uid = uuid.uuid4().hex[:6]
    r_reg = client.post("/api/auth/register", json={
        "full_name": f"Workflow User {uid}",
        "email": f"wf_{uid}@test.com",
        "username": f"wf_{uid}",
        "password": "Password#123",
        "confirm_password": "Password#123",
        "role": "Investigator"
    })
    assert r_reg.status_code == 201

    r_login = client.post("/api/auth/login", json={
        "username_or_email": f"wf_{uid}",
        "password": "Password#123"
    })
    assert r_login.status_code == 200
    token = r_login.json()["access_token"]

    r_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r_me.status_code == 200
    assert r_me.json()["username"] == f"wf_{uid}"

    r_logout = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert r_logout.status_code == 200


def test_workflow_2_scan_ad_and_open_case():
    """Workflow 2: Scan Advertisement -> View Score -> Open Case."""
    ad_content = "Pre-activated bank accounts for wire drop. Contact @MoneyDropFast on Telegram now!"
    scan_res = client.post("/api/ads/analyze", json={"content": ad_content, "source_type": "text"})
    assert scan_res.status_code == 200
    ad_data = scan_res.json()
    ad_id = ad_data["id"]

    assert ad_data["analysis"]["risk_score"] >= 70.0

    # Open case linked to this ad
    case_res = client.post("/api/cases", json={
        "title": f"Triage Case for Ad #{ad_id}",
        "description": "High risk mule account seller",
        "priority": "HIGH",
        "ad_ids": [ad_id]
    })
    assert case_res.status_code == 200
    assert case_res.json()["advertisements_count"] == 1


def test_workflow_3_url_scan_and_safe_fallback():
    """Workflow 3: Run URL scan -> Handle unavailable site safely."""
    url = "https://unreachable-mock-destination-8842.xyz"
    scan_res = client.post("/api/scanner/url", json={"url": url})
    assert scan_res.status_code == 200
    data = scan_res.json()
    assert data["domain"] == "unreachable-mock-destination-8842.xyz"
    assert "checks_completed" in data
    assert "checks_unavailable" in data
