from typing import List, Optional
from datetime import datetime, timezone

from app.services.ingestion.base import BaseSourceAdapter, IngestedPost, SourceAdapterStatus

class ManualSubmissionAdapter(BaseSourceAdapter):
    """
    Adapter for direct investigator submissions, single URL scans, and OCR image extractions.
    Ensures manual analyst inputs are explicitly labeled as MANUAL_SUBMISSION and preserved.
    """
    @property
    def adapter_id(self) -> str:
        return "manual_submission"

    @property
    def name(self) -> str:
        return "Manual & OCR Submissions"

    @property
    def platform(self) -> str:
        return "Multi-Platform"

    @property
    def is_configured(self) -> bool:
        return True

    def get_status(self, db_count: int = 0) -> SourceAdapterStatus:
        return SourceAdapterStatus(
            adapter_id=self.adapter_id,
            name=self.name,
            platform=self.platform,
            status="ACTIVE",
            configured=True,
            requires_auth=False,
            description="Direct intelligence uploads via web UI, OCR screenshot transcription, and targeted URL audits.",
            auth_instructions="Always enabled. Requires investigator login session.",
            records_count=db_count
        )

    def fetch_posts(self, query: Optional[str] = None, limit: int = 20) -> List[IngestedPost]:
        return []
