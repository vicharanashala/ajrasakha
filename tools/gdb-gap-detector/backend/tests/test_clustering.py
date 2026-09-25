import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from datetime import datetime, timedelta, timezone
from app.clustering import cluster_gap_questions, rank_gap_report, build_coverage_heatmap, GapCluster
from app.synthetic_data import generate_synthetic_questions, generate_synthetic_gdb_entry_counts


def _q(question, crop, state, domain, embedding, days_ago=0):
    return {
        "question": question,
        "crop": crop,
        "state": state,
        "domain": domain,
        "embedding": embedding,
        "created_at": datetime.now(timezone.utc) - timedelta(days=days_ago),
    }


class TestClusterGapQuestions:
    def test_empty_input_returns_empty_list(self):
        assert cluster_gap_questions([]) == []

    def test_groups_semantically_similar_questions_into_one_cluster(self):
        questions = [
            _q("Why are cotton leaves yellow?", "Cotton", "Punjab", "Pest", [0.9, 0.1, 0.1]),
            _q("Cotton leaves turning yellow", "Cotton", "Punjab", "Pest", [0.88, 0.12, 0.1]),
            _q("Yellowing on cotton crop", "Cotton", "Punjab", "Pest", [0.91, 0.09, 0.11]),
        ]
        clusters = cluster_gap_questions(questions, eps=0.3, min_samples=2)
        assert len(clusters) == 1
        assert clusters[0].total_count == 3
        assert clusters[0].crop == "Cotton"

    def test_keeps_dissimilar_topics_in_separate_clusters(self):
        questions = [
            _q("Cotton leaves yellow", "Cotton", "Punjab", "Pest", [0.9, 0.1, 0.1]),
            _q("Cotton yellowing issue", "Cotton", "Punjab", "Pest", [0.88, 0.1, 0.1]),
            _q("When to sow rice", "Rice", "West Bengal", "Weather", [0.1, 0.9, 0.1]),
            _q("Best rice sowing time", "Rice", "West Bengal", "Weather", [0.1, 0.88, 0.1]),
        ]
        clusters = cluster_gap_questions(questions, eps=0.3, min_samples=2)
        assert len(clusters) == 2
        crops_found = {c.crop for c in clusters}
        assert crops_found == {"Cotton", "Rice"}

    def test_single_isolated_question_is_treated_as_noise_not_a_gap_cluster(self):
        # Only one question on this topic — min_samples=2 means it should
        # NOT be reported as a systemic gap yet (that would be a false alarm
        # from a single farmer's one-off phrasing).
        questions = [
            _q("Cotton leaves yellow", "Cotton", "Punjab", "Pest", [0.9, 0.1, 0.1]),
            _q("Cotton yellowing", "Cotton", "Punjab", "Pest", [0.88, 0.1, 0.1]),
            _q("Completely unrelated one-off question", "Maize", "Bihar", "Soil", [0.0, 0.0, 0.99]),
        ]
        clusters = cluster_gap_questions(questions, eps=0.3, min_samples=2)
        assert len(clusters) == 1
        assert clusters[0].crop == "Cotton"

    def test_growth_rate_reflects_increasing_recent_volume(self):
        questions = (
            [_q(f"Cotton yellow {i}", "Cotton", "Punjab", "Pest", [0.9, 0.1, 0.1], days_ago=3) for i in range(6)]
            + [_q(f"Cotton yellow old {i}", "Cotton", "Punjab", "Pest", [0.9, 0.1, 0.1], days_ago=10) for i in range(2)]
        )
        clusters = cluster_gap_questions(questions, eps=0.3, min_samples=2)
        assert len(clusters) == 1
        c = clusters[0]
        assert c.count_last_7_days == 6
        assert c.count_prior_7_days == 2
        assert c.growth_rate == 3.0  # 6 / 2

    def test_growth_rate_handles_zero_prior_week_without_crashing(self):
        questions = [_q(f"Cotton yellow {i}", "Cotton", "Punjab", "Pest", [0.9, 0.1, 0.1], days_ago=1) for i in range(3)]
        clusters = cluster_gap_questions(questions, eps=0.3, min_samples=2)
        c = clusters[0]
        assert c.count_prior_7_days == 0
        assert c.growth_rate == 3.0  # treated as "went from nothing to 3", not a division error

    def test_never_merges_two_different_crop_state_groups_even_with_similar_embeddings(self):
        # Regression test: an earlier version of this pipeline clustered
        # purely on embeddings first and inferred crop/state/domain via
        # majority vote afterward. Cotton/Punjab/Pest and Tomato/Karnataka/
        # Pest questions had embeddings close enough to get merged into one
        # cluster, silently losing the Tomato/Karnataka signal. Partitioning
        # by crop/state/domain FIRST (current implementation) must prevent
        # this regardless of how close the embeddings are.
        questions = [
            _q("Cotton leaves yellow", "Cotton", "Punjab", "Pest", [0.9, 0.1, 0.1]),
            _q("Cotton yellowing issue", "Cotton", "Punjab", "Pest", [0.89, 0.1, 0.1]),
            _q("Tomato leaves have holes", "Tomato", "Karnataka", "Pest", [0.88, 0.12, 0.1]),  # deliberately close embedding, different crop/state
            _q("Insects eating tomato", "Tomato", "Karnataka", "Pest", [0.87, 0.11, 0.1]),
        ]
        clusters = cluster_gap_questions(questions, eps=0.3, min_samples=2)
        assert len(clusters) == 2
        crop_state_pairs = {(c.crop, c.state) for c in clusters}
        assert crop_state_pairs == {("Cotton", "Punjab"), ("Tomato", "Karnataka")}
        # Every cluster's sample questions must actually belong to that
        # cluster's crop — no cross-contamination in either direction.
        for c in clusters:
            if c.crop == "Cotton":
                assert all("cotton" in q.lower() or "yellow" in q.lower() for q in c.sample_questions)
            if c.crop == "Tomato":
                assert all("tomato" in q.lower() for q in c.sample_questions)


