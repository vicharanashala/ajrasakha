from datetime import datetime, timezone
import pytest
from mongomock_motor import AsyncMongoMockClient
from gdb_gap_detector.core import settings
from gdb_gap_detector.models import (
    CoverageCell,
    OutreachRecommendation,
    ScoredCluster,
    TrendDelta,
)
from gdb_gap_detector.pipeline.reporter import (
    assemble_gap_report,
    generate_markdown_report,
    save_gap_report_to_db,
)


def test_assemble_gap_report_and_markdown_generator():
    """Test GapReport assembly and natural language Markdown formatting."""
    now = datetime.now(timezone.utc)
    cluster = ScoredCluster(
        cluster_id="c1",
        cluster_name="Mustard Aphids Control",
        size=15,
        keywords=["mustard", "aphid"],
        sample_queries=["How to control aphids in mustard?"],
        domains=["Pest Control"],
        states=["Punjab"],
        languages=["English"],
        first_seen=now,
        last_seen=now,
        farmer_demand=15,
        priority_score=30.0,
        priority_level="CRITICAL",
        triage_status="near_miss",
        recommended_action="Create GDB entry",
        trend_status="NEW",
    )

    heatmap_cell = CoverageCell(
        crop="Mustard",
        state="Punjab",
        domain="Pest Control",
        gdb_count=0,
        disclaimer_count=5,
        coverage_score=0.0,
        status="gap",
    )

    outreach_rec = OutreachRecommendation(
        target_state="Punjab",
        focus_domain="Pest Control",
        gap_questions=5,
        recommendation="Deploy local extension workers for mustard pest control.",
        priority="HIGH",
    )

    report = assemble_gap_report(
        period_days=30,
        total_disclaimers=20,
        unique_queries=10,
        scored_clusters=[cluster],
        heatmap_cells=[heatmap_cell],
        recommendations=[outreach_rec],
        overlap_counts={"real_gap": 5, "near_miss": 10, "almost_covered": 5},
        trend_delta=TrendDelta(new_clusters=["Mustard Aphids Control"]),
    )

    assert report.total_disclaimers == 20
    assert report.clusters_found == 1
    assert report.domains_with_gaps == ["Pest Control"]
    assert report.states_with_gaps == ["Punjab"]

    markdown_text = generate_markdown_report(report)
    assert "# 🌾 Weekly GDB Coverage Gap Report" in markdown_text
    assert "Mustard Aphids Control" in markdown_text
    assert "`near_miss`" in markdown_text
    assert "Deploy local extension workers" in markdown_text


@pytest.mark.asyncio
async def test_save_gap_report_to_db():
    """Test idempotent saving of GapReport to MongoDB gap_reports collection."""
    client = AsyncMongoMockClient()
    db = client[settings.feedback_db_name]

    now = datetime.now(timezone.utc)
    report = assemble_gap_report(
        period_days=30,
        total_disclaimers=10,
        unique_queries=5,
        scored_clusters=[],
        heatmap_cells=[],
        recommendations=[],
        overlap_counts={},
        start_date=now,
        end_date=now,
    )

    upsert_id = await save_gap_report_to_db(db, report)
    assert upsert_id is not None

    # Verify query in collection
    collection = db[settings.gap_reports_collection]
    doc = await collection.find_one({"report_type": "weekly_gap_report"})
    assert doc is not None
    assert doc["total_disclaimers"] == 10


def test_generate_markdown_report_empty_recommendations():
    """Test markdown generation when outreach recommendations are empty."""
    now = datetime.now(timezone.utc)
    report = assemble_gap_report(
        period_days=30,
        total_disclaimers=0,
        unique_queries=0,
        scored_clusters=[],
        heatmap_cells=[],
        recommendations=[],
        overlap_counts={},
        start_date=now,
        end_date=now,
    )
    markdown_text = generate_markdown_report(report)
    assert "No critical regional coverage gaps identified." in markdown_text
