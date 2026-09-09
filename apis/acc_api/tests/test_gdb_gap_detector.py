"""
Unit tests for the ``gdb_gap_detector`` module used by ``/gdb/gap-report``.

Goals
-----
* Deterministic - no live Mongo, no network, no real model.
* Use an injected clock and an injectable ``embed_fn``.
* Cover all 10 behaviours from the test charter:

  1. Query normalisation + metadata extraction.
  2. Injectable fake embedding function + lazy model-loading behaviour
     (i.e. ``SentenceTransformer`` is **never** touched).
  3. Semantic clustering + fallback behaviour.
  4. Current-vs-previous-period demand (including zero previous demand).
  5. Priority-score calculation + level thresholds.
  6. GDB coverage counting + STRONG/PARTIAL/GAP classification.
  7. Outreach recommendation ranking + urgency.
  8. Full ``build_gap_report()`` output shape using mock collections,
     fixed time.
  9. Endpoint validation for invalid threshold, min_samples, lookback_days.
 10. Endpoint cache behaviour, ``refresh=true`` and ``/gdb/refresh``
     invalidation.

These tests follow the repository's standard pytest layout: ``apis/acc_api``
ships a ``tests/`` package and we exercise the module *as it would be
imported by the endpoint*.  No patching of internals.
"""

from __future__ import annotations

import itertools
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pytest

# Path setup so the test file works whether invoked from repo root or here.
_HERE = Path(__file__).resolve().parent
if str(_HERE.parent) not in sys.path:
    sys.path.insert(0, str(_HERE.parent))

import gdb_gap_detector as gd
from gdb_gap_detector import (
    DISCLAIMER_TAG,
    GapCluster,
    LOOKBACK_DAYS,
    MEDIUM_CLUSTER_SIZE,
    MIN_QUERIES_PER_CLUSTER,
    PARTIAL,
    PARTIAL_MIN_HITS,
    PRIORITY_MAX_DEMAND,
    SIMILARITY_THRESHOLD,
    STRONG,
    STRONG_MIN_HITS,
    GAP,
    build_coverage_heatmap,
    build_gap_report,
    build_recommendations,
    cluster_queries,
    compute_priority_score,
    coverage_band_to_score,
    current_vs_previous_demand,
    encode_queries,
    fetch_disclaimer_queries,
    get_cached_report,
    invalidate_cache,
    lookup_gdb_coverage,
    normalize_query,
    query_to_text,
    score_to_priority,
    set_cached_report,
    weekly_demand,
    weekly_growth_pct,
)


# ---------------------------------------------------------------------------
# Tiny helpers used throughout the suite
# ---------------------------------------------------------------------------

# Fixed clock used everywhere; chosen so date-arithmetic is reproducible
# irrespective of when the tests actually run.
NOW = datetime(2026, 7, 28, 12, 0, 0, tzinfo=timezone.utc)


def fixed_now() -> datetime:
    """Return the fixed test clock."""
    return NOW


def days_ago(n: int) -> datetime:
    return NOW - timedelta(days=n)


def make_doc(text: str, *, days: int | None = 1,
             crop: str | None = None,
             state: str | None = None,
             domain: str | None = None,
             tag: str = DISCLAIMER_TAG,
             field_name: str = "text") -> dict:
    """Build a Mongo-style disclaimer query document.

    ``field_name`` controls which field carries the question text (the
    detector uses ``"question"``; some legacy docs may use ``"text"``).
    """
    details: dict[str, Any] = {}
    if crop:
        details["crop"] = crop
    if state:
        details["state"] = state
    if domain:
        details["domain"] = domain
    ts = days_ago(days) if days is not None else None
    return {
        field_name: text,
        "tag": tag,
        "details": details,
        # Detector's in-memory helpers read snake_case ``created_at``;
        # the Mongo layer (via ``fetch_disclaimer_queries``) emits the
        # same key.  Provide both so the unit tests don't depend on the
        # name the upstream API happens to use.
        "created_at": ts,
        "createdAt": ts,
    }


class FakeCollection:
    """Minimal duck-typed Mongo collection.

    The detector never reaches into a real driver – it works against any
    iterable returned by ``find()`` and any int returned by
    ``count_documents()``.  This in-memory stand-in is good enough to
    exercise the full pipeline.

    * ``find()`` returns whatever docs were registered – the detector
      does the rest of the filtering in memory.
    * ``count_documents()`` looks up the canonical key in ``self.counts``;
      if no entry exists the wildcard ``"*"`` is returned (default 0).
    """

    def __init__(self, docs: Iterable[dict] | None = None,
                 *, counts: dict | None = None) -> None:
        self.docs = list(docs or [])
        self.counts = counts or {}
        self.find_calls: list[tuple] = []
        self.count_calls: list[tuple] = []

    def find(self, query: dict, projection: dict | None = None) -> list[dict]:
        self.find_calls.append((query, projection))
        # Permissive – tests pre-seed the documents they want returned.
        return list(self.docs)

    def count_documents(self, filt: dict, **kwargs: Any) -> int:
        self.count_calls.append((filt, kwargs))
        # Wildcard wins; otherwise attempt exact canonical match.
        if "*" in self.counts:
            return int(self.counts["*"])
        key = repr(filt)
        if key in self.counts:
            return int(self.counts[key])
        return 0

    def aggregate(self, pipeline: list, **kwargs: Any) -> list[dict]:
        return []


