import asyncio
import json
import logging
from typing import Set, Dict, Any

logger = logging.getLogger("fraudscope.broadcaster")

class LiveFeedBroadcaster:
    """
    Lightweight Pub/Sub broker for streaming real-time live feed events
    (incoming Telegram messages, live manual scans, risk score updates)
    to connected SSE clients without holding locks or blocking database threads.
    """
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=100)
        self._subscribers.add(q)
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            pass
        logger.debug(f"Client connected to SSE stream. Total active subscribers: {len(self._subscribers)}")
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self._subscribers.discard(q)
        logger.debug(f"Client disconnected from SSE stream. Remaining subscribers: {len(self._subscribers)}")

    def broadcast_sync(self, event_type: str, data: Dict[str, Any]):
        """Safe thread-safe broadcast entry point callable from any async or sync thread."""
        if not self._subscribers:
            return

        target_loop = self._loop
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if current_loop and current_loop.is_running():
            current_loop.create_task(self.broadcast(event_type, data))
        elif target_loop and target_loop.is_running():
            try:
                asyncio.run_coroutine_threadsafe(self.broadcast(event_type, data), target_loop)
            except Exception as e:
                logger.warning(f"Failed to schedule broadcast threadsafe: {e}")
        else:
            logger.debug("No running asyncio event loop found to broadcast event.")

    async def broadcast(self, event_type: str, data: Dict[str, Any]):
        if not self._subscribers:
            return

        payload = {"event": event_type, "data": data}
        dead_queues = []

        for q in list(self._subscribers):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                # Client is backpressured or stalled, discard queue
                dead_queues.append(q)
            except Exception:
                dead_queues.append(q)

        for q in dead_queues:
            self._subscribers.discard(q)

broadcaster = LiveFeedBroadcaster()