class TestRankGapReport:
    def test_ranks_larger_clusters_higher_when_growth_is_equal(self):
        small = GapCluster(0, "A", "S1", "Pest", ["q"], total_count=2, count_last_7_days=1, count_prior_7_days=1)
        large = GapCluster(1, "B", "S2", "Pest", ["q"], total_count=10, count_last_7_days=5, count_prior_7_days=5)
        ranked = rank_gap_report([small, large])
        assert ranked[0].crop == "B"

    def test_growing_cluster_can_outrank_a_larger_but_stable_one(self):
        # Close enough in size that a strong growth trend should tip the ranking —
        # unlike a huge size gap (e.g. 20 vs 8), which should stay ranked by size.
        stable_larger = GapCluster(0, "A", "S1", "Pest", ["q"], total_count=10, count_last_7_days=2, count_prior_7_days=2)
        growing_smaller = GapCluster(1, "B", "S2", "Pest", ["q"], total_count=8, count_last_7_days=6, count_prior_7_days=1)
        ranked = rank_gap_report([stable_larger, growing_smaller])
        assert ranked[0].crop == "B"

    def test_a_much_larger_stable_gap_still_outranks_a_smaller_growing_one(self):
        # Growth is capped at a 3x multiplier by design (see priority_score
        # docstring) — it should tip a close call, but not let a small
        # cluster leapfrog a much larger one just because it's growing fast.
        stable_much_larger = GapCluster(0, "A", "S1", "Pest", ["q"], total_count=20, count_last_7_days=2, count_prior_7_days=2)
        growing_small = GapCluster(1, "B", "S2", "Pest", ["q"], total_count=8, count_last_7_days=6, count_prior_7_days=1)
        ranked = rank_gap_report([stable_much_larger, growing_small])
        assert ranked[0].crop == "A"

    def test_respects_top_n_limit(self):
        clusters = [GapCluster(i, "A", "S", "Pest", ["q"], total_count=i + 1, count_last_7_days=1, count_prior_7_days=1) for i in range(30)]
        ranked = rank_gap_report(clusters, top_n=5)
        assert len(ranked) == 5


