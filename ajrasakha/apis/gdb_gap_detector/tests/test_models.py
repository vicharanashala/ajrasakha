from datetime import datetime, timezone
import pytest
from pydantic import ValidationError

from gdb_gap_detector.models import (
    CoverageCell,
    CoverageStats,
    DisclaimerLog,
    FlaggedEntry,
    GapCluster,
    GapReport,
    GdbEntry,
    OutreachRecommendation,
    OverlapSummary,
    ScoredCluster,
    TrendDelta,
)


def test_disclaimer_log_model_validation():
    """Verify DisclaimerLog initializes correctly and omits farmer_id."""
    log = DisclaimerLog(
        _id="doc123",
        query="How to treat yellow rust in wheat?",
        language="Hindi",
        state="Punjab",
        domain="Crop Disease",
        confidence=0.88,
    )
    assert log.id == "doc123"
    assert log.query == "How to treat yellow rust in wheat?"
    assert log.language == "Hindi"
    assert not hasattr(log, "farmer_id")
    assert log.timestamp.tzinfo is not None


def test_gdb_entry_model_validation():
    """Verify GdbEntry parsing."""
    entry = GdbEntry(
        _id="gdb_001",
        question="What is the recommended dose of urea for wheat?",
        answer="Apply 120 kg N/ha in split doses.",
        domain="Soil & Fertilizer",
        state="Haryana",
        keywords=["urea", "wheat", "dose"],
    )
    assert entry.id == "gdb_001"
    assert len(entry.keywords) == 3


def test_flagged_entry_model_validation():
    """Verify FlaggedEntry parsing."""
    flagged = FlaggedEntry(
        _id="flag_001",
        gdb_entry_id="gdb_001",
        domain="Pest Control",
        helpfulness_score=15.0,
        status="flagged",
    )
    assert flagged.gdb_entry_id == "gdb_001"
    assert flagged.helpfulness_score == 15.0


def test_gap_cluster_model_defaults():
    """Verify GapCluster default attributes."""
    now = datetime.now(timezone.utc)
    cluster = GapCluster(
        cluster_id="c123",
        cluster_name="Aphid Control",
        size=10,
        first_seen=now,
        last_seen=now,
        farmer_demand=10,
    )
    assert cluster.is_miscellaneous is False
    assert cluster.real_gap_count == 0
    assert cluster.near_miss_count == 0


def test_scored_cluster_model_extra_fields():
    """Verify ScoredCluster priority levels and dump capability."""
    now = datetime.now(timezone.utc)
    scored = ScoredCluster(
        cluster_id="c123",
        cluster_name="Aphid Control",
        size=10,
        first_seen=now,
        last_seen=now,
        farmer_demand=10,
        growth_rate=0.5,
        priority_score=18.5,
        priority_level="CRITICAL",
        triage_status="real_gap",
        recommended_action="Create GDB entry immediately",
        trend_status="GROWING",
    )
    dump = scored.model_dump()
    assert dump["priority_score"] == 18.5
    assert dump["priority_level"] == "CRITICAL"


def test_gap_report_serialization():
    """Verify full GapReport model dump and field aliases."""
    now = datetime.now(timezone.utc)
    report = GapReport(
        period_days=30,
        start_date=now,
        end_date=now,
        total_disclaimers=50,
        unique_queries=30,
        clusters_found=5,
        overlap_summary=OverlapSummary(real_gap=20, near_miss=8, almost_covered=2),
        trend_delta=TrendDelta(new_clusters=["Cluster A"], growing_clusters=["Cluster B"]),
    )
    data = report.model_dump(by_alias=True)
    assert data["report_type"] == "weekly_gap_report"
    assert data["total_disclaimers"] == 50
    assert len(data["trend_delta"]["new_clusters"]) == 1
