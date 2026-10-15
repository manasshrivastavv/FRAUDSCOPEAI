import os
import re
import asyncio
import logging
from typing import List, Dict, Any, Optional, Set, Callable
from datetime import datetime, timezone

from app.core.config import settings
from app.services.ingestion.base import (
    BaseSourceAdapter,
    IngestedPost,
    SourceAdapterStatus,
    SourceNotConfiguredException,
)

logger = logging.getLogger("fraudscope.telegram")

# Optional Telethon import to allow running even if Telethon encounters platform-specific errors
try:
    from telethon import TelegramClient, events
    from telethon.errors import (
        FloodWaitError,
        ChannelPrivateError,
        ChannelInvalidError,
        UsernameNotOccupiedError,
        UsernameInvalidError,
        AuthKeyError,
        SessionPasswordNeededError,
    )
    TELETHON_AVAILABLE = True
except ImportError:
    TELETHON_AVAILABLE = False
    TelegramClient = None
    events = None


def normalize_channel_identifier(raw: str) -> str:
    """
    Cleans raw channel input into a canonical Telegram username or invite handle.
    e.g. '@fraud_watch' -> 'fraud_watch'
         'https://t.me/mule_recruitment' -> 'mule_recruitment'
         't.me/joinchat/xyz' -> 'joinchat/xyz'
    """
    raw = raw.strip()
    # Strip protocol and domain
    raw = re.sub(r"^https?://(?:www\.)?t\.me/", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"^t\.me/", "", raw, flags=re.IGNORECASE)
    # Strip leading @
    if raw.startswith("@"):
        raw = raw[1:]
    return raw.strip()


