import os
from pathlib import Path
from typing import Optional, List
from pydantic import BaseModel
from dotenv import load_dotenv

# Automatically locate and load backend/.env or root .env
_backend_dir = Path(__file__).resolve().parent.parent.parent
_root_dir = _backend_dir.parent

if (_backend_dir / ".env").exists():
    load_dotenv(_backend_dir / ".env")
elif (_root_dir / ".env").exists():
    load_dotenv(_root_dir / ".env")
else:
    load_dotenv()

_root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
_db_file = os.path.join(_root_dir, "fraudscope.db").replace("\\", "/")

_raw_db_url = os.getenv("DATABASE_URL", "").strip()
if not _raw_db_url or _raw_db_url in ("sqlite:///./fraudscope.db", "sqlite:///fraudscope.db"):
    _canonical_db_url = f"sqlite:///{_db_file}"
else:
    _canonical_db_url = _raw_db_url

_raw_cors = os.getenv("BACKEND_CORS_ORIGINS", "") or os.getenv("CORS_ORIGINS", "")
_default_cors = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://fraudscopeai.onrender.com",
    "https://fraudscopeai.vercel.app",
    "https://fraudscopeai.vercel.app/",
]
if _raw_cors:
    for _o in _raw_cors.split(","):
        _cleaned_origin = _o.strip()
        if _cleaned_origin and _cleaned_origin not in _default_cors:
            _default_cors.append(_cleaned_origin)

class Settings(BaseModel):
    PROJECT_NAME: str = "FraudScope AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Database
    DATABASE_URL: str = _canonical_db_url
    
    # Risk Scoring Thresholds
    RISK_THRESHOLD_LOW: int = int(os.getenv("RISK_THRESHOLD_LOW", "35"))
    RISK_THRESHOLD_HIGH: int = int(os.getenv("RISK_THRESHOLD_HIGH", "65"))
    SIMILARITY_THRESHOLD: float = float(os.getenv("SIMILARITY_THRESHOLD", "0.78"))
    DEMO_MODE: bool = os.getenv("DEMO_MODE", "false").lower() in ("true", "1", "yes")
    
    # Authentication
    SECRET_KEY: str = os.getenv("SECRET_KEY", "fraudscope-ai-production-grade-secret-key-2026-finguard")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours

    # Telegram Surveillance Settings (Telethon)
    TELEGRAM_API_ID: Optional[int] = (
        int(os.getenv("TELEGRAM_API_ID").strip())
        if os.getenv("TELEGRAM_API_ID", "").strip().isdigit()
        else None
    )
    TELEGRAM_API_HASH: str = os.getenv("TELEGRAM_API_HASH", "").strip()
    TELEGRAM_CHANNELS: str = os.getenv("TELEGRAM_CHANNELS", "").strip()
    TELEGRAM_SESSION_NAME: str = os.getenv("TELEGRAM_SESSION_NAME", "fraudscope_telegram").strip()
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    TELEGRAM_POLL_INTERVAL: int = int(os.getenv("TELEGRAM_POLL_INTERVAL", "30"))

    # CORS
    BACKEND_CORS_ORIGINS: list[str] = _default_cors

settings = Settings()