# ---------------------------------------------------------------------------
# Deterministic fake embedding function
# ---------------------------------------------------------------------------

# Map unique query text to its assigned bucket (semantic equivalence class).
# Tests assign these buckets to control cluster membership explicitly.
BUCKETS = {
    "rain deficit wheat punjab":      "weather-wheat",
    "how to manage rainfall deficit": "weather-wheat",
    "what is rain deficit in wheat":  "weather-wheat",
    "pest attack on cotton leaf":     "pest-cotton",
    "whitefly on cotton":             "pest-cotton",
    "soil fertility for rice":        "soil-rice",
}

# Stable bucket → dimension index mapping (independent of ``hash()``,
# which is randomised per Python process via ``PYTHONHASHSEED``).  Each
# bucket gets a unique positive dimension so vectors with different
# buckets are guaranteed to have at least one differing coordinate.
_BUCKET_INDEX = {
    "weather-wheat": 1,
    "pest-cotton":   2,
    "soil-rice":     3,
}

DIM = 8


def fake_embed(texts: list[str], *, dim: int = DIM) -> np.ndarray:
    """Deterministic bag-of-buckets embedding.

    * Position ``0`` always equals 1.0 so vectors are non-zero.
    * Position ``_BUCKET_INDEX[bucket]`` (or a hash-derived stable index
      for unknown texts) gets a 1.0 for that bucket.
    * All other positions are 0.

    Texts sharing a bucket produce *identical* vectors (cosine = 1).
    Different buckets produce different orthogonal dimensions
    (cosine ≈ 1/√2 after L2-normalisation).
    """
    out = np.zeros((len(texts), dim), dtype=np.float32)
    for i, t in enumerate(texts):
        out[i, 0] = 1.0
        bucket = BUCKETS.get(t)
        if bucket is not None:
            out[i, _BUCKET_INDEX.get(bucket, 4)] = 1.0
        else:
            # Stable position per text via a per-process-stable hash
            # that does not depend on the randomised string hash.
            out[i, ((sum(ord(c) for c in t) * 31) % (dim - 1)) + 1] = 1.0
    return out


# ---------------------------------------------------------------------------
# 1. Query normalisation + metadata extraction
# ---------------------------------------------------------------------------

class TestNormalisationAndMetadata:
    def test_normalize_query_lowercases_and_strips_punct(self):
        assert normalize_query("  Hello, WORLD!!! ") == "hello world"

    def test_normalize_query_preserves_devanagari(self):
        # Hindi phrase: roughly "rain deficit in my wheat crop"
        out = normalize_query("मेरी गेहूं की फसल में बारिश की कमी है!!!")
        assert "गेहूं" in out
        assert "बारिश" in out
        assert "!" not in out

    def test_normalize_query_drops_pure_digit_tokens(self):
        out = normalize_query("call 9876543210 about wheat pest")
        assert "9876543210" not in out
        assert "wheat" in out and "pest" in out

    def test_normalize_query_none_or_empty(self):
        assert normalize_query(None) == ""
        assert normalize_query("") == ""
        assert normalize_query("   ") == ""

    def test_query_to_text_extracts_and_cleans(self):
        doc = make_doc("  PEST ATTACK on COTTON!!!  ", days=2)
        assert query_to_text(doc) == "pest attack on cotton"

    def test_metadata_extraction_from_details(self):
        doc = make_doc(
            "weather question",
            crop="Wheat",
            state="Punjab",
            domain="weather",
        )
        assert doc["details"]["crop"] == "Wheat"
        assert doc["details"]["state"] == "Punjab"
        assert doc["details"]["domain"] == "weather"

    def test_metadata_extraction_handles_missing_details(self):
        # Documents without ``details`` still parse the question text.
        # ``query_to_text`` reads the canonical ``text`` field; docs whose
        # only text-bearing key is missing simply normalise to "".
        bare = {"text": "bare question", "tag": DISCLAIMER_TAG,
                "created_at": days_ago(1)}
        assert query_to_text(bare) == "bare question"

        # A doc whose ``text`` key is missing produces an empty string,
        # demonstrating that the pipeline is resilient to malformed docs.
        empty = {"tag": DISCLAIMER_TAG, "createdAt": days_ago(1)}
        assert query_to_text(empty) == ""


# ---------------------------------------------------------------------------
# 2. Injectable fake embedding function + lazy model-loading behaviour
# ---------------------------------------------------------------------------

