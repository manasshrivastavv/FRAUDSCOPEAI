import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.models.models import Base, User, SystemSetting, Advertisement, AnalysisResult, Case, Alert
from app.services.model_service import predict_risk, load_model
from app.services.seed_data import seed_database_if_empty
from app.main import app
from app.core.config import settings


def test_predict_risk_return_contract_five_tuple():
    """
    Verifies that predict_risk() strictly returns a 5-element tuple:
    (model_available, probability_score_0_to_1, predicted_class, model_version, contributing_tokens).
    Confirms unpacking 5 values succeeds and unpacking 2 values raises ValueError.
    """
    sample_text = "urgent requirement bank account commission basis daily payout"
    res = predict_risk(sample_text)

    # 1. Verify tuple structure and length
    assert isinstance(res, tuple), "predict_risk must return a tuple"
    assert len(res) == 5, f"Expected 5 values from predict_risk, got {len(res)}"

    # 2. Unpack into 5 variables
    model_avail, model_prob, model_class, model_version, model_tokens = res

    assert isinstance(model_avail, bool)
    if model_avail:
        assert isinstance(model_prob, float)
        assert 0.0 <= model_prob <= 1.0
        assert model_class in ("safe", "needs_review", "suspicious")
        assert isinstance(model_version, str)
        assert isinstance(model_tokens, list)
        if model_tokens:
            first_tok = model_tokens[0]
            assert "token" in first_tok
            assert "contribution" in first_tok

    # 3. Verify that trying to unpack only 2 values raises ValueError: too many values to unpack
    with pytest.raises(ValueError, match="too many values to unpack"):
        val1, val2 = predict_risk(sample_text)


def test_predict_risk_empty_text_contract():
    """
    Verifies that predict_risk() with empty or whitespace string returns safe 5-tuple defaults.
    """
    for empty_input in ["", "   ", "\n\t"]:
        res = predict_risk(empty_input)
        assert isinstance(res, tuple)
        assert len(res) == 5
        model_avail, model_prob, model_class, model_version, model_tokens = res
        assert model_avail is False
        assert model_prob is None
        assert model_class is None
        assert model_version is None
        assert model_tokens == []


def test_seed_database_production_mode_does_not_seed_demo_ads():
    """
    Verifies that in production mode (seed_demo_records=False or DEMO_MODE=false),
    seed_database_if_empty() creates default admin user and system settings,
    but does NOT seed synthetic advertisement records.
    """
    test_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=test_engine)
    TestingSession = sessionmaker(bind=test_engine)
    db = TestingSession()

    try:
        # Explicitly pass seed_demo_records=False
        seed_database_if_empty(db, seed_demo_records=False)

        # Admin user must be present
        users_count = db.query(User).count()
        assert users_count == 1
        admin_user = db.query(User).filter_by(username="investigator").first()
        assert admin_user is not None

        # System settings must be present
        settings_count = db.query(SystemSetting).count()
        assert settings_count >= 5
        demo_setting = db.query(SystemSetting).filter_by(key="demo_mode").first()
        assert demo_setting is not None
        assert demo_setting.value == "false"

        # Advertisements must NOT be seeded
        ad_count = db.query(Advertisement).count()
        assert ad_count == 0, f"Expected 0 advertisements in production mode, got {ad_count}"
        case_count = db.query(Case).count()
        assert case_count == 0
    finally:
        db.close()


def test_seed_database_demo_mode_seeds_ads_without_unpack_error():
    """
    Verifies that when demo mode is enabled (seed_demo_records=True),
    seed_database_if_empty() cleanly seeds sample ads, uses the 5-value predict_risk return,
    and creates cases and alerts without any ValueError or crash.
    """
    test_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=test_engine)
    TestingSession = sessionmaker(bind=test_engine)
    db = TestingSession()

    try:
        # Seed with demo records enabled
        seed_database_if_empty(db, seed_demo_records=True)

        # Verify advertisements seeded
        ad_count = db.query(Advertisement).count()
        assert ad_count > 0, "Advertisements should be seeded in demo mode"

        # Verify AnalysisResults exist and model metadata is populated
        analysis_records = db.query(AnalysisResult).all()
        assert len(analysis_records) == ad_count
        first_analysis = analysis_records[0]
        assert first_analysis.risk_score >= 0.0
        assert first_analysis.risk_level in ("LOW", "MEDIUM", "HIGH")

        # Verify demonstration cases were seeded
        cases_count = db.query(Case).count()
        assert cases_count >= 2

        # Verify alerts were seeded
        alerts_count = db.query(Alert).count()
        assert alerts_count >= 1

        # Test idempotency: calling a second time preserves existing records
        seed_database_if_empty(db, seed_demo_records=True)
        assert db.query(Advertisement).count() == ad_count
        assert db.query(Case).count() == cases_count
    finally:
        db.close()


def test_health_endpoints_and_lifespan():
    """
    Verifies FastAPI application startup and both /health and /api/health endpoints.
    """
    client = TestClient(app)
    
    # Check /api/health
    resp_api = client.get("/api/health")
    assert resp_api.status_code == 200
    data_api = resp_api.json()
    assert data_api["status"] == "online"
    assert data_api["database"] == "connected"
    assert "version" in data_api
    assert "mode" in data_api

    # Check /health (for standard container / Render health checks)
    resp_root = client.get("/health")
    assert resp_root.status_code == 200
    data_root = resp_root.json()
    assert data_root["status"] == "online"
    assert data_root["database"] == "connected"