class TestCoverageHeatmap:
    def test_empty_clusters_and_empty_gdb_counts_returns_empty_heatmap(self):
        assert build_coverage_heatmap([], {}) == []

    def test_aggregates_gap_counts_per_domain_state_pair_across_different_crops(self):
        # Two different crops, same domain+state — should combine into one
        # heatmap cell, since the real GDB-entry data only supports
        # domain+state granularity (no crop field), confirmed against the
        # actual database schema.
        clusters = [
            GapCluster(0, "Cotton", "Punjab", "Pest", ["q"], total_count=5, count_last_7_days=1, count_prior_7_days=1),
            GapCluster(1, "Wheat", "Punjab", "Pest", ["q"], total_count=3, count_last_7_days=1, count_prior_7_days=1),
        ]
        heatmap = build_coverage_heatmap(clusters, {})
        pest_punjab = next(c for c in heatmap if c["domain"] == "Pest" and c["state"] == "Punjab")
        assert pest_punjab["gap_count"] == 8  # 5 + 3, combined across the two crops

    def test_coverage_pct_reflects_true_ratio_not_just_gap_volume(self):
        # Same gap volume (18) but very different real coverage — this is
        # exactly the distinction gap-volume-alone can't make.
        clusters = [
            GapCluster(0, "Cotton", "Punjab", "Pest", ["q"], total_count=18, count_last_7_days=1, count_prior_7_days=1),
            GapCluster(1, "Tomato", "Karnataka", "Pest", ["q"], total_count=18, count_last_7_days=1, count_prior_7_days=1),
        ]
        gdb_counts = {
            ("Pest", "Punjab"): 200,      # well covered despite the gap volume
            ("Pest", "Karnataka"): 1,      # severely under-covered
        }
        heatmap = build_coverage_heatmap(clusters, gdb_counts)
        punjab = next(c for c in heatmap if c["state"] == "Punjab")
        karnataka = next(c for c in heatmap if c["state"] == "Karnataka")

        assert punjab["gap_count"] == karnataka["gap_count"] == 18  # same raw volume
        assert punjab["coverage_pct"] > 90    # 200 / (200+18) ≈ 91.7%
        assert karnataka["coverage_pct"] < 10  # 1 / (1+18) ≈ 5.3%

    def test_worst_covered_pair_is_sorted_first(self):
        clusters = [
            GapCluster(0, "Cotton", "Punjab", "Pest", ["q"], total_count=5, count_last_7_days=1, count_prior_7_days=1),
            GapCluster(1, "Tomato", "Karnataka", "Pest", ["q"], total_count=5, count_last_7_days=1, count_prior_7_days=1),
        ]
        gdb_counts = {("Pest", "Punjab"): 100, ("Pest", "Karnataka"): 1}
        heatmap = build_coverage_heatmap(clusters, gdb_counts)
        assert heatmap[0]["state"] == "Karnataka"  # worse coverage ranks first

    def test_a_pair_with_gdb_entries_but_zero_current_gaps_still_appears(self):
        # A domain/state that's fully served (no active gaps right now)
        # should still show up as a fully-covered cell, not be silently
        # omitted.
        heatmap = build_coverage_heatmap([], {("Scheme", "Haryana"): 50})
        assert len(heatmap) == 1
        assert heatmap[0]["coverage_pct"] == 100.0
        assert heatmap[0]["gap_count"] == 0

    def test_a_pair_with_gaps_but_zero_gdb_entries_shows_zero_coverage(self):
        clusters = [GapCluster(0, "Maize", "Bihar", "Soil", ["q"], total_count=7, count_last_7_days=1, count_prior_7_days=1)]
        heatmap = build_coverage_heatmap(clusters, {})
        assert heatmap[0]["coverage_pct"] == 0.0
        assert heatmap[0]["gap_intensity"] == 1.0

    def test_matches_gap_and_gdb_domains_despite_different_real_world_vocabulary(self):
        # Regression test for a real bug found in live testing: raw_queries
        # uses "Disease"/"Pest"/"Fertilizer", gdb_entries uses "Crop Disease"/
        # "Pest Control"/"Fertilizers" for the SAME topics. Before
        # normalization, every cell showed either 0% or 100% — never a real
        # ratio — because exact string matching never found an overlap.
        clusters = [
            GapCluster(0, "Tomato", "Punjab", "Disease", ["q"], total_count=7, count_last_7_days=1, count_prior_7_days=1),
            GapCluster(1, "Cotton", "Gujarat", "Pest", ["q"], total_count=4, count_last_7_days=1, count_prior_7_days=1),
        ]
        gdb_counts = {
            ("Crop Disease", "Punjab"): 40,
            ("Pest Control", "Gujarat"): 2,
        }
        heatmap = build_coverage_heatmap(clusters, gdb_counts)

        disease_row = next(r for r in heatmap if r["state"] == "Punjab")
        pest_row = next(r for r in heatmap if r["state"] == "Gujarat")

        # Must actually match across the vocabulary difference — not stay
        # stuck at 0% (which is what the bug produced).
        assert disease_row["gap_count"] == 7
        assert disease_row["gdb_entry_count"] == 40
        assert disease_row["coverage_pct"] > 0

        assert pest_row["gap_count"] == 4
        assert pest_row["gdb_entry_count"] == 2
        assert pest_row["coverage_pct"] > 0

    def test_display_domain_prefers_gap_side_wording(self):
        # Even though matching is normalized internally, the displayed
        # label should stay human-readable and prefer the gap-side wording
        # (closer to how farmers' questions were actually categorized).
        clusters = [GapCluster(0, "Tomato", "Punjab", "Disease", ["q"], total_count=5, count_last_7_days=1, count_prior_7_days=1)]
        gdb_counts = {("Crop Disease", "Punjab"): 10}
        heatmap = build_coverage_heatmap(clusters, gdb_counts)
        assert heatmap[0]["domain"] == "Disease"  # not "Crop Disease"