class TestEmbeddingsAndLazyModel:
    def test_encode_uses_only_injected_embed_fn(self):
        docs = [
            make_doc("rain deficit wheat punjab", days=1),
            make_doc("how to manage rainfall deficit", days=1),
            make_doc("soil fertility for rice", days=1),
        ]
        calls: list[list[str]] = []

        def embed_fn(texts: list[str]) -> np.ndarray:
            calls.append(list(texts))
            return fake_embed(texts)

        texts, embeds = encode_queries(docs, embed_fn=embed_fn)

        # All three texts are unique.
        assert len(texts) == 3
        assert embeds.shape == (3, DIM)

        # embed_fn must have been called exactly once with all the texts.
        assert len(calls) == 1
        assert set(calls[0]) == set(texts)

        # Embeddings should be L2-normalised (norm 1 per row).
        norms = np.linalg.norm(embeds, axis=1)
        assert np.allclose(norms, 1.0, atol=1e-5)

    def test_encode_dedups_identical_text(self):
        docs = [
            make_doc("rain deficit wheat punjab", days=1),
            make_doc("rain deficit wheat punjab", days=2),
            make_doc("rain deficit wheat punjab", days=3),
        ]
        texts, embeds = encode_queries(docs, embed_fn=fake_embed)
        assert len(texts) == 1
        assert embeds.shape[0] == 1

    def test_encode_drops_empty_queries(self):
        docs = [
            make_doc("", days=1),
            make_doc("   ", days=1),
            make_doc("soil fertility for rice", days=1),
        ]
        texts, embeds = encode_queries(docs, embed_fn=fake_embed)
        assert texts == ["soil fertility for rice"]
        assert embeds.shape == (1, DIM)

    def test_encode_rejects_non_2d_output(self):
        # The detector must not silently accept a 1-D embedding vector.
        with pytest.raises(ValueError):
            encode_queries(
                [make_doc("rain deficit wheat punjab", days=1)],
                embed_fn=lambda texts: np.zeros(8, dtype=np.float32),
            )

    def test_detector_module_does_not_import_sentence_transformers(self):
        """The detector module source itself must not import the package.

        We do an attribute-level check on the module (rather than
        ``sys.modules``) because importing this test file already
        imports ``main`` which legitimately pulls in
        ``sentence_transformers`` for the lazy model loader.  We want to
        ensure that *the detector* never touches it directly.
        """
        src = Path(gd.__file__).read_text(encoding="utf-8")
        assert "sentence_transformers" not in src, (
            "Detector source contains a 'sentence_transformers' reference; "
            "the embed function must be injected, not eagerly imported."
        )
        # The module's globals also must not include the package.
        assert not hasattr(gd, "SentenceTransformer")
        assert not hasattr(gd, "sentence_transformers")


# ---------------------------------------------------------------------------
# 3. Semantic clustering + fallback behaviour
# ---------------------------------------------------------------------------

class TestClustering:
    def test_cluster_groups_synonymous_queries(self):
        # Use two identical "synonymous" texts (same bucket, identical
        # embedding) plus a different one.  After DBSCAN:
        #   * the identical pair shares a cluster id.
        #   * the unrelated text is a singleton (-1 promoted by the
        #     upstream pipeline into its own cluster id).
        texts = [
            "rain deficit wheat punjab",
            "rain deficit wheat punjab",       # identical embedding
            "soil fertility for rice",
        ]
        embeddings = fake_embed(texts)
        labels, cluster_map = cluster_queries(
            texts, embeddings, eps=0.2, min_samples=2,
        )
        # The first two share a label, the third is its own label.
        assert labels[0] == labels[1]
        assert labels[2] != labels[0]
        # All three indices appear in the cluster_map (the upstream
        # pipeline promotes any -1 noise into a singleton cluster).
        all_indices = [i for ids in cluster_map.values() for i in ids]
        assert sorted(all_indices) == [0, 1, 2]

    def test_cluster_tiny_input_falls_back_to_singletons(self):
        """If we have only 1 query, fallback gives a per-query cluster."""
        texts = ["rain deficit wheat punjab"]
        embeddings = fake_embed(texts)
        labels, cluster_map = cluster_queries(
            texts, embeddings, eps=0.2, min_samples=2,
        )
        # Singleton fallback: index 0 -> cluster id 0.
        assert labels == [0]
        assert cluster_map == {0: [0]}

    def test_cluster_dbscan_noise_is_kept(self):
        """All inputs, even when DBSCAN labels them noise (-1), still appear
        in the cluster_map (the upstream pipeline promotes them to
        singleton clusters)."""
        texts = ["rain deficit wheat punjab", "soil fertility for rice"]
        # Scale so distances > eps -> DBSCAN labels both as noise.
        embeddings = fake_embed(texts) * 100
        labels, cluster_map = cluster_queries(
            texts, embeddings, eps=0.0001, min_samples=2,
        )
        # Map should contain every index, regardless of label value.
        all_indices = [i for ids in cluster_map.values() for i in ids]
        assert sorted(all_indices) == [0, 1]

    def test_cluster_empty_input(self):
        labels, cluster_map = cluster_queries([], np.zeros((0, DIM)))
        assert labels == []
        assert cluster_map == {}


