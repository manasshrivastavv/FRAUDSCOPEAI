import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from datetime import datetime, timezone

from app.main import app
from app.database.session import get_db, Base
from app.models.models import Advertisement, AnalysisResult, User
from app.core.security import create_access_token
from app.services.ingestion.telegram_adapter import (
    TelegramSourceAdapter,
    normalize_channel_identifier,
)
from app.services.ingestion.base import SourceNotConfiguredException, IngestedPost
from app.services.ingestion import ingestion_service
from telethon.errors import FloodWaitError

client = TestClient(app)

def get_auth_headers():
    token = create_access_token({"sub": "tester", "role": "analyst"})
    return {"Authorization": f"Bearer {token}"}


class TestTelegramLiveFeed:
    def test_normalize_channel_identifier(self):
        """Test channel identifier cleaning across various URL formats and prefixes."""
        assert normalize_channel_identifier("@fraud_watch") == "fraud_watch"
        assert normalize_channel_identifier("https://t.me/mule_recruitment") == "mule_recruitment"
        assert normalize_channel_identifier("http://www.t.me/crypto_scam") == "crypto_scam"
        assert normalize_channel_identifier("t.me/joinchat/xyz123") == "joinchat/xyz123"
        assert normalize_channel_identifier("  @clean_channel  ") == "clean_channel"

    def test_unconfigured_telegram_adapter_status(self):
        """Ensure unconfigured adapter gracefully reports PENDING_CONFIGURATION with setup instructions."""
        adapter = TelegramSourceAdapter(api_id=None, api_hash="", channels="")
        adapter._explicit_config = True
        adapter._refresh_configuration()

        assert adapter.is_configured is False
        status = adapter.get_status(db_count=10)
        assert status.status == "PENDING_CONFIGURATION"
        assert status.configured is False
        assert status.requires_auth is True
        assert "my.telegram.org" in status.auth_instructions

        with pytest.raises(SourceNotConfiguredException):
            adapter.fetch_posts(limit=10)

    def test_live_status_endpoint(self):
        """Test GET /api/ads/live-status returns telemetry and total count."""
        headers = get_auth_headers()
        res = client.get("/api/ads/live-status", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "total_records" in data
        assert "latest_ad_id" in data
        assert "telegram_status" in data
        assert data["telegram_status"]["adapter_id"] == "telegram_feed"

    def test_telegram_poll_unconfigured_error(self):
        """Verify calling /api/ads/telegram/poll when unconfigured returns clean 400 error."""
        headers = get_auth_headers()
        adapter = ingestion_service.get_adapter("telegram_feed")
        orig_api_id = adapter._api_id
        orig_explicit = getattr(adapter, "_explicit_config", False)
        try:
            adapter._explicit_config = True
            adapter._api_id = None
            adapter._api_hash = ""
            adapter._refresh_configuration()

            res = client.post("/api/ads/telegram/poll", headers=headers)
            assert res.status_code == 400
            assert "telegram" in res.json()["detail"].lower()
        finally:
            adapter._explicit_config = orig_explicit
            adapter._api_id = orig_api_id
            adapter._refresh_configuration()

    def test_telegram_rate_limiting_flood_wait(self):
        """Verify Telethon FloodWaitError is caught safely and reports RATE_LIMITED status."""
        import asyncio
        adapter = TelegramSourceAdapter()
        adapter._api_id = 12345
        adapter._api_hash = "fakehash123"
        adapter._channels_raw = "test_channel"
        adapter._refresh_configuration()

        mock_client = MagicMock()
        mock_client.is_connected.return_value = True
        mock_client.is_user_authorized = AsyncMock(return_value=True)

        async def raise_flood(*args, **kwargs):
            raise FloodWaitError(request=None, capture=60)

        mock_client.get_entity = raise_flood
        adapter._client = mock_client

        async def run_test():
            with patch.object(adapter, "connect_client_async", new=AsyncMock(return_value=True)):
                posts = await adapter.poll_channel_messages_async(channels=["test_channel"])
                assert posts == []
                assert adapter._status == "RATE_LIMITED"
                assert "60" in adapter._status_message

        asyncio.run(run_test())

    def test_telegram_message_ingestion_and_deduplication(self):
        """Verify incoming Telegram messages are parsed, risk scored, and deduplicated."""
        import asyncio
        adapter = TelegramSourceAdapter()
        adapter._api_id = 99999
        adapter._api_hash = "hash999"
        adapter._channels_raw = "watch_channel"
        adapter._refresh_configuration()

        mock_entity = MagicMock()
        mock_entity.id = 887766
        mock_entity.title = "Financial Watch Group"
        mock_entity.username = "watch_channel"

        mock_msg = MagicMock()
        mock_msg.id = 456
        mock_msg.message = "URGENT: Rent your SBI bank account for gaming payouts. Contact @recruiter_bot"
        mock_msg.text = mock_msg.message
        mock_msg.date = datetime.now(timezone.utc)
        mock_msg.views = 500
        mock_msg.forwards = 10

        async def mock_iter(*args, **kwargs):
            yield mock_msg

        mock_client = MagicMock()
        mock_client.get_entity = AsyncMock(return_value=mock_entity)
        mock_client.iter_messages = mock_iter
        adapter._client = mock_client

        async def run_test():
            with patch.object(adapter, "connect_client_async", new=AsyncMock(return_value=True)):
                posts = await adapter.poll_channel_messages_async(channels=["watch_channel"])
                assert len(posts) == 1
                post = posts[0]
                assert post.platform == "Telegram"
                assert post.external_id == "TG-887766-456"
                assert post.advertiser_name == "watch_channel"
                assert post.submitted_url == "https://t.me/watch_channel/456"
                assert "recruiter_bot" in post.content
                assert post.data_source == "REAL_API"
                assert post.is_demo is False

        asyncio.run(run_test())

    def test_telegram_test_connection_endpoint(self):
        """Verify POST /api/ads/telegram/test-connection returns diagnostic telemetry without exposing secrets."""
        headers = get_auth_headers()
        res = client.post("/api/ads/telegram/test-connection", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "status" in data
        assert "connected_to_dc" in data
        assert "user_authorized" in data
        assert "channels_count" in data
        assert "message" in data
        # Ensure credentials are NOT leaked in response
        assert "api_hash" not in data
        assert "secret" not in data
        assert "token" not in data

    def test_telegram_test_connection_unconfigured(self):
        """Verify test connection reports PENDING_CONFIGURATION when credentials are missing."""
        import asyncio
        adapter = TelegramSourceAdapter(api_id=None, api_hash="")
        async def run_test():
            res = await adapter.test_connection_async()
            assert res["success"] is False
            assert res["status"] == "PENDING_CONFIGURATION"
            assert res["connected_to_dc"] is False
        asyncio.run(run_test())

    def test_telegram_test_connection_authorized(self):
        """Verify test connection reports CONNECTED when authorized."""
        import asyncio
        adapter = TelegramSourceAdapter(api_id=12345, api_hash="hash123", channels="chan1,chan2")
        mock_client = MagicMock()
        mock_client.is_connected.return_value = True
        mock_client.is_user_authorized = AsyncMock(return_value=True)
        adapter._client = mock_client

        async def run_test():
            with patch.object(mock_client, "connect", new=AsyncMock(return_value=True)):
                res = await adapter.test_connection_async()
                assert res["success"] is True
                assert res["status"] == "CONNECTED"
                assert res["connected_to_dc"] is True
                assert res["user_authorized"] is True
                assert res["channels_count"] == 2
        asyncio.run(run_test())

