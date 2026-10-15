import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import get_db, Base
from app.models.models import Advertisement, AnalysisResult, ExtractedEntity, User
from app.core.security import create_access_token

# Test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_live_feed.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        # Create a test analyst user
        test_user = User(
            id=999,
            full_name="Feed Tester",
            username="feed_tester",
            email="tester@fraudscope.local",
            password_hash="dummyhashedpassword",
            role="Fraud Analyst",
            is_active=True,
        )
        db.add(test_user)

        # Seed test advertisements across multiple platforms
        ad_instagram = Advertisement(
            id=101,
            custom_id="AD-INSTA-001",
            original_text="Exclusive work from home offer! Rent your bank account for 20000 per month.",
            normalized_text="exclusive work from home offer rent bank account 20000 month",
            platform="Instagram",
            source_type="text",
            advertiser_name="finance_guru_mumbai",
            external_id="meta_ad_998811",
            submitted_url="https://instagram.com/p/test001",
            content_hash="hash_insta_001",
            review_status="NEW",
            data_source="REAL_API",
            is_demo=False,
            analysis=AnalysisResult(
                risk_score=85.0,
                risk_level="HIGH",
                explanation="High risk bank account rental lure",
                recommended_review_action="Escalate to Cyber Cell",
            ),
        )

        ad_facebook = Advertisement(
            id=102,
            custom_id="AD-FB-002",
            original_text="Current account urgently needed for gaming withdrawals. Daily payments.",
            normalized_text="current account urgently needed gaming withdrawals daily payments",
            platform="Facebook",
            source_type="text",
            advertiser_name="quick_cash_india",
            external_id="fb_ad_445566",
            submitted_url="https://facebook.com/ads/445566",
            content_hash="hash_fb_002",
            review_status="NEEDS_REVIEW",
            data_source="MANUAL_SUBMISSION",
            is_demo=False,
            analysis=AnalysisResult(
                risk_score=78.0,
                risk_level="HIGH",
                explanation="Gaming mule recruitment",
                recommended_review_action="Flag for Review",
            ),
        )

        ad_telegram = Advertisement(
            id=103,
            custom_id="AD-TELE-003",
            original_text="Join VIP crypto mule group @crypto_lure_bot or UPI pay to fraud@okhdfcbank",
            normalized_text="join vip crypto mule group crypto_lure_bot upi pay fraud okhdfcbank",
            platform="Telegram",
            source_type="text",
            advertiser_name="crypto_channel",
            external_id="tg_msg_7788",
            submitted_url="https://t.me/crypto_lure_bot",
            content_hash="hash_tele_003",
            review_status="UNDER_INVESTIGATION",
            data_source="REAL_API",
            is_demo=False,
            analysis=AnalysisResult(
                risk_score=92.0,
                risk_level="HIGH",
                explanation="Direct Telegram mule recruiter bot",
                recommended_review_action="Investigate & Freeze UPI",
            ),
        )

        ad_whatsapp = Advertisement(
            id=104,
            custom_id="AD-WA-004",
            original_text="Earn money without investment call +919876543210 for immediate commission.",
            normalized_text="earn money without investment call 919876543210 immediate commission",
            platform="WhatsApp Group",
            source_type="text",
            advertiser_name="unknown_recruiter",
            external_id="wa_broadcast_12",
            submitted_url=None,
            content_hash="hash_wa_004",
            review_status="NEW",
            data_source="REAL_API",
            is_demo=False,
            analysis=AnalysisResult(
                risk_score=65.0,
                risk_level="MEDIUM",
                explanation="Part-time commission recruitment",
                recommended_review_action="Review Phone Activity",
            ),
        )

        ad_demo = Advertisement(
            id=105,
            custom_id="AD-DEMO-005",
            original_text="Synthetic test benchmark for mule detection testing.",
            normalized_text="synthetic test benchmark mule detection testing",
            platform="Classifieds",
            source_type="text",
            advertiser_name="synthetic_dataset",
            external_id="demo_005",
            submitted_url=None,
            content_hash="hash_demo_005",
            review_status="CLOSED",
            data_source="SYNTHETIC_DATASET",
            is_demo=True,
            analysis=AnalysisResult(
                risk_score=40.0,
                risk_level="LOW",
                explanation="Synthetic test benchmark item",
                recommended_review_action="None",
            ),
        )

        db.add_all([ad_instagram, ad_facebook, ad_telegram, ad_whatsapp, ad_demo])
        db.commit()

        # Add entities for phone, UPI, and telegram
        ent_phone = ExtractedEntity(
            advertisement_id=104,
            entity_type="PHONE",
            entity_value="+919876543210",
            normalized_value="+919876543210",
        )
        ent_upi = ExtractedEntity(
            advertisement_id=103,
            entity_type="UPI",
            entity_value="fraud@okhdfcbank",
            normalized_value="fraud@okhdfcbank",
        )
        ent_tg = ExtractedEntity(
            advertisement_id=103,
            entity_type="TELEGRAM",
            entity_value="@crypto_lure_bot",
            normalized_value="@crypto_lure_bot",
        )
        db.add_all([ent_phone, ent_upi, ent_tg])
        db.commit()
    finally:
        db.close()

    app.dependency_overrides[get_db] = override_get_db

    yield

    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    import os
    if os.path.exists("test_live_feed.db"):
        try:
            os.remove("test_live_feed.db")
        except Exception:
            pass


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