class TestSyntheticDataIntegration:
    """End-to-end sanity check: does the whole pipeline behave sensibly on
    the synthetic dataset used for demoing, not just on hand-crafted cases?"""

    def test_designated_growth_topic_actually_ranks_first(self):
        questions = generate_synthetic_questions(weeks_of_history=6, growth_topics=(0,))
        clusters = cluster_gap_questions(questions, eps=0.35, min_samples=2)
        report = rank_gap_report(clusters, top_n=5)
        assert len(report) > 0
        # Topic 0 in synthetic_data.py is Cotton/Punjab/Pest, configured to grow
        assert report[0].crop == "Cotton"

    def test_heatmap_has_entries_for_multiple_domain_state_pairs(self):
        questions = generate_synthetic_questions(weeks_of_history=6)
        clusters = cluster_gap_questions(questions, eps=0.35, min_samples=2)
        gdb_counts = generate_synthetic_gdb_entry_counts()
        heatmap = build_coverage_heatmap(clusters, gdb_counts)
        pairs = {(row["domain"], row["state"]) for row in heatmap}
        assert len(pairs) >= 2

    def test_synthetic_pipeline_produces_a_true_coverage_percentage_for_every_cell(self):
        questions = generate_synthetic_questions(weeks_of_history=6)
        clusters = cluster_gap_questions(questions, eps=0.35, min_samples=2)
        gdb_counts = generate_synthetic_gdb_entry_counts()
        heatmap = build_coverage_heatmap(clusters, gdb_counts)
        for row in heatmap:
            assert 0.0 <= row["coverage_pct"] <= 100.0
            assert "gdb_entry_count" in row