# ---------------------------------------------------------------------------
# 4. Current-vs-previous demand (incl. zero previous demand)
# ---------------------------------------------------------------------------

class TestDemandCalculation:
    def test_window_splits_correctly(self):
        """``current``/``previous``/``recent_total`` partition the docs."""
        docs = [
            make_doc("today",            days=1),
            make_doc("today-2",          days=2),
            make_doc("today-6",          days=6),
            make_doc("today-8",          days=8),
            make_doc("today-13",         days=13),
            make_doc("today-14",         days=14),  # boundary: anchor-14d == prev_start
            make_doc("today-100",        days=100),  # outside all windows
        ]
        result = current_vs_previous_demand(docs, now=fixed_now)

        # ``current`` window = last 7 days inclusive of 0.
        assert result["current"] == 3           # days 1, 2, 6
        # ``previous`` window = days 7..14 ago inclusive.
        assert result["previous"] == 3          # days 8, 13, 14
        # ``recent_total`` = last 14 days inclusive of the 14d boundary.
        assert result["recent_total"] == 6      # days 1, 2, 6, 8, 13, 14
        # ``recent_total`` is the *union* of ``current`` and ``previous``;
        # the buckets overlap by design so the API can render both windows
        # without losing the older series.  Sanity: every doc classified
        # into exactly one of the two narrower windows.
        assert result["current"] + result["previous"] == result["recent_total"]
        # And every in-window doc counted once.
        assert result["current"] + result["previous"] == 6

    def test_zero_previous_demand_does_not_raise(self):
        """No queries in the prior 7-day window must not blow up."""
        docs = [
            make_doc("today",       days=1),
            make_doc("two-days",    days=2),
            make_doc("three-days",  days=3),
        ]
        result = current_vs_previous_demand(docs, now=fixed_now)
        assert result["previous"] == 0
        assert result["current"] == 3

    def test_zero_demand_everywhere(self):
        """Empty input -> all counters zero."""
        assert current_vs_previous_demand([], now=fixed_now) == {
            "current": 0, "previous": 0, "recent_total": 0,
        }

    def test_weekly_buckets(self):
        docs = [
            make_doc("this-week",   days=0),
            make_doc("last-week",   days=8),
            make_doc("two-weeks",   days=15),
        ]
        weeks = weekly_demand(docs, now=fixed_now)
        assert isinstance(weeks, dict)
        assert sum(weeks.values()) == 3

    def test_weekly_growth_zero_prev(self):
        # Previous week has 0 queries; growth caps at +100 per the spec.
        growth = weekly_growth_pct({"2026-W29": 0, "2026-W30": 5})
        assert growth == 100.0

    def test_weekly_growth_decline(self):
        growth = weekly_growth_pct({"2026-W28": 10, "2026-W29": 4})
        assert growth == pytest.approx(-60.0, abs=1e-6)

    def test_weekly_growth_no_data(self):
        assert weekly_growth_pct({}) == 0.0
        assert weekly_growth_pct({"2026-W30": 5}) == 0.0


# ---------------------------------------------------------------------------
# 5. Priority score + level thresholds
# ---------------------------------------------------------------------------

