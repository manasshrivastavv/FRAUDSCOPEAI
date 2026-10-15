"""
FRAUDSCOPE AI — Dataset Import Service
======================================
Robust, idempotent importer for forensic JSON (arrays/JSONL) and CSV datasets.
Preserves original message text, metadata, identifiers, timestamps, and ground-truth
annotations separately from ML model predictions without modifying source files.
"""

import os
import csv
import json
import logging
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.models import Advertisement
from app.services.text_preprocessing import normalize_text, calculate_content_hash
from app.services.ingestion.base import IngestedPost
from app.services.ingestion.ingestion_service import ingestion_service

logger = logging.getLogger("fraudscope.dataset_import")

# Default search locations for the datasets
DEFAULT_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data"))
DOWNLOADS_DIR = os.path.expanduser(r"~\Downloads")

DEFAULT_JSONL_PATHS = [
    os.path.join(DEFAULT_DATA_DIR, "finguard_live_feed.jsonl"),
    os.path.join(DOWNLOADS_DIR, "finguard_live_feed.jsonl"),
    os.path.join(DOWNLOADS_DIR, "finguard_live_feed (1).jsonl"),
]

DEFAULT_CSV_PATHS = [
    os.path.join(DEFAULT_DATA_DIR, "finguard_live_feed.csv"),
    os.path.join(DOWNLOADS_DIR, "finguard_live_feed.csv"),
]

def resolve_existing_path(paths: List[str]) -> Optional[str]:
    for p in paths:
        if os.path.exists(p) and os.path.isfile(p):
            return os.path.abspath(p)
    return None

