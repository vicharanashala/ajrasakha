"""Unit tests for the GDB Coverage Gap Detector.

All tests use deterministic fake embeddings — no SentenceTransformer model
is downloaded or loaded during test execution.
"""
import math
from datetime import datetime, timezone, timedelta
from typing import Optional
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from gdb_gap_detector import (
    DISCLAIMER_TAG,
    TOP_N,
    build_cluster_summaries,
    build_gap_report,
    cluster_queries,
    compute_coverage,
    compute_demand,
    embed_queries,
    fetch_disclaimer_queries,
    generate_outreach_recommendations,
    normalize_queries,
    score_and_rank,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_doc(
    question: str,
    crop: str = "Wheat",
    state: str = "Punjab",
    domain="pest_disease",
    created_at: Optional[datetime] = None,
    tag: str = DISCLAIMER_TAG,
) -> dict:
    from bson import ObjectId

    return {
        "_id": ObjectId(),
        "question": question,
        "tag": tag,
        "source": "AJRASAKHA",
        "details": {
            "crop": crop,
            "state": state,
            "district": "Ludhiana",
            "domain": domain if isinstance(domain, list) else [domain],
        },
        "createdAt": created_at,
    }


def _deterministic_embed_fn(texts: list[str]) -> np.ndarray:
    """Return a simple deterministic embedding: one-hot of first char ord % 8."""
    DIM = 8
    vecs = []
    for t in texts:
        v = np.zeros(DIM, dtype=np.float32)
        idx = ord(t[0]) % DIM if t else 0
        v[idx] = 1.0
        vecs.append(v)
    return np.array(vecs, dtype=np.float32)


def _cluster_embed_fn_similar(texts: list[str]) -> np.ndarray:
    """All texts map to the same vector → all in one cluster."""
    return np.ones((len(texts), 4), dtype=np.float32)


def _cluster_embed_fn_orthogonal(texts: list[str]) -> np.ndarray:
    """Each text maps to a different standard basis vector → all singletons."""
    DIM = max(len(texts), 1)
    out = np.zeros((len(texts), DIM), dtype=np.float32)
    for i in range(len(texts)):
        out[i, i] = 1.0
    return out


# ---------------------------------------------------------------------------
# 1. Disclaimer query filtering
# ---------------------------------------------------------------------------

class TestFetchDisclaimerQueries:
    def test_filters_by_tag(self):
        docs = [
            _make_doc("Q1", tag=DISCLAIMER_TAG),
            _make_doc("Q2", tag=DISCLAIMER_TAG),
            _make_doc("Q3", tag="dynamic"),
        ]
        mock_col = MagicMock()
        mock_col.find.return_value = [docs[0], docs[1]]  # only 2 returned

        result = fetch_disclaimer_queries(mock_col)

        # Verify the correct filter was passed
        call_args = mock_col.find.call_args
        assert call_args[0][0] == {"tag": DISCLAIMER_TAG}
        assert len(result) == 2

    def test_empty_collection(self):
        mock_col = MagicMock()
        mock_col.find.return_value = []
        result = fetch_disclaimer_queries(mock_col)
        assert result == []


# ---------------------------------------------------------------------------
# 2. Metadata normalisation
# ---------------------------------------------------------------------------

class TestNormalizeQuery:
    def test_basic_fields(self):
        doc = _make_doc("Leaf curl in chilli", crop="Chilli", state="Andhra Pradesh")
        nq = normalize_queries([doc])[0]
        assert nq["question"] == "Leaf curl in chilli"
        assert nq["crop"] == "Chilli"
        assert nq["state"] == "Andhra Pradesh"

    def test_dict_crop_ref(self):
        doc = _make_doc("Test", crop="Wheat")
        doc["details"]["crop"] = {"name": "Rice", "aliases": ["chawal"]}
        nq = normalize_queries([doc])[0]
        assert nq["crop"] == "Rice"

    def test_domain_list_join(self):
        doc = _make_doc("Test")
        doc["details"]["domain"] = ["pest_disease", "fertilizer"]
        nq = normalize_queries([doc])[0]
        assert "pest_disease" in nq["domain"]
        assert "fertilizer" in nq["domain"]

    def test_missing_created_at(self):
        doc = _make_doc("Test", created_at=None)
        nq = normalize_queries([doc])[0]
        assert nq["created_at"] is None

    def test_utc_timezone_normalisation(self):
        naive_dt = datetime(2024, 1, 15, 10, 0, 0)
        doc = _make_doc("Test", created_at=naive_dt)
        nq = normalize_queries([doc])[0]
        assert nq["created_at"].tzinfo is not None

    def test_iso_timestamp_is_normalised(self):
        doc = _make_doc("Test", created_at="2024-01-15T10:00:00Z")
        nq = normalize_queries([doc])[0]
        assert nq["created_at"] == datetime(2024, 1, 15, 10, 0, tzinfo=timezone.utc)

    def test_empty_fields_become_empty_string(self):
        doc = _make_doc("Test")
        doc["details"]["crop"] = None
        doc["details"]["state"] = ""
        nq = normalize_queries([doc])[0]
        assert nq["crop"] == ""
        assert nq["state"] == ""


# ---------------------------------------------------------------------------
# 3. Semantic clustering
# ---------------------------------------------------------------------------

class TestClusterQueries:
    def _queries(self, n: int) -> list[dict]:
        return [{"id": str(i), "question": f"Q{i}", "cluster_id": -1,
                 "crop": "Wheat", "state": "Punjab", "domain": "pest"} for i in range(n)]

    def test_empty_input(self):
        result = cluster_queries([], np.zeros((0, 4), dtype=np.float32))
        assert result == []

    def test_singleton_input(self):
        qs = self._queries(1)
        emb = np.array([[1.0, 0.0, 0.0, 0.0]], dtype=np.float32)
        result = cluster_queries(qs, emb)
        assert len(result) == 1
        assert result[0]["cluster_id"] == 0

    def test_similar_questions_in_same_cluster(self):
        qs = self._queries(5)
        # All identical embeddings → distance = 0 → all in one cluster
        emb = _cluster_embed_fn_similar(["x"] * 5)
        result = cluster_queries(qs, emb)
        cluster_ids = {q["cluster_id"] for q in result}
        assert len(cluster_ids) == 1

    def test_orthogonal_questions_in_different_clusters(self):
        qs = self._queries(4)
        emb = _cluster_embed_fn_orthogonal(["x"] * 4)
        result = cluster_queries(qs, emb)
        cluster_ids = {q["cluster_id"] for q in result}
        # Each should be its own cluster (all orthogonal)
        assert len(cluster_ids) == 4

    def test_original_queries_not_mutated(self):
        qs = self._queries(3)
        originals = [q.copy() for q in qs]
        emb = np.eye(3, dtype=np.float32)
        cluster_queries(qs, emb)
        for orig, q in zip(originals, qs):
            assert "cluster_id" not in orig  # originals unchanged


# ---------------------------------------------------------------------------
# 4. Demand analysis — current vs previous period
# ---------------------------------------------------------------------------

class TestComputeDemand:
    _now = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)

    def _q(self, cluster_id: int, days_ago: int) -> dict:
        ts = self._now - timedelta(days=days_ago)
        return {"cluster_id": cluster_id, "created_at": ts}

    def test_current_period_counted(self):
        qs = [self._q(0, 1), self._q(0, 3)]  # both within last 7 days
        demand = compute_demand(qs, now=self._now)
        assert demand[0]["current"] == 2
        assert demand[0]["previous"] == 0

    def test_previous_period_counted(self):
        qs = [self._q(0, 8), self._q(0, 10)]  # 8–14 days ago
        demand = compute_demand(qs, now=self._now)
        assert demand[0]["current"] == 0
        assert demand[0]["previous"] == 2

    def test_growth_zero_previous(self):
        qs = [self._q(0, 2)]
        demand = compute_demand(qs, now=self._now)
        assert demand[0]["growth"] == 1.0  # new demand from zero

    def test_growth_no_change(self):
        qs = [self._q(0, 3), self._q(0, 10)]  # 1 current, 1 previous
        demand = compute_demand(qs, now=self._now)
        assert demand[0]["growth"] == 0.0

    def test_growth_positive(self):
        qs = [self._q(0, 2), self._q(0, 4), self._q(0, 10)]  # 2 current, 1 prev
        demand = compute_demand(qs, now=self._now)
        assert demand[0]["growth"] == pytest.approx(1.0)

    def test_growth_negative(self):
        qs = [self._q(0, 3), self._q(0, 9), self._q(0, 12)]  # 1 current, 2 prev
        demand = compute_demand(qs, now=self._now)
        assert demand[0]["growth"] == pytest.approx(-0.5)

    def test_no_date_counts_in_current(self):
        qs = [{"cluster_id": 0, "created_at": None}]
        demand = compute_demand(qs, now=self._now)
        assert demand[0]["current"] == 1