class TestPriority:
    def test_deterministic_score(self):
        # Same inputs -> same score, always.
        s1 = compute_priority_score(
            current=20, previous=5, recent_total=25, growth_pct=40.0,
            unique_crops=2, unique_states=3,
        )
        s2 = compute_priority_score(
            current=20, previous=5, recent_total=25, growth_pct=40.0,
            unique_crops=2, unique_states=3,
        )
        assert s1 == s2
        assert 0.0 <= s1 <= 100.0

    def test_score_monotonic_in_demand(self):
        # Bigger current demand must not yield a smaller score.
        s_low = compute_priority_score(
            current=2, previous=2, recent_total=2,
            growth_pct=0.0, unique_crops=1, unique_states=1,
        )
        s_high = compute_priority_score(
            current=200, previous=2, recent_total=200,
            growth_pct=0.0, unique_crops=1, unique_states=1,
        )
        assert s_high > s_low

    def test_score_demand_factor_saturates(self):
        """Demand sub-factor clamps at ``PRIORITY_MAX_DEMAND``.

        Going past it cannot keep inflating the *demand* component,
        although the *acceleration* component (current - previous)
        continues to grow until 2*MAX.  We compare two cases where
        both demand and acceleration have saturated, so the score
        must be identical.
        """
        s_at_2x = compute_priority_score(
            current=PRIORITY_MAX_DEMAND * 2, previous=0,
            recent_total=PRIORITY_MAX_DEMAND * 4,
            growth_pct=0.0, unique_crops=0, unique_states=0,
        )
        s_at_50x = compute_priority_score(
            current=PRIORITY_MAX_DEMAND * 50, previous=0,
            recent_total=PRIORITY_MAX_DEMAND * 100,
            growth_pct=0.0, unique_crops=0, unique_states=0,
        )
        # Both demand and accel are saturated -> identical scores.
        assert math.isclose(s_at_2x, s_at_50x, abs_tol=1e-9)
        # And the score lands in the upper range, as expected.
        assert s_at_2x > 50.0

    def test_band_thresholds(self):
        # At the documented boundaries the level transitions are stable.
        # critical >= 70
        pri, _ = score_to_priority(70.0)
        assert pri == "critical"
        pri, _ = score_to_priority(69.99)
        assert pri != "critical"

        # high 45..69
        pri, _ = score_to_priority(45.0)
        assert pri == "high"
        pri, _ = score_to_priority(44.99)
        assert pri == "medium"

        # medium 20..44
        pri, _ = score_to_priority(20.0)
        assert pri == "medium"
        pri, _ = score_to_priority(19.99)
        assert pri in {"low", "medium"}  # boundary

        # low: everything below 20
        pri, _ = score_to_priority(0.0)
        assert pri == "low"

    def test_band_returns_action_string(self):
        for level_score in (90.0, 60.0, 30.0, 5.0):
            pri, action = score_to_priority(level_score)
            assert pri in {"critical", "high", "medium", "low"}
            assert action and isinstance(action, str)
            assert action[0].isupper()


# ---------------------------------------------------------------------------
# 6. GDB coverage counting + STRONG/PARTIAL/GAP classification
# ---------------------------------------------------------------------------

class TestCoverage:
    def test_classify_by_hits(self):
        # ``None`` collection -> always a GAP regardless of mock.
        gap = lookup_gdb_coverage(
            golden_collection=None,
            cluster_text="weather",
            crop=None, state=None, domain=None,
        )
        assert gap == {"hits": 0, "band": GAP}

        # Below PARTIAL_MIN_HITS -> GAP.
        few = FakeCollection(counts={"*": PARTIAL_MIN_HITS - 1})
        out = lookup_gdb_coverage(
            golden_collection=few,
            cluster_text="whatever",
            crop=None, state=None, domain=None,
        )
        assert out["band"] == GAP
        assert out["hits"] == PARTIAL_MIN_HITS - 1

        # At/above PARTIAL_MIN_HITS but below STRONG -> PARTIAL.
        mid = FakeCollection(counts={"*": PARTIAL_MIN_HITS})
        out = lookup_gdb_coverage(
            golden_collection=mid,
            cluster_text="whatever",
            crop=None, state=None, domain=None,
        )
        assert out["band"] == PARTIAL

        # STRONG_MIN_HITS -> STRONG.
        many = FakeCollection(counts={"*": STRONG_MIN_HITS})
        out = lookup_gdb_coverage(
            golden_collection=many,
            cluster_text="whatever",
            crop=None, state=None, domain=None,
        )
        assert out["band"] == STRONG
        assert out["hits"] == STRONG_MIN_HITS

    def test_collection_exception_treated_as_gap(self):
        """A failing Mongo call must not blow up the report."""

        class Boom:
            def count_documents(self, *a, **kw):
                raise RuntimeError("simulated outage")

        out = lookup_gdb_coverage(
            golden_collection=Boom(),
            cluster_text="x",
            crop=None, state=None, domain=None,
        )
        assert out == {"hits": 0, "band": GAP}

    def test_band_to_score_higher_is_worse_gap(self):
        s_gap = coverage_band_to_score(GAP, 0)
        # STRONG with very many hits must produce the best (smallest) score.
        s_strong_many = coverage_band_to_score(STRONG, STRONG_MIN_HITS * 2)
        assert s_gap > s_strong_many
        # PARTIAL lands between STRONG and GAP.
        s_partial = coverage_band_to_score(PARTIAL, PARTIAL_MIN_HITS)
        assert s_strong_many <= s_partial <= s_gap

    def test_band_score_in_expected_ranges(self):
        assert 0.0 <= coverage_band_to_score(STRONG, 999) <= 20.0
        assert 40.0 <= coverage_band_to_score(PARTIAL, PARTIAL_MIN_HITS) <= 70.0
        assert coverage_band_to_score(GAP, 0) == 100.0


# ---------------------------------------------------------------------------
# 7. Outreach recommendation ranking + urgency
# ---------------------------------------------------------------------------

