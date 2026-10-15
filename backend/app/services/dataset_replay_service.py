"""
FRAUDSCOPE AI — Dataset Replay Service
======================================
Asynchronous, thread-safe replay orchestrator that continuously streams records
from the JSON/CSV datasets into the live intelligence pipeline and broadcasts
NEW_FEED_RECORD events across active Server-Sent Events (SSE) connections.
"""

import os
import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from app.database.session import SessionLocal
from app.models.models import Advertisement
from app.services.broadcaster import broadcaster
from app.services.ingestion.base import IngestedPost
from app.services.ingestion.ingestion_service import ingestion_service
from app.services.dataset_import_service import dataset_import_service

logger = logging.getLogger("fraudscope.dataset_replay")

class DatasetReplayService:
    """
    Manages continuous live-feed playback of forensic datasets with
    full state machine control (Start, Pause, Resume, Stop, Restart).
    """

    def __init__(self):
        self._lock = asyncio.Lock()
        self._worker_task: Optional[asyncio.Task] = None
        self._status: str = "IDLE"  # IDLE, RUNNING, PAUSED, STOPPED, COMPLETED
        self._source: str = "both"  # both, json, csv
        self._interval_seconds: float = 3.0
        self._loop: bool = False

        self._records: List[Dict[str, Any]] = []
        self._current_index: int = 0
        self._published_count: int = 0
        self._last_event_time: Optional[str] = None
        self._last_published_id: Optional[str] = None
        self._errors: List[str] = []

    def get_status(self) -> Dict[str, Any]:
        """Returns the current telemetry and operational state of the replay engine."""
        total = len(self._records)
        remaining = max(0, total - self._current_index)
        return {
            "status": self._status,
            "source": self._source,
            "interval_seconds": self._interval_seconds,
            "total_records": total,
            "published_count": self._published_count,
            "remaining_count": remaining,
            "current_index": self._current_index,
            "loop": self._loop,
            "last_event_time": self._last_event_time,
            "last_published_id": self._last_published_id,
            "errors": self._errors[-10:],
        }

    async def start(
        self,
        source: str = "both",
        interval_seconds: float = 3.0,
        loop: bool = False
    ) -> Dict[str, Any]:
        """
        Initializes and starts the dataset replay worker.
        """
        async with self._lock:
            # If paused and same source, resume
            if self._status == "PAUSED":
                self._status = "RUNNING"
                self._interval_seconds = max(0.5, float(interval_seconds))
                self._loop = loop
                logger.info(f"[ReplayService] Resumed playback at index {self._current_index}.")
                return self.get_status()

            # If already running, update parameters and return
            if self._status == "RUNNING" and self._worker_task and not self._worker_task.done():
                self._interval_seconds = max(0.5, float(interval_seconds))
                self._loop = loop
                return self.get_status()

            # Load dataset records if new source or not loaded
            valid_source = source if source in ("json", "csv", "both") else "both"
            records, stats = dataset_import_service.load_dataset(source_type=valid_source)
            if not records:
                msg = f"Cannot start replay: No records loaded from source '{valid_source}'."
                self._errors.append(msg)
                logger.error(msg)
                raise ValueError(msg)

            self._records = records
            self._source = valid_source
            self._interval_seconds = max(0.5, float(interval_seconds))
            self._loop = loop
            self._status = "RUNNING"

            # Cancel existing task if any
            if self._worker_task and not self._worker_task.done():
                self._worker_task.cancel()
                try:
                    await self._worker_task
                except asyncio.CancelledError:
                    pass

            # Launch background worker task
            self._worker_task = asyncio.create_task(self._replay_loop())
            logger.info(
                f"[ReplayService] Started replay loop: {len(self._records)} records loaded "
                f"from '{valid_source}' at {self._interval_seconds}s interval."
            )
            return self.get_status()

    async def pause(self) -> Dict[str, Any]:
        """Pauses the replay loop at the current record index."""
        async with self._lock:
            if self._status == "RUNNING":
                self._status = "PAUSED"
                logger.info(f"[ReplayService] Replay paused at index {self._current_index}.")
            return self.get_status()

    async def resume(self) -> Dict[str, Any]:
        """Resumes a paused replay loop."""
        async with self._lock:
            if self._status == "PAUSED":
                self._status = "RUNNING"
                logger.info(f"[ReplayService] Replay resumed from index {self._current_index}.")
            return self.get_status()

    async def stop(self) -> Dict[str, Any]:
        """Stops the replay loop and resets workers."""
        async with self._lock:
            self._status = "STOPPED"
            if self._worker_task and not self._worker_task.done():
                self._worker_task.cancel()
                try:
                    await self._worker_task
                except asyncio.CancelledError:
                    pass
            self._worker_task = None
            logger.info("[ReplayService] Replay stopped by user.")
            return self.get_status()

    async def restart(
        self,
        source: Optional[str] = None,
        interval_seconds: Optional[float] = None
    ) -> Dict[str, Any]:
        """Restarts replay from record index 0 without duplicating database items."""
        await self.stop()
        async with self._lock:
            self._current_index = 0
            self._published_count = 0
            if source:
                self._source = source
            if interval_seconds:
                self._interval_seconds = max(0.5, float(interval_seconds))

        return await self.start(
            source=self._source,
            interval_seconds=self._interval_seconds,
            loop=self._loop
        )

    async def _replay_loop(self):
        """
        Continuous background worker that fetches the next record,
        runs analysis and persistence, and emits an SSE live update.
        """
        logger.info("[ReplayService] Background replay loop initialized.")
        try:
            while self._status in ("RUNNING", "PAUSED"):
                if self._status == "PAUSED":
                    await asyncio.sleep(0.5)
                    continue

                if self._current_index >= len(self._records):
                    if self._loop and len(self._records) > 0:
                        logger.info("[ReplayService] Loop mode enabled: cycling back to index 0.")
                        self._current_index = 0
                    else:
                        self._status = "COMPLETED"
                        logger.info(
                            f"[ReplayService] Replay reached end of dataset. "
                            f"Total published in session: {self._published_count} records."
                        )
                        break

                # Get next record
                record = self._records[self._current_index]

                # Process and publish record in DB & SSE
                success = await self._process_single_record(record)
                if success:
                    self._published_count += 1
                    self._current_index += 1
                else:
                    # Skip problematic record and advance
                    self._current_index += 1

                # Wait specified interval
                await asyncio.sleep(self._interval_seconds)

        except asyncio.CancelledError:
            logger.info("[ReplayService] Replay task cancelled.")
        except Exception as e:
            logger.error(f"[ReplayService] Fatal error in replay loop: {e}", exc_info=True)
            self._errors.append(f"Worker loop error: {str(e)}")
            self._status = "STOPPED"

    async def _process_single_record(self, rec: Dict[str, Any]) -> bool:
        """
        Analyzes and persists a single record via ingestion_service,
        and broadcasts a NEW_FEED_RECORD SSE payload to all subscribers.
        """
        db = SessionLocal()
        try:
            event_id = rec.get("event_id")
            now = datetime.now(timezone.utc)

            post = IngestedPost(
                content=rec["text"],
                platform=rec.get("platform") or "Unknown",
                advertiser_name=rec.get("username") or None,
                external_id=event_id,
                submitted_url=rec.get("url") or None,
                source_type="dataset_replay",
                data_source="DATASET_REPLAY",
                is_demo=True,
                raw_metadata=rec.get("ground_truth", {}),
                created_at=now
            )

            # Ingest through the unified production pipeline
            ad = ingestion_service.ingest_post(db=db, post=post, actor="DatasetReplayService")

            # Update telemetry
            iso_now = now.isoformat()
            self._last_event_time = iso_now
            self._last_published_id = ad.custom_id or f"AD-{ad.id}"

            # Prepare broadcast payload
            analysis = ad.analysis
            top_ents = [
                {"entity_type": e.entity_type, "entity_value": e.entity_value}
                for e in ad.entities[:3]
            ]

            payload = {
                "id": ad.id,
                "custom_id": ad.custom_id,
                "original_text": ad.original_text,
                "platform": ad.platform or "Unknown",
                "advertiser_name": ad.advertiser_name,
                "external_id": ad.external_id,
                "submitted_url": ad.submitted_url,
                "risk_score": analysis.risk_score if analysis else None,
                "risk_level": analysis.risk_level if analysis else "LOW",
                "review_status": ad.review_status,
                "data_source": ad.data_source,
                "is_demo": ad.is_demo,
                "created_at": iso_now,
                "top_entities": top_ents,
                "entities_count": len(ad.entities),
                "cases_count": len(ad.cases) if hasattr(ad, "cases") else 0,
            }

            # Explicitly emit through SSE broadcaster
            await broadcaster.broadcast("NEW_FEED_RECORD", payload)
            logger.info(f"[ReplayService] Published event #{self._current_index + 1}: {ad.custom_id} ({ad.platform})")
            return True

        except Exception as e:
            err_msg = f"Failed to replay record {rec.get('event_id')}: {str(e)}"
            logger.error(err_msg)
            self._errors.append(err_msg)
            return False
        finally:
            db.close()

# Singleton instance
dataset_replay_service = DatasetReplayService()