# ---------------------------------------------------------------------------
# 5. Priority ranking
# ---------------------------------------------------------------------------

class TestScoreAndRank:
    def _summary(self, current: int, growth: float, size: int) -> dict:
        return {
            "cluster_id": id(current),
            "size": size,
            "representative_question": "Test Q",
            "sample_questions": ["Test Q"],
            "crop": "Wheat",
            "state": "Punjab",
            "domain": "pest",
            "current_demand": current,
            "previous_demand": 0,
            "growth": growth,
            "total_demand": current + size,
        }

    def test_top_20_limit(self):
        summaries = [self._summary(1, 0.0, 1) for _ in range(30)]
        ranked = score_and_rank(summaries, top_n=20)
        assert len(ranked) == 20

    def test_rank_assigned_sequentially(self):
        summaries = [self._summary(i + 1, 0.0, 1) for i in range(5)]
        ranked = score_and_rank(summaries, top_n=5)
        ranks = [r["rank"] for r in ranked]
        assert ranks == list(range(1, 6))

    def test_critical_level(self):
        # current_demand=20, growth=2.0, size=10 → score well above 8
        s = self._summary(20, 2.0, 10)
        ranked = score_and_rank([s])
        assert ranked[0]["priority_level"] == "CRITICAL"

    def test_low_level(self):
        s = self._summary(0, 0.0, 1)
        ranked = score_and_rank([s])
        assert ranked[0]["priority_level"] == "LOW"

    def test_high_demand_ranks_before_low(self):
        low = self._summary(1, 0.0, 1)
        high = self._summary(50, 0.5, 10)
        ranked = score_and_rank([low, high])
        assert ranked[0]["current_demand"] == 50

    def test_positive_growth_bonus_applied(self):
        with_growth = self._summary(5, 2.0, 1)
        without_growth = self._summary(5, 0.0, 1)
        ranked_w = score_and_rank([with_growth])
        ranked_wo = score_and_rank([without_growth])
        assert ranked_w[0]["priority_score"] > ranked_wo[0]["priority_score"]