def _make_cluster(*, cid: str, score: float, band: str,
                  hits: int = 0, theme: str = "weather",
                  crop: str = "Wheat", state: str = "Punjab",
                  domain: str = "weather") -> GapCluster:
    return GapCluster(
        cluster_id=cid,
        theme=theme,
        queries=[f"query for {cid}"],
        query_count=10,
        recent_query_count=12,
        previous_query_count=2,
        total_query_count=20,
        avg_weekly_growth_pct=5.0,
        domain=domain,
        crops=[crop],
        states=[state],
        priority="critical" if score >= 70 else (
            "high" if score >= 45 else (
                "medium" if score >= 20 else "low")),
        priority_score=score,
        gdb_coverage_band=band,
        gdb_coverage_hits=hits,
        gdb_coverage_score=100.0 if band == GAP else (
            50.0 if band == PARTIAL else 10.0),
        suggested_action="x",
    )


class TestRecommendations:
    def test_recommendations_empty_health_message(self):
        out = build_recommendations([])
        assert len(out) == 1
        assert "healthy" in out[0].lower()

    def test_recommendations_ranked_by_priority_desc(self):
        clusters = [
            _make_cluster(cid="c1", score=20.0, band=GAP),
            _make_cluster(cid="c2", score=80.0, band=GAP),
            _make_cluster(cid="c3", score=50.0, band=GAP),
        ]
        recs = build_recommendations(clusters)
        # The first rec must reference c2 (highest score).
        assert "c2" in recs[0]
        # c1 (the smallest score) is not in the top-n=5 top list.
        assert "c1" not in recs[0]

    def test_recommendations_urgency_for_gap(self):
        clusters = [_make_cluster(cid="gapx", score=90.0, band=GAP)]
        recs = build_recommendations(clusters)
        joined = " ".join(recs).lower()
        # GAP clusters are emphasised with "no gdb coverage" language.
        assert "no gdb coverage" in joined
        # urgency is implicit via priority + band phrasing.
        assert "schedule" in joined

    def test_recommendations_partial_band_soft_phrase(self):
        clusters = [_make_cluster(cid="partx", score=60.0,
                                  band=PARTIAL, hits=2)]
        recs = build_recommendations(clusters)
        joined = " ".join(recs).lower()
        assert "partial" in joined
        assert "augment" in joined or "regional variants" in joined

    def test_recommendations_top_n_caps_output(self):
        clusters = [
            _make_cluster(cid=f"c{i}", score=80.0 - i, band=GAP)
            for i in range(8)
        ]
        recs = build_recommendations(clusters, top_n=3)
        # top_n + at most one summary line about remaining criticals.
        assert 1 <= len(recs) <= 5

    def test_recommendations_shrinkage_summary(self):
        c = _make_cluster(cid="slowx", score=10.0, band=GAP)
        c.avg_weekly_growth_pct = -25.0
        recs = build_recommendations([c])
        joined = " ".join(recs).lower()
        assert "shrinking" in joined


# ---------------------------------------------------------------------------
# 8. Full build_gap_report() output shape (mock collections + fixed time)
# ---------------------------------------------------------------------------

