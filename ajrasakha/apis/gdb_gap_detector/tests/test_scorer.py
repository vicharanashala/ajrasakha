from datetime import datetime, timezone
from gdb_gap_detector.models import FlaggedEntry, GapCluster
from gdb_gap_detector.pipeline.scorer import score_clusters


def test_scorer_priority_formula_and_boosts():
    """Test Priority score calculation, Quality Boost (+0.5), and Near-Miss Boost (+0.3)."""
    now = datetime.now(timezone.utc)
    raw_cluster = GapCluster(
        cluster_id="c_pest",
        cluster_name="Aphid Control in Mustard",
        size=10,
        keywords=["aphid", "mustard"],
        domains=["Pest Control"],
        states=["Punjab", "Rajasthan"],  # GeoSpread = 2
        farmer_demand=10,
        near_miss_count=4,  # 4/10 = 40% >= 30% -> NearMissBoost = 0.3
        real_gap_count=6,
        first_seen=now,
        last_seen=now,
    )

    flagged_entries = [
        FlaggedEntry(
            _id="f1",
            gdb_entry_id="g1",
            domain="Pest Control",  # Matches cluster domain -> QualityBoost = 0.5
            helpfulness_score=20.0,
        )
    ]

    scored = score_clusters([raw_cluster], flagged_entries)
    assert len(scored) == 1

    c = scored[0]
    # Expected: Priority = 10 * 2 * (1.0 + 0.0) * (1.0 + 0.5 + 0.3) = 10 * 2 * 1.8 = 36.0
    assert c.priority_score == 36.0
    assert c.priority_level == "CRITICAL"
    assert c.triage_status == "real_gap"


def test_scorer_priority_levels_high_and_medium():
    """Test score thresholds for HIGH (>=8.0) and MEDIUM (>=4.0) priority levels."""
    now = datetime.now(timezone.utc)
    cluster_high = GapCluster(
        cluster_id="c_high",
        cluster_name="High Priority Cluster",
        size=5,
        states=["Punjab", "Haryana"],  # GeoSpread = 2 -> score = 5 * 2 = 10.0
        farmer_demand=5,
        first_seen=now,
        last_seen=now,
    )
    cluster_med = GapCluster(
        cluster_id="c_med",
        cluster_name="Medium Priority Cluster",
        size=5,
        states=["Punjab"],  # GeoSpread = 1 -> score = 5 * 1 = 5.0
        farmer_demand=5,
        first_seen=now,
        last_seen=now,
    )

    scored = score_clusters([cluster_high, cluster_med])
    assert scored[0].priority_level == "HIGH"
    assert scored[1].priority_level == "MEDIUM"


def test_scorer_priority_level_low():
    """Test score threshold for LOW (<4.0) priority level."""
    now = datetime.now(timezone.utc)
    cluster_low = GapCluster(
        cluster_id="c_low",
        cluster_name="Low Priority Cluster",
        size=2,
        states=["Punjab"],  # GeoSpread = 1 -> score = 2.0
        farmer_demand=2,
        first_seen=now,
        last_seen=now,
    )
    scored = score_clusters([cluster_low])
    assert scored[0].priority_level == "LOW"
    assert scored[0].priority_score == 2.0


def test_scorer_dominant_triage_status():
    """Test dominant triage status calculation when near_miss dominates."""
    now = datetime.now(timezone.utc)
    cluster = GapCluster(
        cluster_id="c_triage",
        cluster_name="Near Miss Dominant",
        size=10,
        near_miss_count=6,
        real_gap_count=4,
        farmer_demand=10,
        first_seen=now,
        last_seen=now,
    )
    scored = score_clusters([cluster])
    assert scored[0].triage_status == "near_miss"


def test_scorer_sorting_order():
    """Test that output list is strictly sorted descending by priority_score."""
    now = datetime.now(timezone.utc)
    c1 = GapCluster(cluster_id="1", cluster_name="A", size=2, farmer_demand=2, first_seen=now, last_seen=now)
    c2 = GapCluster(cluster_id="2", cluster_name="B", size=20, farmer_demand=20, first_seen=now, last_seen=now)
    c3 = GapCluster(cluster_id="3", cluster_name="C", size=8, farmer_demand=8, first_seen=now, last_seen=now)

    scored = score_clusters([c1, c2, c3])
    scores = [c.priority_score for c in scored]
    assert scores == sorted(scores, reverse=True)