# ---------------------------------------------------------------------------
# 6. Coverage classification
# ---------------------------------------------------------------------------

class TestComputeCoverage:
    def _make_queries(self, n: int, crop: str, state: str, domain: str) -> list[dict]:
        return [
            {"crop": crop, "state": state, "domain": domain}
            for _ in range(n)
        ]

    def _mock_golden(self, count: int):
        """Mock golden_collection.count_documents to always return ``count``."""
        mock = MagicMock()
        mock.count_documents.return_value = count
        return mock

    def test_gap_when_no_gdb_entries(self):
        qs = self._make_queries(3, "Wheat", "Punjab", "pest")
        result = compute_coverage(qs, self._mock_golden(0))
        row = next(r for r in result if r["crop"] == "Wheat")
        assert row["coverage_level"] == "GAP"

    def test_partial_when_few_gdb_entries(self):
        qs = self._make_queries(2, "Rice", "Bihar", "fertilizer")
        result = compute_coverage(qs, self._mock_golden(3))
        row = next(r for r in result if r["crop"] == "Rice")
        assert row["coverage_level"] == "PARTIAL"

    def test_strong_when_many_gdb_entries(self):
        qs = self._make_queries(5, "Maize", "Karnataka", "irrigation")
        result = compute_coverage(qs, self._mock_golden(10))
        row = next(r for r in result if r["crop"] == "Maize")
        assert row["coverage_level"] == "STRONG"

    def test_empty_disclaimer_queries(self):
        result = compute_coverage([], self._mock_golden(0))
        assert result == []


# ---------------------------------------------------------------------------
# 7. Outreach recommendations
# ---------------------------------------------------------------------------

class TestOutreachRecommendations:
    def _row(self, state: str, demand: int, level: str) -> dict:
        return {
            "crop": "Wheat",
            "state": state,
            "domain": "pest",
            "unanswered_demand": demand,
            "gdb_entry_count": 0 if level == "GAP" else 2,
            "coverage_level": level,
        }

    def test_gap_rows_prioritised(self):
        rows = [
            self._row("Punjab", 1, "STRONG"),
            self._row("Bihar", 5, "GAP"),
            self._row("UP", 3, "PARTIAL"),
        ]
        recs = generate_outreach_recommendations(rows, top_n=3)
        assert recs[0]["state"] == "Bihar"

    def test_top_n_limit(self):
        rows = [self._row(f"State{i}", 10 - i, "GAP") for i in range(20)]
        recs = generate_outreach_recommendations(rows, top_n=5)
        assert len(recs) <= 5

    def test_recommendation_text_present(self):
        rows = [self._row("Punjab", 3, "GAP")]
        recs = generate_outreach_recommendations(rows, top_n=1)
        assert "Punjab" in recs[0]["recommendation"]

    def test_urgency_levels(self):
        urgent_row = self._row("X", 5, "GAP")
        moderate_row = self._row("Y", 1, "GAP")
        advisory_row = self._row("Z", 3, "PARTIAL")
        rows = [urgent_row, moderate_row, advisory_row]
        recs = {r["state"]: r for r in generate_outreach_recommendations(rows)}
        assert recs["X"]["urgency"] == "URGENT"
        assert recs["Y"]["urgency"] == "MODERATE"
        assert recs["Z"]["urgency"] == "ADVISORY"


