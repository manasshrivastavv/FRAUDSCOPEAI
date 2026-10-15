import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.core.config import settings
from app.database.session import engine, Base, SessionLocal
from app.services.seed_data import seed_database_if_empty
from app.services.model_service import get_or_train_model

from app.api.auth import router as auth_router
from app.api.ads import router as ads_router
from app.api.dashboard import router as dashboard_router
from app.api.cases import router as cases_router
from app.api.network import router as network_router
from app.api.alerts import router as alerts_router
from app.api.reports import router as reports_router
from app.api.settings import router as settings_router
from app.api.scanner import router as scanner_router
from app.api.notifications import router as notifications_router

import asyncio
from app.services.ingestion import ingestion_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Register running event loop with broadcaster for cross-thread SSE
    from app.services.broadcaster import broadcaster
    broadcaster.set_loop(asyncio.get_running_loop())

    # Ensure tables exist
    Base.metadata.create_all(bind=engine)

    # SQLite schema compatibility: ensure all columns exist across tables
    try:
        with engine.connect() as conn:
            # Table: advertisements
            ad_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(advertisements)")).fetchall()]
            if "advertiser_name" not in ad_cols:
                conn.execute(text("ALTER TABLE advertisements ADD COLUMN advertiser_name VARCHAR(128)"))
            if "external_id" not in ad_cols:
                conn.execute(text("ALTER TABLE advertisements ADD COLUMN external_id VARCHAR(128)"))
            if "raw_metadata" not in ad_cols:
                conn.execute(text("ALTER TABLE advertisements ADD COLUMN raw_metadata TEXT"))
            if "is_demo" not in ad_cols:
                conn.execute(text("ALTER TABLE advertisements ADD COLUMN is_demo BOOLEAN DEFAULT 0"))
            if "data_source" not in ad_cols:
                conn.execute(text("ALTER TABLE advertisements ADD COLUMN data_source VARCHAR(32) DEFAULT 'LIVE_SCAN'"))

            # Table: analysis_results
            res_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(analysis_results)")).fetchall()]
            if "model_score" not in res_cols:
                conn.execute(text("ALTER TABLE analysis_results ADD COLUMN model_score FLOAT"))
            if "model_version" not in res_cols:
                conn.execute(text("ALTER TABLE analysis_results ADD COLUMN model_version VARCHAR(64)"))
            if "model_class" not in res_cols:
                conn.execute(text("ALTER TABLE analysis_results ADD COLUMN model_class VARCHAR(32)"))

            # Table: users
            user_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
            if "avatar_url" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512)"))

            conn.commit()
    except Exception as e:
        print(f"[Warning] Schema auto-migration notice: {e}")
    
    # Train or load ML baseline
    get_or_train_model()

    # Seed initial dataset if database is empty
    db = SessionLocal()
    try:
        seed_database_if_empty(db)
    finally:
        db.close()

    # Telegram live background worker (if credentials configured)
    tg_task = None
    tg_adapter = ingestion_service.get_adapter("telegram_feed")
    if tg_adapter and tg_adapter.is_configured:
        async def telegram_background_worker():
            await asyncio.sleep(3) # Initial warmup delay
            while True:
                try:
                    db_sess = SessionLocal()
                    try:
                        posts = await tg_adapter.poll_channel_messages_async(limit_per_channel=10)
                        for post in posts:
                            ingestion_service.ingest_post(db_sess, post, actor="Telegram:LiveWorker")
                    finally:
                        db_sess.close()
                    await asyncio.sleep(settings.TELEGRAM_POLL_INTERVAL)
                except asyncio.CancelledError:
                    break
                except Exception:
                    await asyncio.sleep(settings.TELEGRAM_POLL_INTERVAL)

        tg_task = asyncio.create_task(telegram_background_worker())

    yield

    # Clean shutdown
    if tg_task:
        tg_task.cancel()
        try:
            await tg_task
        except asyncio.CancelledError:
            pass
    if tg_adapter and hasattr(tg_adapter, "stop_monitoring"):
        tg_adapter.stop_monitoring()

app = FastAPI(
    title="FraudScope AI API",
    version=settings.VERSION,
    description="AI-Powered Financial Advertisement Fraud Detection & Investigation Platform",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health Check Endpoint
@app.get("/api/health")
def health_check():
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    return {
        "status": "online" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "mode": "Demonstration"
    }

# Mount Static Files for User Avatars and Uploads
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(os.path.join(UPLOAD_DIR, "avatars"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Register API Routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(ads_router, prefix=settings.API_V1_STR)
app.include_router(dashboard_router, prefix=settings.API_V1_STR)
app.include_router(cases_router, prefix=settings.API_V1_STR)
app.include_router(network_router, prefix=settings.API_V1_STR)
app.include_router(alerts_router, prefix=settings.API_V1_STR)
app.include_router(reports_router, prefix=settings.API_V1_STR)
app.include_router(settings_router, prefix=settings.API_V1_STR)
app.include_router(scanner_router, prefix=settings.API_V1_STR)
app.include_router(notifications_router, prefix=settings.API_V1_STR)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
