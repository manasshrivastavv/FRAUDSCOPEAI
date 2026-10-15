import os
import csv
from typing import List, Optional
from datetime import datetime, timezone

from app.services.ingestion.base import BaseSourceAdapter, IngestedPost, SourceAdapterStatus

class SyntheticDatasetAdapter(BaseSourceAdapter):
    """
    Adapter for synthetic demonstration records and ML training benchmarks.
    Guarantees demo data is strictly tagged as is_demo=True and never confused with live data.
    """
    @property
    def adapter_id(self) -> str:
        return "synthetic_demo"

    @property
    def name(self) -> str:
        return "Synthetic Demonstration Dataset"

    @property
    def platform(self) -> str:
        return "Multi-Platform Demo"

    @property
    def is_configured(self) -> bool:
        return True

    def get_status(self, db_count: int = 0) -> SourceAdapterStatus:
        return SourceAdapterStatus(
            adapter_id=self.adapter_id,
            name=self.name,
            platform=self.platform,
            status="AVAILABLE",
            configured=True,
            requires_auth=False,
            description="Synthetic advertising lures, benchmark scams, and curated test specimens for training and verification.",
            auth_instructions="Always enabled for demonstration and testing purposes.",
            records_count=db_count
        )

    def fetch_posts(self, query: Optional[str] = None, limit: int = 20) -> List[IngestedPost]:
        csv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "data", "sample_ads.csv"))
        if not os.path.exists(csv_path):
            return []

        posts: List[IngestedPost] = []
        now = datetime.now(timezone.utc)

        with open(csv_path, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                if limit and i >= limit:
                    break
                content = row.get("content", "").strip()
                if not content:
                    continue
                custom_id = row.get("id")
                submitted_url = row.get("submitted_url")
                
                # Determine platform
                plat = "Telegram" if "t.me" in str(submitted_url) or "telegram" in content.lower() else "Web"
                if "instagram" in content.lower():
                    plat = "Instagram"
                elif "facebook" in content.lower():
                    plat = "Facebook"

                posts.append(IngestedPost(
                    content=content,
                    platform=plat,
                    advertiser_name="Demo Syndicate",
                    external_id=custom_id,
                    submitted_url=submitted_url,
                    source_type="csv_batch",
                    data_source="SYNTHETIC_DEMO",
                    is_demo=True,
                    created_at=now
                ))

        return posts
