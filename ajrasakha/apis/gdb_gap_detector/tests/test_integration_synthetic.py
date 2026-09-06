"""Integration test: Full pipeline execution against 93 synthetic farmer disclaimers.

Uses mongomock_motor (in-memory mock MongoDB) — never touches production or cloud DB.
Loads test data from tests/fixtures/synthetic_200.json.
"""

from datetime import datetime, timezone
import json
from pathlib import Path

import pytest
from mongomock_motor import AsyncMongoMockClient

from gdb_gap_detector.core import MongoDB, settings
from gdb_gap_detector.pipeline.reporter import generate_markdown_report
from gdb_gap_detector.services import run_full_pipeline

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _load_fixture() -> dict:
    """Load synthetic test data from JSON fixture file."""
    with open(FIXTURES_DIR / "synthetic_200.json", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
async def synthetic_db():
    """Provision a mongomock database seeded with synthetic fixture data."""
    data = _load_fixture()

    # Convert ISO timestamp strings to Python datetime objects for BSON date comparisons
    for doc in data["disclaimer_logs"]:
        if isinstance(doc.get("timestamp"), str):
            doc["timestamp"] = datetime.fromisoformat(
                doc["timestamp"].replace("Z", "+00:00")
            )

    client = AsyncMongoMockClient()
    db = client["test_gdb_gap_detector"]  # Separate test database name

    # Seed disclaimer_logs
    await db[settings.disclaimer_collection].insert_many(data["disclaimer_logs"])

    # Seed gdb_entries
    await db[settings.gdb_entries_collection].insert_many(data["gdb_entries"])

    # Seed empty flagged_entries collection (no flagged entries in synthetic set)
    await db[settings.flagged_entries_collection].insert_many([
        {
            "_id": "flag_test_001",
            "gdb_entry_id": "gdb_001",
            "domain": "Soil & Fertilizer",
            "language": "English",
            "helpfulness_score": 15.0,
            "status": "flagged",
        },
    ])

    # Wire up MongoDB singleton for the test
    MongoDB.client = client
    MongoDB.db = db

    yield db

    MongoDB.disconnect()


@pytest.mark.asyncio
async def test_synthetic_pipeline_produces_clusters(synthetic_db):
    """Verify pipeline finds meaningful clusters from 93 diverse farmer questions."""
    report = await run_full_pipeline(synthetic_db, period_days=60, write_to_db=False)

    assert report.total_disclaimers > 0, "Should extract disclaimers from synthetic data"
    assert report.unique_queries > 5, "Should have multiple unique queries"
    assert report.clusters_found > 0, "HDBSCAN should identify at least 1 cluster"
    assert len(report.top_gaps) > 0, "Should have scored gap clusters"


@pytest.mark.asyncio
async def test_synthetic_pipeline_heatmap_populated(synthetic_db):
    """Verify heatmap cells are generated across domains and states."""
    report = await run_full_pipeline(synthetic_db, period_days=60, write_to_db=False)

    cells = report.heatmap.cells if report.heatmap else []
    assert len(cells) > 0, "Coverage heatmap should have cells from synthetic data"


@pytest.mark.asyncio
async def test_synthetic_pipeline_markdown_report(synthetic_db):
    """Verify markdown report is generated and non-empty."""
    report = await run_full_pipeline(synthetic_db, period_days=60, write_to_db=False)
    markdown = generate_markdown_report(report)

    assert len(markdown) > 100, "Markdown report should be substantive"
    assert "Coverage Gap" in markdown or "Gap" in markdown, "Report should mention gaps"


@pytest.mark.asyncio
async def test_synthetic_pipeline_saves_to_db(synthetic_db):
    """Verify pipeline can persist report to MongoDB test collection."""
    report = await run_full_pipeline(synthetic_db, period_days=60, write_to_db=True)

    # Verify report was saved
    collection = synthetic_db[settings.gap_reports_collection]
    saved = await collection.find_one({"report_type": "weekly_gap_report"})
    assert saved is not None, "Report should be persisted in gap_reports collection"
    assert saved["clusters_found"] == report.clusters_found


@pytest.mark.asyncio
async def test_synthetic_pipeline_overlap_summary(synthetic_db):
    """Verify overlap triage produces real_gap and near_miss counts."""
    report = await run_full_pipeline(synthetic_db, period_days=60, write_to_db=False)

    overlap = report.overlap_summary
    total = overlap.real_gap + overlap.near_miss + overlap.almost_covered
    assert total > 0, "Overlap triage should classify at least some queries"


@pytest.mark.asyncio
async def test_synthetic_fixture_data_integrity():
    """Verify fixture file loads correctly and has expected structure."""
    data = _load_fixture()

    assert "disclaimer_logs" in data, "Fixture must have disclaimer_logs key"
    assert "gdb_entries" in data, "Fixture must have gdb_entries key"
    assert len(data["disclaimer_logs"]) >= 90, "Should have at least 90 synthetic disclaimers"
    assert len(data["gdb_entries"]) >= 5, "Should have at least 5 GDB entries"

    # Verify each disclaimer has required fields
    for doc in data["disclaimer_logs"]:
        assert "query" in doc, f"Missing 'query' in {doc['_id']}"
        assert "query_hash" in doc, f"Missing 'query_hash' in {doc['_id']}"
        assert "timestamp" in doc, f"Missing 'timestamp' in {doc['_id']}"
        assert "status" in doc, f"Missing 'status' in {doc['_id']}"
