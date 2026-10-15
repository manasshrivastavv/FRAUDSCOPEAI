import os
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field

class IngestedPost(BaseModel):
    """
    Standard normalized schema for all incoming posts and advertisements
    from any source (Meta Ad Library, Telegram, Manual Scan, Bulk Dataset).
    """
    content: str = Field(..., description="Advertisement body text or transcript")
    platform: str = Field(default="Unknown", description="Source platform e.g. Facebook, Instagram, Telegram, WhatsApp, Web")
    advertiser_name: Optional[str] = Field(default=None, description="Account name, advertiser name, or channel title")
    external_id: Optional[str] = Field(default=None, description="External native ID e.g. Meta ad ID, Telegram message ID")
    submitted_url: Optional[str] = Field(default=None, description="Target landing page or social media post link")
    source_type: str = Field(default="api_feed", description="api_feed, manual_entry, screenshot_ocr, csv_batch")
    data_source: str = Field(default="REAL_API", description="REAL_API, MANUAL_SUBMISSION, SYNTHETIC_DEMO, DATASET_IMPORT")
    is_demo: bool = Field(default=False, description="Flag indicating whether data is sample/demo vs live")
    raw_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Raw source-specific payload for forensics")
    created_at: Optional[datetime] = None

class SourceAdapterStatus(BaseModel):
    adapter_id: str
    name: str
    platform: str
    status: str # ACTIVE, PENDING_AUTHORIZATION, UNCONFIGURED, AVAILABLE
    configured: bool
    requires_auth: bool
    description: str
    auth_instructions: Optional[str] = None
    records_count: int = 0
    last_sync_at: Optional[datetime] = None

class SourceNotConfiguredException(Exception):
    """Raised when an unconfigured or unauthorized source adapter is invoked for live fetching."""
    pass

class BaseSourceAdapter(ABC):
    """
    Abstract interface for multi-platform intelligence ingestion adapters.
    Ensures future sources (Meta, Telegram, WhatsApp, Twitter/X) can be
    plugged in independently without modifying core fraud detection or DB models.
    """
    @property
    @abstractmethod
    def adapter_id(self) -> str:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    @abstractmethod
    def platform(self) -> str:
        pass

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        pass

    @abstractmethod
    def get_status(self, db_count: int = 0) -> SourceAdapterStatus:
        pass

    @abstractmethod
    def fetch_posts(self, query: Optional[str] = None, limit: int = 20) -> List[IngestedPost]:
        pass
