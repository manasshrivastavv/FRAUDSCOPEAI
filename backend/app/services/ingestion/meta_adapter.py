import os
from typing import List, Optional
from datetime import datetime, timezone
import httpx

from app.services.ingestion.base import BaseSourceAdapter, IngestedPost, SourceAdapterStatus, SourceNotConfiguredException

class MetaAdLibraryAdapter(BaseSourceAdapter):
    """
    Integration adapter for Meta Ad Library API (Facebook and Instagram).
    Connects to Graph API /ads_archive endpoint when authorized.
    Correctly reports PENDING_AUTHORIZATION when credentials are unconfigured,
    ensuring no fake or mocked responses are generated.
    """
    API_URL = "https://graph.facebook.com/v19.0/ads_archive"

    def __init__(self):
        self.access_token = os.getenv("META_ACCESS_TOKEN", "").strip()
        self.app_id = os.getenv("META_APP_ID", "").strip()

    @property
    def adapter_id(self) -> str:
        return "meta_ad_library"

    @property
    def name(self) -> str:
        return "Meta Ad Library (Facebook & Instagram)"

    @property
    def platform(self) -> str:
        return "Meta" # Parent platform covering Facebook and Instagram

    @property
    def is_configured(self) -> bool:
        return bool(self.access_token)

    def get_status(self, db_count: int = 0) -> SourceAdapterStatus:
        if self.is_configured:
            status_str = "ACTIVE"
            instructions = "Meta Graph API token is active and authorized."
        else:
            status_str = "PENDING_AUTHORIZATION"
            instructions = (
                "Meta Ad Library API access is pending developer authorization. "
                "To connect: 1) Register at developers.facebook.com, 2) Request access to Ad Library API, "
                "3) Set META_ACCESS_TOKEN and META_APP_ID in backend .env."
            )

        return SourceAdapterStatus(
            adapter_id=self.adapter_id,
            name=self.name,
            platform=self.platform,
            status=status_str,
            configured=self.is_configured,
            requires_auth=True,
            description="Official public transparency archive indexing sponsored Facebook and Instagram financial promotions.",
            auth_instructions=instructions,
            records_count=db_count
        )

    def fetch_posts(self, query: Optional[str] = None, limit: int = 20) -> List[IngestedPost]:
        """
        Queries Meta Ad Library API for financial ad creatives in target countries.
        Raises SourceNotConfiguredException if token is missing.
        """
        if not self.is_configured:
            raise SourceNotConfiguredException(
                "Meta Ad Library API access is pending authorization. "
                "Please configure META_ACCESS_TOKEN to stream live Facebook and Instagram advertisements. "
                "Existing database records and manual submissions remain fully operational."
            )

        # Real Meta Graph API request
        params = {
            "access_token": self.access_token,
            "ad_reached_countries": "['IN', 'US', 'GB']",
            "ad_type": "ALL",
            "search_terms": query or "bank account rent earn daily instant investment",
            "fields": "id,ad_creative_bodies,ad_creative_link_titles,page_name,page_id,publisher_platforms,ad_snapshot_url",
            "limit": min(limit, 50)
        }

        with httpx.Client(timeout=15.0) as client:
            resp = client.get(self.API_URL, params=params)
            if resp.status_code != 200:
                raise RuntimeError(f"Meta Ad Library API error ({resp.status_code}): {resp.text}")

            data = resp.json()
            posts: List[IngestedPost] = []
            now = datetime.now(timezone.utc)

            for item in data.get("data", []):
                ad_id = str(item.get("id"))
                page_name = item.get("page_name", "Unknown Advertiser")
                bodies = item.get("ad_creative_bodies", [])
                text_content = bodies[0] if bodies else item.get("ad_creative_link_titles", [""])[0]
                
                # Determine platforms (Facebook, Instagram, or both)
                pubs = item.get("publisher_platforms", [])
                if "instagram" in pubs and "facebook" not in pubs:
                    plat = "Instagram"
                elif "facebook" in pubs and "instagram" not in pubs:
                    plat = "Facebook"
                else:
                    plat = "Facebook" if "facebook" in pubs else "Instagram"

                posts.append(IngestedPost(
                    content=text_content,
                    platform=plat,
                    advertiser_name=page_name,
                    external_id=f"META-{ad_id}",
                    submitted_url=item.get("ad_snapshot_url"),
                    source_type="api_feed",
                    data_source="REAL_API",
                    is_demo=False,
                    raw_metadata=item,
                    created_at=now
                ))

            return posts