client = TestClient(app)


def get_auth_headers():
    token = create_access_token({"sub": "feed_tester", "role": "analyst"})
    return {"Authorization": f"Bearer {token}"}


class TestLiveFeedEndpoints:
    def test_list_all_platforms(self):
        """Test that list endpoint returns multi-platform records, not just Telegram."""
        headers = get_auth_headers()
        res = client.get("/api/ads?limit=20", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 5

        platforms = {item["platform"] for item in data["items"]}
        assert "Instagram" in platforms
        assert "Facebook" in platforms
        assert "Telegram" in platforms
        assert "WhatsApp Group" in platforms
        assert "Classifieds" in platforms

    def test_filter_by_platform(self):
        """Test explicit filtering by platform parameter."""
        headers = get_auth_headers()
        res_insta = client.get("/api/ads?platform=Instagram", headers=headers)
        assert res_insta.status_code == 200
        data_insta = res_insta.json()
        assert all(item["platform"] == "Instagram" for item in data_insta["items"])
        assert any(item["custom_id"] == "AD-INSTA-001" for item in data_insta["items"])

        res_fb = client.get("/api/ads?platform=Facebook", headers=headers)
        assert res_fb.status_code == 200
        data_fb = res_fb.json()
        assert all(item["platform"] == "Facebook" for item in data_fb["items"])

    def test_search_by_integer_id(self):
        """Test searching directly by integer primary key ID."""
        headers = get_auth_headers()
        res = client.get("/api/ads?search=101", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert len(data["items"]) >= 1
        assert any(item["id"] == 101 for item in data["items"])

    def test_search_by_custom_id(self):
        """Test searching by custom_id like AD-FB-002."""
        headers = get_auth_headers()
        res = client.get("/api/ads?search=AD-FB-002", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == 102

    def test_search_by_advertiser_name(self):
        """Test searching by advertiser/page name."""
        headers = get_auth_headers()
        res = client.get("/api/ads?search=finance_guru_mumbai", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert len(data["items"]) >= 1
        assert data["items"][0]["advertiser_name"] == "finance_guru_mumbai"

    def test_search_by_extracted_phone(self):
        """Test searching for an ad using its extracted telephone number."""
        headers = get_auth_headers()
        res = client.get("/api/ads?search=9876543210", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert len(data["items"]) >= 1
        assert any(item["id"] == 104 for item in data["items"])

    def test_search_by_extracted_upi(self):
        """Test searching for an ad using its extracted UPI handle."""
        headers = get_auth_headers()
        res = client.get("/api/ads?search=okhdfcbank", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert len(data["items"]) >= 1
        assert any(item["id"] == 103 for item in data["items"])

    def test_search_case_insensitive_and_empty(self):
        """Test case-insensitive search and empty results."""
        headers = get_auth_headers()
        # Case insensitive
        res = client.get("/api/ads?search=INSTAGRAM", headers=headers)
        assert res.status_code == 200
        assert len(res.json()["items"]) >= 1

        # No results state
        res_empty = client.get("/api/ads?search=NONEXISTENT_KEYWORD_XYZ999", headers=headers)
        assert res_empty.status_code == 200
        data_empty = res_empty.json()
        assert data_empty["total"] == 0
        assert len(data_empty["items"]) == 0

    def test_provenance_and_demo_filtering(self):
        """Ensure sample data is never returned when filtering for live only."""
        headers = get_auth_headers()
        # is_demo=False should exclude the demo item
        res = client.get("/api/ads?is_demo=false", headers=headers)
        assert res.status_code == 200
        data = res.json()
        for item in data["items"]:
            assert item["is_demo"] is False
            assert item["data_source"] != "SYNTHETIC_DATASET"

    def test_source_telemetry_endpoint(self):
        """Test GET /api/ads/sources returns all adapters including Meta Ad Library in PENDING_AUTHORIZATION."""
        headers = get_auth_headers()
        res = client.get("/api/ads/sources", headers=headers)
        assert res.status_code == 200
        sources = res.json()
        assert len(sources) >= 4

        adapter_ids = [s["adapter_id"] for s in sources]
        assert "meta_ad_library" in adapter_ids
        assert "telegram_feed" in adapter_ids
        assert "manual_submission" in adapter_ids
        assert "synthetic_demo" in adapter_ids

        meta_adapter = next(s for s in sources if s["adapter_id"] == "meta_ad_library")
        assert meta_adapter["requires_auth"] is True
        assert meta_adapter["status"] in ("PENDING_AUTHORIZATION", "CONFIGURED")

    def test_meta_sync_unconfigured_error(self):
        """Verify calling sync on unconfigured Meta raises clean 400 error rather than inventing fake data."""
        headers = get_auth_headers()
        res = client.post("/api/ads/sync-source/meta_ad_library", headers=headers)
        # Should be 400 explaining authorization requirement (unless user locally configured META_ACCESS_TOKEN)
        if res.status_code == 400:
            data = res.json()
            assert "authorization" in data["detail"].lower() or "token" in data["detail"].lower()

    def test_post_ingestion_and_persistence(self):
        """Test ingesting a new post via POST /api/ads/ingest and verifying database persistence."""
        headers = get_auth_headers()
        payload = {
            "content": "Bank account rent urgently needed. Need ATM card + PIN with linked SIM. Daily commission 50000. WhatsApp +919123456789.",
            "platform": "Instagram",
            "advertiser_name": "instant_income_hub",
            "submitted_url": "https://instagram.com/ad/12345",
            "is_demo": False,
        }
        res = client.post("/api/ads/ingest", json=payload, headers=headers)
        assert res.status_code == 200
        ingest_data = res.json()
        ad_id = ingest_data["id"]
        assert ad_id is not None
        assert ingest_data["analysis"]["risk_level"] in ("HIGH", "MEDIUM")
        assert ingest_data["analysis"]["risk_score"] > 50

        # Query back via GET /api/ads/{id}
        res_get = client.get(f"/api/ads/{ad_id}", headers=headers)
        assert res_get.status_code == 200
        ad_detail = res_get.json()
        assert ad_detail["platform"] == "Instagram"
        assert ad_detail["advertiser_name"] == "instant_income_hub"
        assert ad_detail["is_demo"] is False
        assert ad_detail["data_source"] == "MANUAL_SUBMISSION"

        # Verify duplicate prevention: ingesting exact same content returns same ad ID
        res_dup = client.post("/api/ads/ingest", json=payload, headers=headers)
        assert res_dup.status_code == 200
        dup_data = res_dup.json()
        assert dup_data["id"] == ad_id
