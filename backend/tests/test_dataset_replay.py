"""
Unit and Integration Tests for Forensic Dataset Import & Live Feed Replay
"""

import os
import tempfile
import json
import csv
import pytest
import asyncio
from sqlalchemy.orm import Session

from app.models.models import Advertisement, AnalysisResult, Evidence
from app.services.dataset_import_service import dataset_import_service, DatasetImportService
from app.services.dataset_replay_service import dataset_replay_service
from app.services.model_service import predict_risk
from app.services.broadcaster import broadcaster

@pytest.fixture
def temp_dataset_files():
    """Creates temporary valid, invalid, and empty JSON and CSV files for testing."""
    # 1. Valid JSONL
    t_jsonl = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False, encoding="utf-8")
    sample_records = [
        {
            "seq": 1,
            "event_id": "TEST-EV-001",
            "event_time": "2026-10-10T08:32:40+05:30",
            "platform": "Telegram",
            "username": "@seller_test",
            "text": "Offer today: savings account bechno hai, jaldi sampark karo 📲",
            "phone": "+91 9200000001",
            "upi_id": "test1@fakeupi",
            "url": "t.me/test_seller",
            "label": "suspicious",
            "risk_level": "high",
            "category": "account_sale",
            "cluster_id": "C01"
        },
        {
            "seq": 2,
            "event_id": "TEST-EV-002",
            "event_time": "2026-10-10T09:00:00+05:30",
            "platform": "Instagram",
            "username": "@user_test",
            "text": "Fixed deposit vs mutual fund, beginners ke liye kaunsa behtar?",
            "phone": "",
            "upi_id": "",
            "url": "",
            "label": "safe",
            "risk_level": "low",
            "category": "none",
            "cluster_id": ""
        }
    ]
    for r in sample_records:
        t_jsonl.write(json.dumps(r) + "\n")
    t_jsonl.close()

    # 2. Valid CSV
    t_csv = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8-sig")
    writer = csv.DictWriter(t_csv, fieldnames=[
        "seq", "event_id", "event_time", "platform", "username", "text",
        "phone", "upi_id", "url", "label", "risk_level", "category", "cluster_id"
    ])
    writer.writeheader()
    # Row 1 is same as sample_records[0] (cross-file duplicate)
    writer.writerow(sample_records[0])
    # Row 3 is unique
    writer.writerow({
        "seq": 3,
        "event_id": "TEST-EV-003",
        "event_time": "2026-10-10T10:00:00+05:30",
        "platform": "Facebook",
        "username": "@facebook_job",
        "text": "ATM card kiraye pe dena hai, rozana earning 💳",
        "phone": "+91 9200000003",
        "upi_id": "seller3@fakeupi",
        "url": "",
        "label": "suspicious",
        "risk_level": "high",
        "category": "atm_card_sale",
        "cluster_id": "C01"
    })
    t_csv.close()

    # 3. Empty File
    t_empty = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8")
    t_empty.close()

    # 4. Invalid/Malformed JSON
    t_malformed = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False, encoding="utf-8")
    t_malformed.write("{not valid json\n")
    t_malformed.write('{"text": "Valid row after malformed"}\n')
    t_malformed.close()

    yield {
        "jsonl": t_jsonl.name,
        "csv": t_csv.name,
        "empty": t_empty.name,
        "malformed": t_malformed.name
    }

    # Cleanup
    for p in [t_jsonl.name, t_csv.name, t_empty.name, t_malformed.name]:
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass


def test_json_and_csv_parsing(temp_dataset_files):
    """Verifies parsing of JSONL and CSV datasets with schema normalization."""
    jsonl_records = DatasetImportService.parse_json(temp_dataset_files["jsonl"])
    assert len(jsonl_records) == 2
    assert jsonl_records[0]["event_id"] == "TEST-EV-001"
    assert jsonl_records[0]["platform"] == "Telegram"
    assert jsonl_records[0]["phone"] == "+91 9200000001"
    assert jsonl_records[0]["ground_truth"]["label"] == "suspicious"

    csv_records = DatasetImportService.parse_csv(temp_dataset_files["csv"])
    assert len(csv_records) == 2
    assert csv_records[0]["event_id"] == "TEST-EV-001"
    assert csv_records[1]["event_id"] == "TEST-EV-003"