class TelegramSourceAdapter(BaseSourceAdapter):
    """
    Production-grade Telegram intelligence ingestion adapter using Telethon MTProto API.
    Monitors explicitly configured public Telegram channels for financial fraud,
    mule recruitment offers, and illicit UPI / bank account rental lures.
    """

    def __init__(
        self,
        api_id: Optional[int] = None,
        api_hash: Optional[str] = None,
        channels: Optional[str] = None,
        session_name: Optional[str] = None,
        bot_token: Optional[str] = None,
        poll_interval: Optional[int] = None,
    ):
        self._explicit_config: bool = (api_id is not None or api_hash is not None or channels is not None)
        self._api_id: Optional[int] = api_id if api_id is not None else settings.TELEGRAM_API_ID
        self._api_hash: str = api_hash if api_hash is not None else (settings.TELEGRAM_API_HASH or "")
        self._channels_raw: str = channels if channels is not None else (settings.TELEGRAM_CHANNELS or "")
        self._session_name: str = session_name or settings.TELEGRAM_SESSION_NAME or "fraudscope_telegram"
        self._bot_token: str = bot_token if bot_token is not None else (settings.TELEGRAM_BOT_TOKEN or "")
        self._poll_interval: int = poll_interval or settings.TELEGRAM_POLL_INTERVAL or 30

        self._client: Optional[Any] = None
        self._client_lock = asyncio.Lock() if asyncio else None

        # Telemetry & Status State
        self._status: str = "PENDING_CONFIGURATION"
        self._status_message: Optional[str] = None
        self._last_sync_at: Optional[datetime] = None
        self._last_message_at: Optional[datetime] = None
        self._messages_ingested_count: int = 0
        self._flood_wait_until: Optional[float] = None
        self._active_channels: List[str] = []
        self._is_running: bool = False
        self._monitor_task: Optional[asyncio.Task] = None

        self._refresh_configuration()

    @property
    def adapter_id(self) -> str:
        return "telegram_feed"

    @property
    def name(self) -> str:
        return "Telegram Surveillance Feed"

    @property
    def platform(self) -> str:
        return "Telegram"

    @property
    def is_configured(self) -> bool:
        return bool(self._api_id and self._api_hash)

    def get_configured_channels(self) -> List[str]:
        """Returns clean list of target public channel identifiers."""
        if not self._channels_raw:
            return []
        tokens = [t.strip() for t in self._channels_raw.split(",") if t.strip()]
        cleaned = [normalize_channel_identifier(t) for t in tokens if t]
        return [c for c in cleaned if c]

    def _refresh_configuration(self):
        """Inspects environment settings and updates adapter readiness state."""
        if not getattr(self, "_explicit_config", False):
            self._api_id = settings.TELEGRAM_API_ID
            self._api_hash = settings.TELEGRAM_API_HASH or ""
            self._channels_raw = settings.TELEGRAM_CHANNELS or ""

        channels = self.get_configured_channels()
        self._active_channels = channels

        if not TELETHON_AVAILABLE:
            self._status = "ERROR"
            self._status_message = "Telethon package is not installed."
            return

        if not self.is_configured:
            self._status = "PENDING_CONFIGURATION"
            self._status_message = (
                "Telethon API credentials not configured. "
                "Provide TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_CHANNELS in .env "
                "(obtained from https://my.telegram.org) to enable automated channel monitoring. "
                "Manual submission and OCR scanning remain fully active."
            )
        elif not channels:
            self._status = "AUTH_CONFIGURED_NO_CHANNELS"
            self._status_message = (
                "Telegram API credentials configured, but TELEGRAM_CHANNELS is empty. "
                "Specify target public channels in .env (e.g. TELEGRAM_CHANNELS='channel1,channel2')."
            )
        else:
            self._status = "CONFIGURED"
            self._status_message = f"Ready to monitor {len(channels)} channel(s): {', '.join(channels[:3])}."

    def get_status(self, db_count: int = 0) -> SourceAdapterStatus:
        self._refresh_configuration()

        auth_instructions = (
            "1. Visit https://my.telegram.org and log in with your Telegram account.\n"
            "2. Navigate to 'API development tools' and create an app to obtain API_ID and API_HASH.\n"
            "3. Set TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_CHANNELS in your backend .env file.\n"
            "4. Restart the backend to activate automated live streaming."
        )

        return SourceAdapterStatus(
            adapter_id=self.adapter_id,
            name=self.name,
            platform=self.platform,
            status=self._status,
            configured=self.is_configured and bool(self._active_channels),
            requires_auth=True,
            description="Real-time surveillance of public Telegram broadcast channels, bot invites, and mule recruitment posts.",
            auth_instructions=self._status_message or auth_instructions,
            records_count=db_count,
            last_sync_at=self._last_sync_at
        )

    def get_client(self) -> Optional[Any]:
        """Lazy-instantiates the Telethon TelegramClient."""
        if not TELETHON_AVAILABLE or not self.is_configured:
            return None

        if self._client is None:
            # Place session file in backend/session directory
            session_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../sessions"))
            os.makedirs(session_dir, exist_ok=True)
            session_path = os.path.join(session_dir, self._session_name)

            self._client = TelegramClient(
                session_path,
                self._api_id,
                self._api_hash,
                connection_retries=5,
                retry_delay=3,
                timeout=15,
                auto_reconnect=True
            )
        return self._client

    async def connect_client_async(self) -> bool:
        """
        Safely connects to Telegram MTProto servers.
        Handles authorization checks and bot token authorization if present.
        """
        client = self.get_client()
        if not client:
            return False

        try:
            if not client.is_connected():
                await client.connect()

            is_authorized = await client.is_user_authorized()
            if not is_authorized:
                if self._bot_token:
                    logger.info("Authorizing Telegram client via BOT_TOKEN...")
                    await client.start(bot_token=self._bot_token)
                    is_authorized = await client.is_user_authorized()

            if is_authorized:
                self._status = "CONNECTED"
                self._status_message = "Connected to Telegram MTProto network."
                return True
            else:
                self._status = "AUTH_REQUIRED"
                self._status_message = (
                    "Telegram API credentials valid, but session requires interactive authentication. "
                    "Run interactive login script or provide an authorized session file."
                )
                return False

        except FloodWaitError as e:
            self._flood_wait_until = datetime.now(timezone.utc).timestamp() + e.seconds
            self._status = "RATE_LIMITED"
            self._status_message = f"Telegram rate limit: back off for {e.seconds} seconds."
            logger.warning(f"Telegram FloodWaitError: must wait {e.seconds}s")
            return False
        except Exception as e:
            self._status = "ERROR"
            self._status_message = f"Telegram connection error: {str(e)}"
            logger.error(f"Telegram connection error: {e}")
            return False

    async def test_connection_async(self) -> Dict[str, Any]:
        """
        Safely tests connection to Telegram Data Centers and validates MTProto handshake.
        Reports exact status, channel resolution readiness, and authorization status
        WITHOUT exposing API keys, secrets, or tokens.
        """
        self._refresh_configuration()
        channels = self.get_configured_channels()

        if not TELETHON_AVAILABLE:
            return {
                "success": False,
                "status": "ERROR",
                "connected_to_dc": False,
                "user_authorized": False,
                "channels_count": len(channels),
                "channels": channels,
                "message": "Telethon library is not installed in the environment."
            }

        if not self.is_configured:
            return {
                "success": False,
                "status": "PENDING_CONFIGURATION",
                "connected_to_dc": False,
                "user_authorized": False,
                "channels_count": len(channels),
                "channels": channels,
                "message": "Telegram API ID and Hash are not configured in backend/.env."
            }

        client = self.get_client()
        if not client:
            return {
                "success": False,
                "status": "ERROR",
                "connected_to_dc": False,
                "user_authorized": False,
                "channels_count": len(channels),
                "channels": channels,
                "message": "Could not instantiate Telegram client."
            }

        try:
            if not client.is_connected():
                await client.connect()

            connected = client.is_connected()
            is_authorized = await client.is_user_authorized() if connected else False

            if connected and not is_authorized and self._bot_token:
                try:
                    await client.start(bot_token=self._bot_token)
                    is_authorized = await client.is_user_authorized()
                except Exception as bot_err:
                    logger.warning(f"Bot token authorization failed: {bot_err}")

            if connected and is_authorized:
                account_type = "bot" if self._bot_token else "user"
                account_username = None
                if hasattr(client, "get_me"):
                    try:
                        me = await client.get_me()
                        if me:
                            account_type = "bot" if getattr(me, "bot", False) else "user"
                            account_username = getattr(me, "username", None)
                    except Exception:
                        pass

                channel_details = []
                for ch in channels:
                    if hasattr(client, "get_entity"):
                        try:
                            ent = await client.get_entity(ch)
                            title = getattr(ent, "title", None) or getattr(ent, "username", ch)
                            channel_details.append({"channel": ch, "status": "accessible", "title": title})
                        except Exception as ce:
                            channel_details.append({"channel": ch, "status": "inaccessible", "error": type(ce).__name__})
                    else:
                        channel_details.append({"channel": ch, "status": "unverified"})

                return {
                    "success": True,
                    "status": "CONNECTED",
                    "connected_to_dc": True,
                    "user_authorized": True,
                    "account_type": account_type,
                    "account_username": f"@{account_username}" if account_username else None,
                    "channels_count": len(channels),
                    "channels": channels,
                    "channel_diagnostics": channel_details,
                    "message": f"Successfully connected and authenticated with Telegram MTProto network as {account_type}. Monitoring {len(channels)} channel(s)."
                }
            elif connected:
                return {
                    "success": True,
                    "status": "AUTH_REQUIRED",
                    "connected_to_dc": True,
                    "user_authorized": False,
                    "channels_count": len(channels),
                    "channels": channels,
                    "message": (
                        "Connected to Telegram Data Center successfully (handshake verified). "
                        "MTProto session requires authorization. Run `python backend/scripts/telegram_login.py` "
                        "or set TELEGRAM_BOT_TOKEN in backend/.env."
                    )
                }
            else:
                return {
                    "success": False,
                    "status": "DISCONNECTED",
                    "connected_to_dc": False,
                    "user_authorized": False,
                    "channels_count": len(channels),
                    "channels": channels,
                    "message": "Unable to establish MTProto connection with Telegram Data Center."
                }
        except FloodWaitError as e:
            return {
                "success": False,
                "status": "RATE_LIMITED",
                "connected_to_dc": True,
                "user_authorized": False,
                "channels_count": len(channels),
                "channels": channels,
                "message": f"Telegram rate limit: FloodWait required for {e.seconds} seconds."
            }
        except Exception as e:
            err_name = type(e).__name__
            return {
                "success": False,
                "status": "ERROR",
                "connected_to_dc": False,
                "user_authorized": False,
                "channels_count": len(channels),
                "channels": channels,
                "message": f"Connection check failed ({err_name}): {str(e)}"
            }

    async def poll_channel_messages_async(
        self,
        channels: Optional[List[str]] = None,
        limit_per_channel: int = 15
    ) -> List[IngestedPost]:
        """
        Asynchronously fetches recent messages from configured public channels.
        Handles missing channels, rate limits, and access restrictions gracefully.
        """
        if not self.is_configured:
            raise SourceNotConfiguredException(self._status_message or "Telegram credentials missing.")

        connected = await self.connect_client_async()
        if not connected or not self._client:
            raise SourceNotConfiguredException(self._status_message or "Could not connect to Telegram.")

        target_channels = channels or self.get_configured_channels()
        if not target_channels:
            return []

        ingested_posts: List[IngestedPost] = []
        now = datetime.now(timezone.utc)

        for channel_name in target_channels:
            try:
                # Resolve channel entity safely
                entity = await self._client.get_entity(channel_name)
                channel_title = getattr(entity, 'title', None) or getattr(entity, 'username', None) or channel_name
                channel_username = getattr(entity, 'username', None) or channel_name
                channel_id = getattr(entity, 'id', 'unknown')

                logger.info(f"Polling Telegram channel '{channel_title}' (@{channel_username})...")

                async for message in self._client.iter_messages(entity, limit=limit_per_channel):
                    text_content = message.message or message.text or ""
                    # If empty or whitespace, ignore (unless there is a caption)
                    if not text_content.strip():
                        continue

                    msg_id = str(message.id)
                    external_id = f"TG-{channel_id}-{msg_id}"
                    msg_date = message.date.replace(tzinfo=timezone.utc) if message.date else now
                    post_url = f"https://t.me/{channel_username}/{msg_id}" if channel_username else f"https://t.me/c/{channel_id}/{msg_id}"

                    post = IngestedPost(
                        content=text_content.strip(),
                        platform="Telegram",
                        advertiser_name=channel_username or channel_title,
                        external_id=external_id,
                        submitted_url=post_url,
                        source_type="api_feed",
                        data_source="REAL_API",
                        is_demo=False,
                        created_at=msg_date,
                        raw_metadata={
                            "channel_id": channel_id,
                            "channel_title": channel_title,
                            "channel_username": channel_username,
                            "message_id": msg_id,
                            "views": getattr(message, 'views', None),
                            "forwards": getattr(message, 'forwards', None),
                        }
                    )
                    ingested_posts.append(post)

            except FloodWaitError as e:
                self._flood_wait_until = datetime.now(timezone.utc).timestamp() + e.seconds
                self._status = "RATE_LIMITED"
                self._status_message = f"Telegram rate limit: back off for {e.seconds}s."
                logger.warning(f"Telegram FloodWaitError on {channel_name}: {e.seconds}s")
                break
            except (ChannelPrivateError, ChannelInvalidError, UsernameNotOccupiedError, UsernameInvalidError) as e:
                logger.warning(f"Skipping inaccessible channel '{channel_name}': {e}")
                continue
            except Exception as e:
                logger.warning(f"Error fetching from channel '{channel_name}': {e}")
                continue

        self._last_sync_at = now
        if ingested_posts:
            self._last_message_at = max(
                (p.created_at for p in ingested_posts if p.created_at),
                default=now
            )
            self._messages_ingested_count += len(ingested_posts)

        return ingested_posts

    def fetch_posts(self, query: Optional[str] = None, limit: int = 20) -> List[IngestedPost]:
        """
        Synchronous interface for BaseSourceAdapter.
        Executes async channel polling within the current or a new event loop.
        """
        if not self.is_configured:
            raise SourceNotConfiguredException(self._status_message or "Telegram credentials not configured.")

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If running inside active async loop (e.g. FastAPI route), run via thread or task
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    return pool.submit(
                        lambda: asyncio.run(self.poll_channel_messages_async(limit_per_channel=limit))
                    ).result(timeout=25)
            else:
                return loop.run_until_complete(self.poll_channel_messages_async(limit_per_channel=limit))
        except Exception as e:
            if isinstance(e, SourceNotConfiguredException):
                raise
            logger.error(f"Failed to fetch Telegram posts: {e}")
            raise SourceNotConfiguredException(f"Failed to fetch Telegram channel posts: {str(e)}")

    async def start_realtime_listener_async(
        self,
        on_message_callback: Callable[[IngestedPost], Any]
    ):
        """
        Attaches real-time event listener to configured public Telegram channels.
        Invokes on_message_callback for each newly incoming message.
        """
        if not self.is_configured or not TELETHON_AVAILABLE:
            return

        connected = await self.connect_client_async()
        if not connected or not self._client:
            return

        channels = self.get_configured_channels()
        if not channels:
            return

        resolved_entities = []
        for ch in channels:
            try:
                ent = await self._client.get_entity(ch)
                resolved_entities.append(ent)
            except Exception as e:
                logger.warning(f"Could not resolve channel {ch} for live listener: {e}")

        if not resolved_entities:
            return

        @self._client.on(events.NewMessage(chats=resolved_entities))
        async def handle_new_message(event):
            try:
                msg = event.message
                text = msg.message or msg.text or ""
                if not text.strip():
                    return

                chat = await event.get_chat()
                channel_title = getattr(chat, 'title', None) or getattr(chat, 'username', 'Telegram Channel')
                channel_username = getattr(chat, 'username', None)
                channel_id = getattr(chat, 'id', 'unknown')
                msg_id = str(msg.id)

                post = IngestedPost(
                    content=text.strip(),
                    platform="Telegram",
                    advertiser_name=channel_username or channel_title,
                    external_id=f"TG-{channel_id}-{msg_id}",
                    submitted_url=f"https://t.me/{channel_username}/{msg_id}" if channel_username else None,
                    source_type="api_feed",
                    data_source="REAL_API",
                    is_demo=False,
                    created_at=msg.date.replace(tzinfo=timezone.utc) if msg.date else datetime.now(timezone.utc),
                    raw_metadata={"channel_id": channel_id, "channel_title": channel_title, "msg_id": msg_id}
                )

                self._last_message_at = post.created_at
                self._messages_ingested_count += 1
                await on_message_callback(post)

            except Exception as e:
                logger.error(f"Error processing real-time Telegram message event: {e}")

        self._is_running = True
        self._status = "MONITORING_LIVE"
        self._status_message = f"Real-time listener attached to {len(resolved_entities)} channel(s)."
        logger.info(self._status_message)

        try:
            await self._client.run_until_disconnected()
        except Exception as e:
            logger.warning(f"Telegram real-time listener disconnected: {e}")
        finally:
            self._is_running = False
            self._status = "DISCONNECTED"

    def stop_monitoring(self):
        """Stops live listener and disconnects client."""
        self._is_running = False
        if self._client and self._client.is_connected():
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(self._client.disconnect())
                else:
                    loop.run_until_complete(self._client.disconnect())
            except Exception as e:
                logger.debug(f"Error disconnecting client: {e}")
        self._status = "STOPPED"