# ---------------------------------------------------------------------------
# 8. Full pipeline (build_gap_report) — smoke test with fakes
# ---------------------------------------------------------------------------

class TestBuildGapReport:
    _now = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)

    def _make_fake_collection(self, docs: list[dict]):
        mock = MagicMock()
        mock.find.return_value = docs
        return mock

    def _make_fake_golden(self, count: int = 0):
        mock = MagicMock()
        mock.count_documents.return_value = count
        return mock

    def test_empty_database_returns_empty_report(self):
        from gdb_gap_detector import invalidate_cache
        invalidate_cache()
        col = self._make_fake_collection([])
        golden = self._make_fake_golden()
        report = build_gap_report(
            col, golden, _deterministic_embed_fn,
            use_cache=False, now=self._now,
        )
        assert report["kpis"]["total_unanswered_queries"] == 0
        assert report["top_gaps"] == []
        assert report["coverage"] == []

    def test_report_contains_required_keys(self):
        from gdb_gap_detector import invalidate_cache
        invalidate_cache()
        docs = [
            _make_doc("Aphid attack on wheat", created_at=self._now - timedelta(days=2)),
            _make_doc("Yellow rust in wheat", created_at=self._now - timedelta(days=3)),
        ]
        col = self._make_fake_collection(docs)
        golden = self._make_fake_golden()
        report = build_gap_report(
            col, golden, _deterministic_embed_fn,
            use_cache=False, now=self._now,
        )
        assert "kpis" in report
        assert "top_gaps" in report
        assert "coverage" in report
        assert "outreach_recommendations" in report
        assert "generated_at" in report

    def test_kpi_total_unanswered_matches_doc_count(self):
        from gdb_gap_detector import invalidate_cache
        invalidate_cache()
        docs = [_make_doc(f"Q{i}", created_at=self._now - timedelta(days=1)) for i in range(5)]
        col = self._make_fake_collection(docs)
        golden = self._make_fake_golden()
        report = build_gap_report(
            col, golden, _deterministic_embed_fn,
            use_cache=False, now=self._now,
        )
        assert report["kpis"]["total_unanswered_queries"] == 5

    def test_top_gaps_at_most_top_n(self):
        from gdb_gap_detector import invalidate_cache
        invalidate_cache()
        docs = [
            _make_doc(f"Unique question about topic {i}", created_at=self._now - timedelta(days=1))
            for i in range(30)
        ]
        col = self._make_fake_collection(docs)
        golden = self._make_fake_golden()
        report = build_gap_report(
            col, golden, _deterministic_embed_fn,
            use_cache=False, now=self._now,
        )
        assert len(report["top_gaps"]) <= TOP_N

    def test_cache_returns_same_report(self):
        from gdb_gap_detector import invalidate_cache
        invalidate_cache()
        docs = [_make_doc("Test Q", created_at=self._now)]
        col = self._make_fake_collection(docs)
        golden = self._make_fake_golden()

        r1 = build_gap_report(col, golden, _deterministic_embed_fn, use_cache=True, now=self._now)
        r2 = build_gap_report(col, golden, _deterministic_embed_fn, use_cache=True, now=self._now)

        # Second call should use cache; collection.find should be called only once
        assert col.find.call_count == 1
        assert r1["generated_at"] == r2["generated_at"]

    def test_gap_report_each_gap_has_rank(self):
        from gdb_gap_detector import invalidate_cache
        invalidate_cache()
        docs = [_make_doc(f"Q{i}", created_at=self._now - timedelta(days=1)) for i in range(3)]
        col = self._make_fake_collection(docs)
        golden = self._make_fake_golden()
        report = build_gap_report(
            col, golden, _deterministic_embed_fn,
            use_cache=False, now=self._now,
        )
        for gap in report["top_gaps"]:
            assert "rank" in gap
            assert "priority_level" in gap
            assert "priority_score" in gap


class TestGapReportEndpoint:
    def test_endpoint_returns_report_without_loading_embeddings(self, monkeypatch):
        from fastapi.testclient import TestClient
        import main

        expected = {"kpis": {}, "top_gaps": [], "coverage": [], "outreach_recommendations": []}
        monkeypatch.setattr(main, "build_gap_report", lambda **_: expected)

        response = TestClient(main.app).get("/gdb/gap-report")

        assert response.status_code == 200
        assert response.json() == expected
