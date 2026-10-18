import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.session import engine, Base, SessionLocal
from app.services.seed_data import seed_database_if_empty
from app.services.model_service import get_or_train_model

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    get_or_train_model()
    db = SessionLocal()
    try:
        seed_database_if_empty(db, seed_demo_records=True)
    finally:
        db.close()
    yield