def test_empty_and_malformed_files(temp_dataset_files):
    """Verifies that empty and malformed files are handled gracefully without crashing."""
    empty_records = DatasetImportService.parse_csv(temp_dataset_files["empty"])
    assert empty_records == []

    malformed_records = DatasetImportService.parse_json(temp_dataset_files["malformed"])
    assert len(malformed_records) == 1
    assert malformed_records[0]["text"] == "Valid row after malformed"


def test_cross_file_duplicate_detection(temp_dataset_files):
    """Verifies that duplicate records present in both JSON and CSV files are detected."""
    jsonl_records = DatasetImportService.parse_json(temp_dataset_files["jsonl"])
    csv_records = DatasetImportService.parse_csv(temp_dataset_files["csv"])

    seen_ids = set()
    unique = []
    dup_count = 0

    for r in jsonl_records + csv_records:
        if r["event_id"] in seen_ids:
            dup_count += 1
        else:
            seen_ids.add(r["event_id"])
            unique.append(r)

    assert dup_count == 1  # TEST-EV-001 appears in both
    assert len(unique) == 3


def test_actual_repository_datasets_exist():
    """Verifies that the user's actual JSON and CSV dataset files are located in data/ and valid."""
    paths = dataset_import_service.locate_datasets()
    assert paths["jsonl_path"] is not None, "JSONL dataset not found"
    assert paths["csv_path"] is not None, "CSV dataset not found"

    records, stats = dataset_import_service.load_dataset(source_type="both")
    assert len(records) == 628, f"Expected 628 records, found {len(records)}"
    assert stats["json_count"] == 628
    assert stats["csv_count"] == 628
    assert stats["cross_file_duplicates"] == 628


def test_model_inference_on_dataset_records():
    """Verifies that the production ML model executes inference safely on dataset text."""
    records, _ = dataset_import_service.load_dataset(source_type="both")
    assert len(records) > 0

    # Test first 10 records
    for rec in records[:10]:
        model_avail, prob, pred_class, version, tokens = predict_risk(rec["normalized_text"])
        assert model_avail is True
        assert prob is not None and 0.0 <= prob <= 1.0
        assert pred_class in ("safe", "needs_review", "suspicious")
        assert isinstance(tokens, list)


def test_idempotent_import_to_database():
    """Verifies that running the importer multiple times does not produce duplicate records."""
    from app.database.session import SessionLocal
    db = SessionLocal()
    try:
        records, _ = dataset_import_service.load_dataset(source_type="both")
        sample = records[:5]

        # First import
        res1 = dataset_import_service.import_records_to_db(db=db, records=sample, actor="TestImport1")
        assert res1["imported"] + res1["duplicates"] == 5

        # Second import (same records)
        res2 = dataset_import_service.import_records_to_db(db=db, records=sample, actor="TestImport2")
        assert res2["imported"] == 0, "Second import should not import any new records"
        assert res2["duplicates"] == 5, "All records in second import should be identified as duplicates"
    finally:
        db.close()


def test_replay_state_machine_and_sse():
    """Verifies start, pause, resume, stop, and restart controls of the dataset replay service."""
    async def _async_test():
        # Ensure starting in a clean state
        await dataset_replay_service.stop()

        # Subscribe to SSE broadcaster
        q = broadcaster.subscribe()
        try:
            # 1. Start Replay
            status1 = await dataset_replay_service.start(source="both", interval_seconds=1.0)
            assert status1["status"] == "RUNNING"
            assert status1["total_records"] == 628

            # 2. Receive at least 1 SSE event
            event = await asyncio.wait_for(q.get(), timeout=5.0)
            assert event["event"] == "NEW_FEED_RECORD"
            assert event["data"]["data_source"] == "DATASET_REPLAY"
            assert event["data"]["is_demo"] is True

            # 3. Pause
            status2 = await dataset_replay_service.pause()
            assert status2["status"] == "PAUSED"

            # 4. Resume
            status3 = await dataset_replay_service.resume()
            assert status3["status"] == "RUNNING"

            # 5. Stop
            status4 = await dataset_replay_service.stop()
            assert status4["status"] == "STOPPED"

            # 6. Restart
            status5 = await dataset_replay_service.restart(source="both", interval_seconds=1.0)
            assert status5["status"] == "RUNNING"
            assert status5["current_index"] <= 1

            # Cleanup: stop service
            await dataset_replay_service.stop()

        finally:
            broadcaster.unsubscribe(q)

    asyncio.run(_async_test())
