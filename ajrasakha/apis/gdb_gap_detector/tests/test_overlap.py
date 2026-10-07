from gdb_gap_detector.pipeline.overlap import triage_query_overlaps


def test_triage_query_overlaps_thresholds():
    """Test overlap triage classification thresholds (<0.4 real_gap, 0.4-0.7 near_miss, >=0.7 almost_covered)."""
    sample_map = {
        "h_gap": {"best_match_scores": [0.20, 0.25], "count": 2},
        "h_near": {"best_match_scores": [0.55, 0.60], "count": 3},
        "h_covered": {"best_match_scores": [0.85, 0.90], "count": 1},
        "h_empty": {"best_match_scores": [], "count": 1},
    }

    triage_map, summary_counts = triage_query_overlaps(
        sample_map, low_threshold=0.4, high_threshold=0.7
    )

    assert triage_map["h_gap"] == "real_gap"
    assert triage_map["h_near"] == "near_miss"
    assert triage_map["h_covered"] == "almost_covered"
    assert triage_map["h_empty"] == "real_gap"

    assert summary_counts["real_gap"] == 3  # 2 + 1
    assert summary_counts["near_miss"] == 3
    assert summary_counts["almost_covered"] == 1


def test_triage_exact_boundary_low():
    """Test boundary condition where average score is exactly equal to low_threshold (0.4)."""
    sample_map = {
        "h_exact_low": {"best_match_scores": [0.40], "count": 1},
        "h_below_low": {"best_match_scores": [0.399], "count": 1},
    }
    triage_map, _ = triage_query_overlaps(sample_map, low_threshold=0.4, high_threshold=0.7)
    assert triage_map["h_exact_low"] == "near_miss"
    assert triage_map["h_below_low"] == "real_gap"


def test_triage_exact_boundary_high():
    """Test boundary condition where average score is exactly equal to high_threshold (0.7)."""
    sample_map = {
        "h_exact_high": {"best_match_scores": [0.70], "count": 1},
        "h_below_high": {"best_match_scores": [0.699], "count": 1},
    }
    triage_map, _ = triage_query_overlaps(sample_map, low_threshold=0.4, high_threshold=0.7)
    assert triage_map["h_exact_high"] == "almost_covered"
    assert triage_map["h_below_high"] == "near_miss"


def test_triage_custom_threshold_parameters():
    """Test custom threshold overrides."""
    sample_map = {
        "h_custom": {"best_match_scores": [0.50], "count": 1},
    }
    # Low threshold set to 0.6 -> score 0.5 becomes real_gap
    triage_map, _ = triage_query_overlaps(sample_map, low_threshold=0.6, high_threshold=0.8)
    assert triage_map["h_custom"] == "real_gap"


def test_triage_empty_map():
    """Test triage behavior on empty input map."""
    triage_map, summary_counts = triage_query_overlaps({})
    assert triage_map == {}
    assert summary_counts == {"real_gap": 0, "near_miss": 0, "almost_covered": 0}