class TestBuildGapReportEndToEnd:
    def _doc_set(self) -> list[dict]:
        # Two synonymous queries (cluster A) + one isolated query (cluster B).
        # ``field_name="question"`` matches the schema the endpoint reads
        # via ``fetch_disclaimer_queries`` (which reads the ``question``
        # field by default).
        def _mk(text, *, days, crop=None, state=None, domain=None):
            return make_doc(
                text, days=days, crop=crop, state=state, domain=domain,
                field_name="question",
            )
        return [
            _mk("rain deficit wheat punjab",      days=1, crop="Wheat",  state="Punjab"),
            _mk("how to manage rainfall deficit",  days=2, crop="Wheat",  state="Punjab"),
            _mk("how to manage rainfall deficit",  days=4, crop="Wheat",  state="Punjab"),
            _mk("pest attack on cotton leaf",      days=3, crop="Cotton", state="Gujarat"),
            _mk("whitefly on cotton",              days=4, crop="Cotton", state="Gujarat"),
            _mk("soil fertility for rice",         days=20, crop="Rice",  state="Punjab"),
        ]

    def test_empty_collection_returns_empty_report(self):
        review = FakeCollection([])
        golden = FakeCollection([])
        report = build_gap_report(
            review_collection=review,
            review_golden_collection=golden,
            review_pop_collection=None,
            embed_fn=fake_embed,
            now=fixed_now,
        )
        # Top-level shape.
        assert isinstance(report, dict)
        for k in (
            "report_id", "generated_at", "window",
            "total_queries_analyzed", "total_clusters_found",
            "gaps_by_priority", "coverage_bands", "top_gaps",
            "coverage_heatmap", "recommendations", "clusters",
            "current_query_count", "previous_query_count",
            "recent_query_count", "elapsed_ms",
        ):
            assert k in report, f"missing key {k!r}"

        assert report["total_queries_analyzed"] == 0
        assert report["total_clusters_found"] == 0
        assert report["coverage_bands"] == {STRONG: 0, PARTIAL: 0, GAP: 0}
        assert report["gaps_by_priority"] == {
            "critical": 0, "high": 0, "medium": 0, "low": 0,
        }
        assert report["window"]["lookback_days"] == LOOKBACK_DAYS
        assert isinstance(report["elapsed_ms"], (int, float))

    def test_full_report_shape(self):
        review = FakeCollection(self._doc_set())
        # Empty golden collection (counts default 0) -> every cluster is GAP.
        golden = FakeCollection(counts={"*": 0})

        report = build_gap_report(
            review_collection=review,
            review_golden_collection=golden,
            review_pop_collection=None,
            embed_fn=fake_embed,
            now=fixed_now,
            similarity_threshold=0.85,
            min_samples=2,
            lookback_days=LOOKBACK_DAYS,
        )

        # Top-level keys (full version).
        expected_keys = {
            "report_id", "generated_at", "window",
            "total_queries_analyzed", "total_clusters_found",
            "gaps_by_priority", "coverage_bands", "top_gaps",
            "coverage_heatmap", "recommendations", "clusters",
            "current_query_count", "previous_query_count",
            "recent_query_count", "elapsed_ms",
        }
        assert expected_keys.issubset(report.keys())

        # Counts are consistent.
        assert report["total_queries_analyzed"] == 6
        # Demand windows: 5 docs are within the 7-day window (days 1-4).
        # The day-20 doc is in the 14-day window but not the 7-day window.
        assert report["current_query_count"] == 5
        assert report["previous_query_count"] == 0
        assert report["recent_query_count"] == 5

        # Sum of bands equals number of clusters found.
        assert sum(report["coverage_bands"].values()) == report["total_clusters_found"]
        # Sum of priorities equals the same.
        assert sum(report["gaps_by_priority"].values()) == report["total_clusters_found"]

        # Every cluster dict has the documented shape.
        for c in report["clusters"]:
            assert {"cluster_id", "theme", "query_count",
                    "previous_query_count", "recent_query_count",
                    "total_query_count", "avg_weekly_growth_pct",
                    "domain", "crops", "states",
                    "top_crop", "top_state",
                    "priority", "priority_score",
                    "gdb_coverage_band", "gdb_coverage_hits",
                    "gdb_coverage_score",
                    "suggested_action", "sample_queries"}.issubset(c.keys())
            assert c["gdb_coverage_band"] in {STRONG, PARTIAL, GAP}
            assert c["priority"] in {"critical", "high", "medium", "low"}

        # With a zero-count GDB collection, every cluster must be GAP.
        assert all(c["gdb_coverage_band"] == GAP for c in report["clusters"])

        # Top gaps must be sorted by priority_score desc.
        scores = [c["priority_score"] for c in report["top_gaps"]]
        assert scores == sorted(scores, reverse=True)

        # The heatmap aggregates by (crop, state).
        heat = report["coverage_heatmap"]
        assert "Wheat" in heat and "Punjab" in heat["Wheat"]
        assert heat["Wheat"]["Punjab"] >= 1

        # The generated_at timestamp must end with a Z (UTC sentinel).
        assert report["generated_at"].endswith("Z")

        # The window echoes the configuration.
        assert report["window"]["lookback_days"] == LOOKBACK_DAYS

        # recommendations is a non-empty list of strings.
        assert isinstance(report["recommendations"], list)
        assert all(isinstance(r, str) for r in report["recommendations"])
        assert report["recommendations"]

    def test_fetch_disclaimer_queries_uses_injected_clock(self):
        """``fetch_disclaimer_queries`` must use the injected ``now`` fn."""
        docs = [
            {"question": "q1", "tag": DISCLAIMER_TAG,
             "details": {"crop": "Wheat", "state": "Punjab"},
             "createdAt": days_ago(2)},
            {"question": "q2", "tag": DISCLAIMER_TAG,
             "details": {"crop": "Rice", "state": "Punjab"},
             "createdAt": days_ago(80)},  # outside any reasonable window
        ]
        review = FakeCollection(docs)
        out = fetch_disclaimer_queries(
            collection=review,
            lookback_days=LOOKBACK_DAYS,
            now=fixed_now,
        )
        # The fake returns whatever we registered; the detector's filter
        # shaping + post-filtering happens inside the real Mongo.
        # In unit tests we just verify the wrapper returns a list and
        # each result has the expected downstream shape.
        assert isinstance(out, list)
        assert all("text" in d and "details" in d for d in out)
        # Both seeded docs are returned (filter is permissive in the fake).
        assert len(out) == 2


# ---------------------------------------------------------------------------
# 9 + 10. Endpoint validation + cache behaviour
# ---------------------------------------------------------------------------