class DatasetImportService:
    """
    Reusable parsing, normalization, validation, and idempotent import service
    for JSON and CSV intelligence datasets.
    """

    @staticmethod
    def locate_datasets() -> Dict[str, Optional[str]]:
        """
        Locates the original JSON/JSONL and CSV dataset files in the project or system.
        """
        jsonl_path = resolve_existing_path(DEFAULT_JSONL_PATHS)
        csv_path = resolve_existing_path(DEFAULT_CSV_PATHS)
        return {
            "jsonl_path": jsonl_path,
            "csv_path": csv_path,
        }

    @staticmethod
    def map_record_fields(raw: Dict[str, Any], file_source: str) -> Optional[Dict[str, Any]]:
        """
        Safe field-mapping layer for raw dictionary records.
        Handles variations in column names and strips BOM if present.
        """
        # Clean BOM from keys
        clean_raw = {}
        for k, v in raw.items():
            clean_key = k.lstrip("\ufeff").strip() if isinstance(k, str) else str(k)
            clean_raw[clean_key] = v

        # Text resolution (mandatory)
        text = clean_raw.get("text") or clean_raw.get("content") or clean_raw.get("message") or clean_raw.get("body")
        if not text or not str(text).strip():
            return None
        text = str(text).strip()

        # Identifier resolution
        event_id = clean_raw.get("event_id") or clean_raw.get("id") or clean_raw.get("external_id")
        if not event_id:
            seq = clean_raw.get("seq")
            event_id = f"EV-SEQ-{seq}" if seq else f"EV-HASH-{calculate_content_hash(normalize_text(text))[:8]}"
        event_id = str(event_id).strip()

        # Platform resolution
        platform = clean_raw.get("platform") or clean_raw.get("source") or "Unknown"
        platform = str(platform).strip()

        # Channel & Username resolution
        username = clean_raw.get("username") or clean_raw.get("channel") or clean_raw.get("author") or ""
        username = str(username).strip()

        # URL resolution
        url = clean_raw.get("url") or clean_raw.get("link") or ""
        url = str(url).strip() or None

        # Phone & UPI handles
        phone = clean_raw.get("phone") or ""
        phone = str(phone).strip() or None
        upi_id = clean_raw.get("upi_id") or clean_raw.get("upi") or ""
        upi_id = str(upi_id).strip() or None

        # Timestamp parsing
        created_at = None
        time_str = clean_raw.get("event_time") or clean_raw.get("timestamp") or clean_raw.get("created_at")
        if time_str:
            try:
                # ISO-8601 with offset e.g. 2026-10-10T08:32:40+05:30
                created_at = datetime.fromisoformat(str(time_str))
            except Exception:
                try:
                    created_at = datetime.strptime(str(time_str), "%Y-%m-%d %H:%M:%S")
                except Exception:
                    created_at = datetime.now(timezone.utc)
        else:
            created_at = datetime.now(timezone.utc)

        # Ground truth labels & evaluation metadata (kept strictly separate from ML features)
        ground_truth = {
            "label": clean_raw.get("label", "unknown"),
            "risk_level": clean_raw.get("risk_level", "low"),
            "category": clean_raw.get("category", "none"),
            "cluster_id": clean_raw.get("cluster_id", ""),
            "is_bridge": clean_raw.get("is_bridge", "no"),
            "is_hard_negative": clean_raw.get("is_hard_negative", "no"),
            "new_slang_term": clean_raw.get("new_slang_term", ""),
            "wording_set": clean_raw.get("wording_set", "template"),
            "eval_only": clean_raw.get("eval_only", "no"),
            "demo_highlight": clean_raw.get("demo_highlight", "no"),
            "highlight_note": clean_raw.get("highlight_note", ""),
            "replay_delay_ms": clean_raw.get("replay_delay_ms", 6000),
            "file_source": os.path.basename(file_source),
            "original_seq": clean_raw.get("seq", None),
        }

        norm_text = normalize_text(text)
        content_hash = calculate_content_hash(norm_text)

        return {
            "event_id": event_id,
            "text": text,
            "normalized_text": norm_text,
            "content_hash": content_hash,
            "platform": platform,
            "username": username,
            "url": url,
            "phone": phone,
            "upi_id": upi_id,
            "created_at": created_at,
            "ground_truth": ground_truth,
            "file_source": file_source,
        }

    @classmethod
    def parse_json(cls, file_path: str) -> List[Dict[str, Any]]:
        """
        Parses a JSON file supporting both JSON arrays `[...]` and JSON Lines (JSONL).
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"JSON dataset not found: {file_path}")

        records: List[Dict[str, Any]] = []
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read().strip()
            if not content:
                return []

            # Check if it is a JSON array
            if content.startswith("[") and content.endswith("]"):
                try:
                    data = json.loads(content)
                    for item in data:
                        if isinstance(item, dict):
                            mapped = cls.map_record_fields(item, file_path)
                            if mapped:
                                records.append(mapped)
                    return records
                except json.JSONDecodeError:
                    pass

            # Fall back to JSON Lines
            for line in content.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                    if isinstance(item, dict):
                        mapped = cls.map_record_fields(item, file_path)
                        if mapped:
                            records.append(mapped)
                except Exception as e:
                    logger.warning(f"Skipping malformed JSON line in {file_path}: {e}")

        return records

    @classmethod
    def parse_csv(cls, file_path: str) -> List[Dict[str, Any]]:
        """
        Parses a standard CSV file with safe dialect detection and BOM stripping.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"CSV dataset not found: {file_path}")

        records: List[Dict[str, Any]] = []
        with open(file_path, "r", encoding="utf-8-sig", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                mapped = cls.map_record_fields(row, file_path)
                if mapped:
                    records.append(mapped)

        return records

    @classmethod
    def load_dataset(cls, source_type: str = "both") -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Loads records from 'json', 'csv', or 'both'.
        Detects duplicates across files using a combination of content_hash and event_id.
        Tracks file origin for each record.
        """
        paths = cls.locate_datasets()
        jsonl_path = paths["jsonl_path"]
        csv_path = paths["csv_path"]

        all_records: List[Dict[str, Any]] = []
        stats = {
            "json_file": jsonl_path,
            "csv_file": csv_path,
            "json_count": 0,
            "csv_count": 0,
            "total_raw": 0,
            "unique_records": 0,
            "cross_file_duplicates": 0,
        }

        json_records = []
        if source_type in ("json", "both") and jsonl_path:
            json_records = cls.parse_json(jsonl_path)
            stats["json_count"] = len(json_records)

        csv_records = []
        if source_type in ("csv", "both") and csv_path:
            csv_records = cls.parse_csv(csv_path)
            stats["csv_count"] = len(csv_records)

        stats["total_raw"] = len(json_records) + len(csv_records)

        # Merge and detect duplicates across files by event_id
        seen_event_ids = set()
        merged: List[Dict[str, Any]] = []

        # Process in deterministic order
        sources = []
        if source_type == "json":
            sources = [json_records]
        elif source_type == "csv":
            sources = [csv_records]
        else:
            sources = [json_records, csv_records]

        for record_list in sources:
            for rec in record_list:
                eid = rec["event_id"]
                if eid in seen_event_ids:
                    stats["cross_file_duplicates"] += 1
                    continue
                seen_event_ids.add(eid)
                merged.append(rec)

        stats["unique_records"] = len(merged)
        return merged, stats

    @classmethod
    def import_records_to_db(
        cls,
        db: Session,
        records: List[Dict[str, Any]],
        actor: str = "DatasetImporter"
    ) -> Dict[str, int]:
        """
        Idempotently persists records into SQLite using ingestion_service.
        Returns detailed summary counts: imported, skipped, duplicates, invalid.
        """
        summary = {
            "total": len(records),
            "imported": 0,
            "duplicates": 0,
            "skipped": 0,
            "invalid": 0,
        }

        for rec in records:
            try:
                # Validation
                if not rec.get("text"):
                    summary["invalid"] += 1
                    continue

                event_id = rec.get("event_id")
                content_hash = rec.get("content_hash")

                # Check existing DB record
                existing = None
                if event_id:
                    existing = db.query(Advertisement).filter(Advertisement.external_id == event_id).first()
                if not existing and content_hash:
                    existing = db.query(Advertisement).filter(Advertisement.content_hash == content_hash).first()

                if existing:
                    summary["duplicates"] += 1
                    summary["skipped"] += 1
                    continue

                # Prepare IngestedPost
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
                    created_at=rec.get("created_at") or datetime.now(timezone.utc)
                )

                # Ingest through the existing production pipeline (rules + ML + composite risk + persistence)
                ingestion_service.ingest_post(db=db, post=post, actor=actor)
                summary["imported"] += 1

            except Exception as e:
                logger.error(f"Error importing record {rec.get('event_id')}: {e}")
                summary["invalid"] += 1

        return summary

dataset_import_service = DatasetImportService()
