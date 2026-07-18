"""
Persisted test suite for tools/gdb-gap-detector/clustering.py.

Run with:
    cd tools/gdb-gap-detector
    pytest tests/test_clustering.py -v

Coverage
--------
Requested cases:
  - empty input
  - single cluster
  - tied priority_score rankings
  - zero-prior-period growth_rate edge case (no ZeroDivisionError)

Plus shape & behaviour sanity checks:
  - result element matches the `top_gaps` schema exactly
  - sample_queries is at most 3, contains raw `query` values
  - domains / states are sorted-distinct
  - first_seen <= last_seen
  - farmer_demand == size
  - priority_level / recommended_action are consistent
  - cluster_id is stable under input ordering (sorted sig-kws joined "|")
  - queries with no significant keywords collapse to "<uncategorized>"
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

# Make the package dir importable (matches tests/conftest.py's role).
sys.path.insert(
    0,
    str(Path(__file__).resolve().parent.parent),
)
import clustering as cl  # noqa: E402


# ---------------------------------------------------------------------------
# Fixed reference "now" so growth_rate windows are deterministic in tests.
# Pick a Saturday at 12:00 UTC for clear week-aligned arithmetic.
# ---------------------------------------------------------------------------
NOW = datetime(2026, 6, 13, 12, 0, tzinfo=timezone.utc)


def _row(
    query: str,
    *,
    state: str | None = "MH",
    domain: str | None = "pest",
    timestamp: datetime | None = None,
    query_normalized: str | None = None,
    **extra,
) -> dict:
    """Build a candidate row in the shape find_gap_candidates returns."""
    row = {
        "query": query,
        "query_normalized": query_normalized if query_normalized is not None else query.lower(),
        "query_hash": f"h-{abs(hash(query))}",
        "state": state,
        "domain": domain,
        "timestamp": timestamp if timestamp is not None else NOW - timedelta(days=30),
    }
    row.update(extra)
    return row


# ===========================================================================
# 1. Empty input
# ===========================================================================
def test_empty_input_returns_empty_list():
    assert cl.compute_top_gaps([], now=NOW) == []


def test_empty_input_via_iterator_also_empty():
    # Accept any iterable; defensive coverage.
    assert cl.compute_top_gaps(iter([]), now=NOW) == []


# ===========================================================================
# 2. Single cluster
# ===========================================================================
def test_single_cluster_with_identical_normalization_collapses():
    """Three queries with the same significant-keyword signature → 1 cluster.

    Identical sig-keyword SETS (not just overlap) collapse, because
    cluster_id is the sorted union of each row's sig-kws. Different
    trailing words → different sig-sets → different clusters. (That's
    by design — deterministic and reproducible.)
    """
    base = "aphids on tomato"
    rows = [
        _row(f"aphids on tomato {variant}",
             query_normalized=base,                 # force identical sig-kws
             timestamp=NOW - timedelta(days=i + 1))
        for i, variant in enumerate(["first", "second", "third"])
    ]
    out = cl.compute_top_gaps(rows, now=NOW)

    assert len(out) == 1
    c = out[0]
    assert c["size"] == 3
    assert c["farmer_demand"] == 3
    # "aphid" and "tomato" survive; the trailing-s strip on tokens
    # longer than 4 chars collapses "aphids" → "aphid" inside the helper.
    assert "aphid" in c["keywords"]
    assert "aphids" not in c["keywords"]
    assert "tomato" in c["keywords"]
    assert "on" not in c["keywords"]
    # sample_queries: up to 3 raw `query` values, in insertion order.
    assert len(c["sample_queries"]) == 3
    assert c["sample_queries"][0] == "aphids on tomato first"


def test_single_cluster_scores_and_levels_consistent():
    rows = [
        _row("aphids on tomato", state="MH", domain="pest",
             timestamp=NOW - timedelta(days=1)),
    ]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert len(out) == 1
    c = out[0]
    # score = size + 0.15*states + 0.1*growth
    # one row, one state, growth 0.0 (out of windows) -> score = 1 + 0.15 + 0 = 1.15
    assert c["priority_score"] == pytest.approx(1.15)
    assert c["priority_level"] == "LOW"
    assert c["farmer_demand"] == 1
    assert c["size"] == 1
    assert c["recommended_action"] == cl._RECOMMENDED_ACTION_BY_LEVEL["LOW"]


# ===========================================================================
# 3. Tied priority_score rankings
# ===========================================================================
def test_tied_priority_scores_use_size_then_id_tie_breakers():
    """Two clusters with identical priority_score → tie-break by cluster_id.

    Constructs two clusters with identical (size=2, states=1, growth=0.0)
    so priority_score is the same. Tie-break → cluster_id ascending
    (alphabetical) because sizes are equal.
    """
    base_a = "aphids on tomato"
    base_b = "rust on wheat"
    cluster_a = [
        _row(f"aphids on tomato a{i}", query_normalized=base_a,
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=30))
        for i in range(2)
    ]
    cluster_b = [
        _row(f"rust on wheat b{i}", query_normalized=base_b,
             state="PB", domain="disease",
             timestamp=NOW - timedelta(days=30))
        for i in range(2)
    ]
    out = cl.compute_top_gaps(cluster_a + cluster_b, now=NOW)

    assert len(out) == 2
    # Both clusters: size=2, states=1, growth=0.0 → same priority_score.
    assert out[0]["priority_score"] == out[1]["priority_score"]
    # Tie-break: size desc identical (=2), fall through to cluster_id asc.
    assert out[0]["cluster_id"] < out[1]["cluster_id"]
    # Aphids→aphid (plural fold) < Rust alphabetically → aphids wins.
    assert "aphid" in out[0]["keywords"]
    assert "rust" in out[1]["keywords"]  # not subject to the plural fold (len=4)


def test_higher_size_wins_over_lower_size_for_priority():
    """Bigger cluster sorts first because priority_score grows with size."""
    base_big = "aphids on tomato"
    base_small = "rust on wheat"
    rows = [
        _row("aphids on tomato 1",  query_normalized=base_big,
             state=None, domain=None, timestamp=NOW - timedelta(days=30)),
        _row("aphids on tomato 2",  query_normalized=base_big,
             state=None, domain=None, timestamp=NOW - timedelta(days=29)),
        _row("rust on wheat only",  query_normalized=base_small,
             state=None, domain=None, timestamp=NOW - timedelta(days=30)),
    ]
    out = cl.compute_top_gaps(rows, now=NOW)
    # Two clusters: aphids-tomato (size=2), rust-wheat (size=1).
    assert out[0]["size"] == 2
    assert out[1]["size"] == 1
    assert out[0]["priority_score"] > out[1]["priority_score"]


# ===========================================================================
# 4. Zero-prior-period growth_rate edge case (no ZeroDivisionError)
# ===========================================================================
def test_growth_rate_zero_prior_returns_zero_no_division_error():
    """All cluster members are in the last 7 days; none in the prior 7.
    growth_rate must be 0.0, NOT raise ZeroDivisionError.
    """
    base = "aphids on tomato"
    rows = [
        _row("aphids on tomato 1", query_normalized=base,
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=1)),
        _row("aphids on tomato 2", query_normalized=base,
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=2)),
        _row("aphids on tomato 3", query_normalized=base,
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=3)),
    ]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert len(out) == 1
    assert out[0]["growth_rate"] == 0.0
    # size=3, states=1, growth=0.0 → 3 + 0.15 + 0.0 = 3.15
    assert out[0]["priority_score"] == pytest.approx(3.15)


def test_growth_rate_positive_when_recent_exceeds_prior():
    base = "aphids on tomato"
    rows = [
        _row("aphids on tomato 1", query_normalized=base,
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=1)),   # recent
        _row("aphids on tomato 2", query_normalized=base,
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=2)),   # recent
        _row("aphids on tomato 3", query_normalized=base,
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=10)),  # prior
    ]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert len(out) == 1
    # recent=2, prior=1 → (2-1)/1 = 1.0
    assert out[0]["growth_rate"] == pytest.approx(1.0)
    # size=3, states=1, growth=1.0 → 3 + 0.15 + 0.1 = 3.25
    assert out[0]["priority_score"] == pytest.approx(3.25)


def test_growth_rate_zero_when_both_recent_and_prior_empty():
    rows = [_row("aphids on tomato", state="MH", domain="pest",
                 timestamp=NOW - timedelta(days=100))]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert out[0]["growth_rate"] == 0.0


def test_growth_rate_handles_naive_timestamps():
    """find_gap_candidates may yield naive datetimes; clustering must
    still produce a defined growth_rate (not crash on tz compare)."""
    naive_now = datetime(2026, 6, 13, 12, 0)  # no tzinfo
    rows = [
        {"query": "aphids on tomato",
         "query_normalized": "aphids on tomato",
         "query_hash": "h1",
         "state": "MH", "domain": "pest",
         "timestamp": naive_now - timedelta(days=1)},
    ]
    out = cl.compute_top_gaps(rows, now=naive_now)
    assert len(out) == 1
    assert out[0]["growth_rate"] == 0.0


# ===========================================================================
# Shape & behaviour sanity checks
# ===========================================================================
EXPECTED_KEYS = {
    "cluster_id", "cluster_name", "size", "keywords", "sample_queries",
    "domains", "states", "growth_rate", "priority_score",
    "first_seen", "last_seen", "farmer_demand",
    "recommended_action", "priority_level",
}


def test_result_element_matches_top_gaps_schema():
    rows = [_row("aphids on tomato", state="MH", domain="pest",
                 timestamp=NOW - timedelta(days=1))]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert set(out[0].keys()) == EXPECTED_KEYS


def test_farmer_demand_equals_size():
    rows = [_row(f"aphids on tomato {i}", state="MH", domain="pest",
                 timestamp=NOW - timedelta(days=i + 1))
            for i in range(5)]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert out[0]["farmer_demand"] == out[0]["size"] == 5


def test_sample_queries_capped_at_three():
    rows = [_row(f"aphids on tomato variant {i}", state="MH", domain="pest",
                 timestamp=NOW - timedelta(days=i + 1))
            for i in range(10)]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert len(out[0]["sample_queries"]) == 3


def test_sample_queries_are_raw_query_values():
    """sample_queries are the raw `query` strings, NOT the normalized form.

    Both rows share the same normalized text (and therefore the same
    sig-kw set + cluster), but their raw `query` values differ in case
    and content.
    """
    rows = [
        _row("APhidS on TOMATO",
             query_normalized="aphids on tomato",
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=1)),
        _row("Aphids on tomato plant",
             query_normalized="aphids on tomato",
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=2)),
    ]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert len(out) == 1
    # sample_queries are the raw `query` strings, NOT normalized.
    assert "APhidS on TOMATO" in out[0]["sample_queries"]
    assert "Aphids on tomato plant" in out[0]["sample_queries"]


def test_domains_and_states_are_sorted_distinct():
    base = "aphids on tomato"
    rows = [
        _row("aphids on tomato 1", query_normalized=base,
             state="UP", domain="pest",
             timestamp=NOW - timedelta(days=1)),
        _row("aphids on tomato 2", query_normalized=base,
             state="MH", domain="disease",
             timestamp=NOW - timedelta(days=2)),
        _row("aphids on tomato 3", query_normalized=base,
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=3)),
        _row("aphids on tomato 4", query_normalized=base,
             state="MH", domain=None,
             timestamp=NOW - timedelta(days=4)),
    ]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert out[0]["states"] == ["MH", "UP"]
    assert out[0]["domains"] == ["disease", "pest"]   # None dropped


def test_first_seen_before_last_seen():
    rows = [
        _row("aphids on tomato",       state="MH", domain="pest",
             timestamp=NOW - timedelta(days=5)),
        _row("aphids on tomato leaves", state="MH", domain="pest",
             timestamp=NOW - timedelta(days=1)),
        _row("aphids on tomato stem",   state="MH", domain="pest",
             timestamp=NOW - timedelta(days=10)),
    ]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert out[0]["first_seen"] <= out[0]["last_seen"]


def test_priority_level_thresholds():
    """Construct inputs that land exactly on the boundary scores."""
    # HIGH threshold = 8.0. Build a cluster with size=8, 0 states, growth=0 → 8.0
    rows_high = [
        _row(f"aphids on tomato variant {i}", state=None, domain=None,
             timestamp=NOW - timedelta(days=30))
        for i in range(8)
    ]
    out = cl.compute_top_gaps(rows_high, now=NOW)
    assert out[0]["priority_level"] == "HIGH"

    # MEDIUM threshold = 5.0. size=5, states=0, growth=0 → 5.0
    rows_med = [
        _row(f"aphids on tomato variant {i}", state=None, domain=None,
             timestamp=NOW - timedelta(days=30))
        for i in range(5)
    ]
    out = cl.compute_top_gaps(rows_med, now=NOW)
    assert out[0]["priority_level"] == "MEDIUM"

    # LOW: below 5.0
    rows_low = [
        _row(f"aphids on tomato variant {i}", state=None, domain=None,
             timestamp=NOW - timedelta(days=30))
        for i in range(2)
    ]
    out = cl.compute_top_gaps(rows_low, now=NOW)
    assert out[0]["priority_level"] == "LOW"


def test_recommended_action_matches_level():
    rows = [_row("aphids on tomato", state="MH", domain="pest",
                 timestamp=NOW - timedelta(days=1))]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert out[0]["recommended_action"] == cl._RECOMMENDED_ACTION_BY_LEVEL[
        out[0]["priority_level"]
    ]


def test_cluster_id_independent_of_input_order():
    rows_a = [
        _row("aphids on tomato",       state="MH", domain="pest",
             timestamp=NOW - timedelta(days=1)),
        _row("on aphids tomato leaves", state="MH", domain="pest",
             timestamp=NOW - timedelta(days=2)),
    ]
    rows_b = list(reversed(rows_a))
    out_a = cl.compute_top_gaps(rows_a, now=NOW)
    out_b = cl.compute_top_gaps(rows_b, now=NOW)
    assert out_a[0]["cluster_id"] == out_b[0]["cluster_id"]


def test_no_significant_keywords_collapses_to_uncategorized():
    """Query 'what is this' filtered to empty sig-set → uncategorized bucket."""
    rows = [
        _row("what is this",  query_normalized="what is this",
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=1)),
        _row("what is that",  query_normalized="what is that",
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=2)),
    ]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert len(out) == 1
    assert out[0]["cluster_id"] == "<uncategorized>"
    assert out[0]["cluster_name"] == "uncategorized"


def test_top_n_limit_caps_results():
    """More clusters than `limit` → truncated to limit, highest priority kept."""
    # Generate ~25 distinct single-row clusters; each has size=1, score ~1.15.
    rows = []
    base = [
        "aphids", "rust", "borer", "blight", "wilt", "mildew",
        "rot", "spot", "mite", "weevil", "caterpillar", "thrips",
        "leafhopper", "whitefly", "stem", "root", "fruit", "flower",
        "seedling", "soil", "irrigation", "fertilizer", "compost",
        "weather", "monsoon",
    ]
    for i, kw in enumerate(base):
        rows.append(_row(f"{kw} on something {i}",
                         state=None, domain=None,
                         timestamp=NOW - timedelta(days=30)))
    out_full = cl.compute_top_gaps(rows, now=NOW, limit=100)
    out_capped = cl.compute_top_gaps(rows, now=NOW, limit=10)
    assert len(out_full) > 10
    assert len(out_capped) == 10


def test_stopwords_excluded_from_keywords():
    """Tokenization + stopword filtering must drop common words."""
    rows = [
        _row("what is the best fertilizer for wheat",
             state="MH", domain="fertilizer",
             timestamp=NOW - timedelta(days=1)),
    ]
    out = cl.compute_top_gaps(rows, now=NOW)
    kws = set(out[0]["keywords"])
    assert "best" in kws
    assert "fertilizer" in kws
    assert "wheat" in kws
    for w in ("what", "is", "the", "for", "on", "in"):  # stopwords
        assert w not in kws


def test_plural_fold_collapses_singular_and_plural_forms():
    """Singular and plural forms of the same word land in the same cluster.

    Two queries that differ ONLY in whether the pest noun is singular
    or plural collapse to a single cluster, thanks to the trailing-`s`
    strip on tokens longer than 4 chars. This is a precision
    improvement, not a general lemmatizer — see the "Known limitations"
    section of README.md. Short words (length ≤ 4) ending in `s` are
    intentionally NOT stripped.
    """
    rows = [
        _row("aphids on tomato",     # plural
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=1)),
        _row("aphid on tomato",      # singular, otherwise identical
             state="MH", domain="pest",
             timestamp=NOW - timedelta(days=2)),
    ]
    out = cl.compute_top_gaps(rows, now=NOW)
    assert len(out) == 1
    kws = set(out[0]["keywords"])
    # Both rows tokenize+fold to {"aphid", "tomato"}; the trailing-s
    # strip normalizes "aphids" → "aphid".
    assert "aphid" in kws
    assert "aphids" not in kws
    assert "tomato" in kws


def test_plural_fold_does_not_strip_short_words():
    """Length-4 (or shorter) words ending in `s` pass through unchanged
    so "this", "loss", "us" etc. aren't mangled.
    """
    # "loss" is length-4 and ends in 's' but is NOT a plural.
    sig = cl._significant_keywords("loss in the field")
    assert "loss" in sig
    assert "lo" not in sig
    # "this" is length-4 and a stopword — handled by stopword filter first.
    sig2 = cl._significant_keywords("this is a test")
    # "this" is a stopword so dropped; "test" survives.
    assert "this" not in sig2
    assert "test" in sig2