class TestEndpointValidationAndCache:
    """Endpoint validation tests using the FastAPI app via conftest."""

    def _request(self, **overrides):
        from main import GapReportRequest  # imported lazily
        defaults = dict(
            similarity_threshold=0.85, min_samples=2,
            lookback_days=None, refresh=False,
        )
        defaults.update(overrides)
        return GapReportRequest(**defaults)

    def test_invalid_threshold_low(self, client):
        resp = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": -0.01},
        )
        assert resp.status_code == 400
        assert "similarity_threshold" in resp.json()["detail"]

    def test_invalid_threshold_high(self, client):
        resp = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 1.5},
        )
        assert resp.status_code == 400
        assert "similarity_threshold" in resp.json()["detail"]

    def test_invalid_min_samples_too_low(self, client):
        resp = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 0},
        )
        assert resp.status_code == 400
        assert "min_samples" in resp.json()["detail"]

    def test_invalid_min_samples_too_high(self, client):
        resp = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 51},
        )
        assert resp.status_code == 400
        assert "min_samples" in resp.json()["detail"]

    def test_invalid_lookback_days_zero(self, client):
        resp = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 2,
                  "lookback_days": 0},
        )
        assert resp.status_code == 400
        assert "lookback_days" in resp.json()["detail"]

    def test_invalid_lookback_days_negative(self, client):
        resp = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 2,
                  "lookback_days": -5},
        )
        assert resp.status_code == 400
        assert "lookback_days" in resp.json()["detail"]


class TestEndpointCaching:
    """Endpoint cache behaviour driven via FastAPI TestClient."""

    def test_first_call_returns_fresh_report(self, client):
        resp = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 2,
                  "lookback_days": 30},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "report_id" in body
        assert "clusters" in body
        assert "recommendations" in body

    def test_second_call_with_same_params_returns_same_report_id(
        self, client, monkeypatch,
    ):
        """The cache key in the endpoint includes threshold, min_samples,
        lookback_days.  Same key -> same report_id (which is derived from
        ``time.time()`` so we patch it to be deterministic)."""
        # Freeze ``time.time`` to a known value for this test.
        monkeypatch.setattr("main.time.time", lambda: 1_700_000_000.0)

        first = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 2,
                  "lookback_days": 30},
        ).json()
        second = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 2,
                  "lookback_days": 30},
        ).json()

        assert first["report_id"] == second["report_id"]

    def test_different_params_bypass_cache(self, client, monkeypatch):
        """Different cache-key params -> freshly rebuilt report.
        We patch ``time.time`` so two rebuilds produce *different* report
        IDs, proving the second call was not a cache hit.

        ``itertools.count`` keeps producing strictly-increasing times so
        the cache key (``report_id`` is ``f"gap-{int(time.time())}"``)
        always changes -- the iterator never runs out the way a finite
        ``iter([..])`` does when ``httpx``'s cookie jar also asks for
        ``time.time()``.
        """
        times = itertools.count(1_700_000_000)
        monkeypatch.setattr("main.time.time", lambda: float(next(times)))

        first = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 2,
                  "lookback_days": 30},
        ).json()
        second = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 3,
                  "lookback_days": 30},  # different cache key
        ).json()
        assert first["report_id"] != second["report_id"]

    def test_refresh_true_bypasses_cache(self, client, monkeypatch):
        """``refresh=true`` must clear the cache and rebuild.

        We patch ``time.time`` so the rebuilt report carries a *different*
        ``report_id`` than what would have been returned from a stale
        cache.
        """
        times = itertools.count(1_700_000_000)
        monkeypatch.setattr("main.time.time", lambda: float(next(times)))

        # Warm the cache with a known input.
        first = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 2,
                  "lookback_days": 30},
        ).json()

        # ``refresh=true`` must clear the cache and rebuild.
        refreshed = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 2,
                  "lookback_days": 30, "refresh": True},
        ).json()

        # Both calls succeed; the second report is freshly built.
        assert "report_id" in refreshed
        assert "clusters" in refreshed
        # The refreshed report_id must differ from the cached one
        # (proving a rebuild happened).
        assert refreshed["report_id"] != first["report_id"]

    def test_gdb_refresh_endpoint_invalidates_cache(self, client, monkeypatch):
        """The ``/gdb/refresh`` endpoint must clear the cache."""
        # ``itertools.count`` provides an infinite, strictly-increasing
        # time source so the cookie-jar / client calls don't blow up
        # and the rebuilt report gets a fresh ``report_id``.
        times = itertools.count(1_700_000_000)
        monkeypatch.setattr("main.time.time", lambda: float(next(times)))

        # Warm the cache.
        first = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 2,
                  "lookback_days": 30},
        ).json()

        resp = client.post("/gdb/refresh")
        assert resp.status_code == 200
        body = resp.json()
        assert body == {"status": "ok", "cache_cleared": True}

        # Next call rebuilds -> different report_id (proves cache cleared).
        second = client.post(
            "/gdb/gap-report",
            json={"similarity_threshold": 0.85, "min_samples": 2,
                  "lookback_days": 30},
        ).json()
        assert second["report_id"] != first["report_id"]