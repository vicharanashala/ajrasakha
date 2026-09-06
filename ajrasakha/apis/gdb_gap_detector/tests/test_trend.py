from datetime import datetime, timedelta, timezone
import pytest
from mongomock_motor import AsyncMongoMockClient
from gdb_gap_detector.core import settings
from gdb_gap_detector.models import ScoredCluster
from gdb_gap_detector.pipeline.trend import calculate_trend_deltas


@pytest.mark.asyncio
async def test_trend_deltas_first_run_fallback():
    """Test trend calculation on first run when no previous gap report exists."""
    client = AsyncMongoMockClient()
    db = client[settings.feedback_db_name]

    now = datetime.now(timezone.utc)
    cluster = ScoredCluster(
        cluster_id="c1",
        cluster_name="Aphid Control",
        size=10,
        farmer_demand=10,
        first_seen=now,
        last_seen=now,
        growth_rate=0.0,
        priority_score=10.0,
        priority_level="HIGH",
        triage_status="real_gap",
        recommended_action="Action",
    )

    enriched, delta = await calculate_trend_deltas(db, [cluster], now)
    assert len(enriched) == 1
    assert enriched[0].trend_status == "baseline"
    assert delta.new_clusters == []
    assert delta.growing_clusters == []


@pytest.mark.asyncio
async def test_trend_deltas_with_previous_report():
    """Test trend calculations for NEW, GROWING, and RESOLVED clusters."""
    client = AsyncMongoMockClient()
    db = client[settings.feedback_db_name]
    now = datetime.now(timezone.utc)

    # Seed previous gap report in MongoDB
    previous_report = {
        "_id": "rep_prev",
        "report_type": "weekly_gap_report",
        "generated_at": now,
        "end_date": now - timedelta(days=1),
        "top_gaps": [
            {
                "cluster_id": "c_old_resolved",
                "cluster_name": "Old Resolved Gap",
                "farmer_demand": 10,
            },
            {
                "cluster_id": "c_growing",
                "cluster_name": "Growing Gap",
                "farmer_demand": 10,
            },
        ],
    }
    await db[settings.gap_reports_collection].insert_one(previous_report)

    # Current clusters: c_growing (demand 20 -> +100%), c_new (demand 5)
    c_growing = ScoredCluster(
        cluster_id="c_growing",
        cluster_name="Growing Gap",
        size=20,
        farmer_demand=20,
        first_seen=now,
        last_seen=now,
        growth_rate=0.0,
        priority_score=20.0,
        priority_level="CRITICAL",
        triage_status="real_gap",
        recommended_action="Action",
    )
    c_new = ScoredCluster(
        cluster_id="c_new",
        cluster_name="New Gap Cluster",
        size=5,
        farmer_demand=5,
        first_seen=now,
        last_seen=now,
        growth_rate=0.0,
        priority_score=5.0,
        priority_level="MEDIUM",
        triage_status="real_gap",
        recommended_action="Action",
    )

    enriched, delta = await calculate_trend_deltas(db, [c_growing, c_new], now)

    status_map = {c.cluster_id: c.trend_status for c in enriched}
    assert status_map["c_new"] == "NEW"
    assert status_map["c_growing"] == "GROWING"
    assert "New Gap Cluster" in delta.new_clusters
    assert "Growing Gap" in delta.growing_clusters
    assert "c_old_resolved" in delta.resolved_clusters


@pytest.mark.asyncio
async def test_trend_deltas_shrinking_cluster():
    """Test SHRINKING trend status when demand drops."""
    client = AsyncMongoMockClient()
    db = client[settings.feedback_db_name]
    now = datetime.now(timezone.utc)

    previous_report = {
        "_id": "rep_prev_2",
        "report_type": "weekly_gap_report",
        "generated_at": now,
        "end_date": now - timedelta(days=1),
        "top_gaps": [
            {
                "cluster_id": "c_shrink",
                "cluster_name": "Shrinking Gap",
                "farmer_demand": 50,
                "priority_score": 50.0,
            }
        ],
    }
    await db[settings.gap_reports_collection].insert_one(previous_report)

    c_shrink = ScoredCluster(
        cluster_id="c_shrink",
        cluster_name="Shrinking Gap",
        size=10,
        farmer_demand=10,  # Dropped from 50 to 10 -> -80%
        first_seen=now,
        last_seen=now,
        growth_rate=0.0,
        priority_score=10.0,
        priority_level="HIGH",
        triage_status="real_gap",
        recommended_action="Action",
    )

    enriched, delta = await calculate_trend_deltas(db, [c_shrink], now)
    assert enriched[0].trend_status == "SHRINKING"
    assert "Shrinking Gap" in delta.shrinking_clusters
