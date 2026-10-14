"""
Persisted test suite for tools/gdb-gap-detector/generate_report.py.

Run with:
    cd tools/gdb-gap-detector
    pytest tests/test_generate_report.py -v

Coverage
--------
Spec-mandated cases:
  - coverage_score formula (gdb / (gdb + disclaimer) * 100, rounded to 1 dp)
  - status rule ("gap" iff disclaimer_count > 0, else "good")
  - top-10 outreach sort (by disclaimer_count descending)

Plus defensive cases:
  - full report assembly shape and required keys
  - heatmap row construction (per-source counts)
  - domains_with_gaps / states_with_gaps sum, sort, and zero-filter
  - markdown rendering contains the headline numbers
  - --write-to-db insert-only safety (never updates / replaces / deletes)
  - --write-to-db default OFF (no Mongo writes without the flag)
  - generated_at is tz-aware UTC
  - start_date / end_date arithmetic with period_days
  - clustering is invoked with the candidate slice
"""

from __future__ import annotations

import datetime as dt
import os
import re
import subprocess
import sys
from pathlib import Path

import mongomock
import pytest

# Same sys.path trick as tests/conftest.py (runs alongside it under pytest).
sys.path.insert(
    0, str(Path(__file__).resolve().parent.parent),
)

import clustering as cl  # noqa: E402
import find_gap_candidates as fgc  # noqa: E402
import generate_report as gr  # noqa: E402


NOW = dt.datetime(2026, 6, 13, 12, 0, tzinfo=dt.timezone.utc)


def _gdb(domain, state):
    return {"_id": f"g-{domain}-{state}", "domain": domain, "state": state}


def _disc(query, domain, state, *, ts=None, qhash=None):
    return {
        "query": query,
        "query_hash": qhash or f"h-{abs(hash(query))}",
        "query_normalized": query.lower(),
        "state": state,
        "domain": domain,
        "timestamp": ts if ts is not None else NOW - dt.timedelta(days=1),
    }


# ===========================================================================
# coverage_score formula
# ===========================================================================
def test_coverage_score_formula_handcrafted():
    """Manual values to lock the formula in place:
    gdb=8, disclaimers=2 → 8/(8+2)*100 = 80.0.
    """
    rows = gr.build_heatmap(
        gdb_entries=[_gdb("pest", "MH")] * 8,
        disclaimers=[_disc(f"q{i}", "pest", "MH") for i in range(2)],
    )
    r = next(r for r in rows if r["domain"] == "pest" and r["state"] == "MH")
    assert r["gdb_count"] == 8
    assert r["disclaimer_count"] == 2
    assert r["coverage_score"] == pytest.approx(80.0)
    assert r["status"] == "gap"


def test_coverage_score_rounded_to_one_decimal():
    """gdb=1, disclaimers=2 → 1/3 * 100 = 33.333... → 33.3."""
    rows = gr.build_heatmap(
        gdb_entries=[_gdb("pest", "MH")],
        disclaimers=[_disc(f"q{i}", "pest", "MH") for i in range(2)],
    )
    r = next(r for r in rows if r["domain"] == "pest" and r["state"] == "MH")
    assert r["coverage_score"] == 33.3


def test_coverage_score_zero_when_no_gdb_but_some_disclaimers():
    rows = gr.build_heatmap(
        gdb_entries=[],
        disclaimers=[_disc("q", "pest", "MH")],
    )
    r = next(r for r in rows if r["domain"] == "pest" and r["state"] == "MH")
    assert r["gdb_count"] == 0
    assert r["disclaimer_count"] == 1
    assert r["coverage_score"] == 0.0
    assert r["status"] == "gap"


def test_coverage_score_100_when_only_gdb_no_disclaimers():
    rows = gr.build_heatmap(
        gdb_entries=[_gdb("pest", "MH")],
        disclaimers=[],
    )
    r = next(r for r in rows if r["domain"] == "pest" and r["state"] == "MH")
    assert r["gdb_count"] == 1
    assert r["disclaimer_count"] == 0
    assert r["coverage_score"] == 100.0
    assert r["status"] == "good"


# ===========================================================================
# status rule
# ===========================================================================
def test_status_gap_when_any_disclaimer():
    rows = gr.build_heatmap(
        gdb_entries=[],
        disclaimers=[_disc("q", "pest", "MH")],
    )
    r = next(r for r in rows if r["domain"] == "pest" and r["state"] == "MH")
    assert r["status"] == "gap"


def test_status_good_when_zero_disclaimers():
    """'good' even when gdb_count is zero (no demand → no gap)."""
    rows = gr.build_heatmap(
        gdb_entries=[],
        disclaimers=[],
    )
    # No rows at all in this case — empty union.
    assert rows == []


def test_status_good_when_gdb_present_but_no_disclaimers():
    rows = gr.build_heatmap(
        gdb_entries=[_gdb("pest", "MH")],
        disclaimers=[],
    )
    r = next(r for r in rows if r["domain"] == "pest" and r["state"] == "MH")
    assert r["status"] == "good"


def test_build_heatmap_handles_null_state_and_domain_without_crashing():
    """Regression: previously build_heatmap() crashed with
    ``TypeError: '<' not supported between instances of 'str' and
    'NoneType'`` when documents had ``state`` or ``domain`` as None,
    because the (domain, state) bucket set was heterogeneous.

    Fix: missing/null domain/state are normalized to the literal string
    "None" via ``HEATMAP_MISSING`` in ``_bucket_key``, so the bucket set
    is always ``tuple[str, str]`` and is sortable.

    This test exercises:
      * a gdb entry with state=None
      * a disclaimer with domain=None
      * a disclaimer with both domain and state missing
      * a regular disclaimer so we can prove "None" coexists with real
        bucket rows without disturbing them
    and asserts the call completes without raising, that a "None" row
    exists with the expected counts, and that the regular row is also
    present and correctly bucketed.
    """
    gdb_entries = [
        # Regular row
        {"_id": "g1", "domain": "pest", "state": "MH"},
        # state=None on a gdb entry — used to crash on `sorted(all_pairs)`.
        {"_id": "g2", "domain": "pest", "state": None},
    ]
    disclaimers = [
        # Regular row
        _disc("regular q", "pest", "MH"),
        # domain=None on a disclaimer — used to be silently dropped;
        # now bucketed into ("None", "MH").
        _disc("missing-domain q", None, "MH"),
        # Both missing — bucketed into ("None", "None").
        _disc("fully-missing q", None, None),
    ]

    # The call must NOT raise.
    rows = gr.build_heatmap(gdb_entries=gdb_entries, disclaimers=disclaimers)

    # Every row's domain/state must be a string (homogeneous bucket space).
    for r in rows:
        assert isinstance(r["domain"], str), f"non-string domain: {r!r}"
        assert isinstance(r["state"],  str), f"non-string state:  {r!r}"

    # The "None" rows must exist with the right counts.
    none_state_row = next(
        (r for r in rows if r["domain"] == "pest" and r["state"] == "None"),
        None,
    )
    assert none_state_row is not None, (
        "expected a (pest, None) row from the gdb entry with state=None"
    )
    assert none_state_row["gdb_count"] == 1
    assert none_state_row["disclaimer_count"] == 0
    assert none_state_row["status"] == "good"

    none_domain_row = next(
        (r for r in rows if r["domain"] == "None" and r["state"] == "MH"),
        None,
    )
    assert none_domain_row is not None, (
        "expected a (None, MH) row from the disclaimer with domain=None"
    )
    assert none_domain_row["gdb_count"] == 0
    assert none_domain_row["disclaimer_count"] == 1
    assert none_domain_row["status"] == "gap"

    fully_none_row = next(
        (r for r in rows if r["domain"] == "None" and r["state"] == "None"),
        None,
    )
    assert fully_none_row is not None, (
        "expected a (None, None) row from the fully-missing disclaimer"
    )
    assert fully_none_row["gdb_count"] == 0
    assert fully_none_row["disclaimer_count"] == 1
    assert fully_none_row["status"] == "gap"

    # The regular row must still be present and unaffected by the new rows.
    regular_row = next(
        (r for r in rows if r["domain"] == "pest" and r["state"] == "MH"),
        None,
    )
    assert regular_row is not None
    assert regular_row["gdb_count"] == 1
    assert regular_row["disclaimer_count"] == 1
    assert regular_row["status"] == "gap"


def test_coverage_stats_aggregate_counts_match_heatmap():
    """covered = good count, gaps = gap count, partial = 0."""
    heatmap = gr.build_heatmap(
        gdb_entries=[_gdb("pest", "MH"), _gdb("rust", "PB")],
        disclaimers=[
            _disc("q1", "pest", "MH"),
            _disc("q2", "rust", "PB"),
            _disc("q3", "wilt", "UP"),  # (wilt, UP) has 0 gdb, 1 disclaimer → gap
        ],
    )
    stats = gr.coverage_stats(heatmap)
    assert stats["total_combinations"] == 3
    assert stats["covered"] == 0      # every row has a disclaimer
    assert stats["gaps"] == 3
    assert stats["partial"] == 0


# ===========================================================================
# domains_with_gaps / states_with_gaps
# ===========================================================================
def test_domains_with_gaps_sorted_desc_and_zero_filtered():
    disclaimers = [
        _disc("q", "pest",   "MH", ts=NOW - dt.timedelta(days=1)),
        _disc("q", "pest",   "MH", ts=NOW - dt.timedelta(days=2)),
        _disc("q", "pest",   "MH", ts=NOW - dt.timedelta(days=3)),
        _disc("q", "rust",   "PB", ts=NOW - dt.timedelta(days=1)),
        _disc("q", "wilt",   "UP", ts=NOW - dt.timedelta(days=1)),
        _disc("q", None,     "MH", ts=NOW - dt.timedelta(days=1)),  # no domain → ignored
    ]
    out = gr.domains_with_gaps(disclaimers)
    assert out == [
        {"domain": "pest", "gap_count": 3},
        {"domain": "rust", "gap_count": 1},
        {"domain": "wilt", "gap_count": 1},
    ]


def test_states_with_gaps_sorted_desc_and_zero_filtered():
    disclaimers = [
        _disc("q", "pest", "MH"),
        _disc("q", "pest", "MH"),
        _disc("q", "pest", "PB"),
        _disc("q", "pest", "UP"),
        _disc("q", "pest", None),  # no state → ignored
    ]
    out = gr.states_with_gaps(disclaimers)
    assert out == [
        {"state": "MH", "gap_count": 2},
        {"state": "PB", "gap_count": 1},
        {"state": "UP", "gap_count": 1},
    ]


# ===========================================================================
# Top-10 outreach sort
# ===========================================================================
def test_outreach_top10_sorted_by_disclaimer_count_desc():
    """11 candidate heatmap rows; only the top 10 by disclaimer_count
    should be returned. They must be sorted by count desc (with stable
    secondary tie-break).
    """
    # 11 distinct (domain, state) pairs with descending disclaimer counts.
    heatmap = [
        {"domain": f"d{i}", "state": f"S{i}",
         "gdb_count": 0, "disclaimer_count": c, "coverage_score": 0.0,
         "status": "gap"}
        for i, c in enumerate([20, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8])
    ]
    out = gr.outreach_recommendations(heatmap)
    assert len(out) == 10
    counts = [o["gap_questions"] for o in out]
    assert counts == sorted(counts, reverse=True)
    assert 8 not in counts        # the 11th row was trimmed off
    assert 20 == counts[0]


def test_outreach_priority_uses_median_cutoff():
    """Top-10 priority is HIGH iff disclaimer_count >= median of those 10.

    Counts [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]: median = (6 + 5)/2 = 5.5.
    So HIGH means count >= 5.5 → counts ≥ 6 are HIGH (10..6), counts ≤ 5
    are MEDIUM (5..1).
    """
    heatmap = [
        {"domain": f"d{i}", "state": f"S{i}",
         "gdb_count": 0, "disclaimer_count": c, "coverage_score": 0.0,
         "status": "gap"}
        for i, c in enumerate([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    ]
    out = gr.outreach_recommendations(heatmap)
    high = [o for o in out if o["priority"] == "HIGH"]
    medium = [o for o in out if o["priority"] == "MEDIUM"]
    high_counts = sorted(o["gap_questions"] for o in high)
    medium_counts = sorted(o["gap_questions"] for o in medium)
    assert high_counts == [6, 7, 8, 9, 10]
    assert medium_counts == [1, 2, 3, 4, 5]


def test_outreach_priority_at_exact_median_is_high():
    """Tied-at-median: a count equal to the median is flagged HIGH (>= rule)."""
    # Counts [5, 5, 5, 5, 5, 5, 5, 5, 5, 5] → median = 5 → all HIGH.
    heatmap = [
        {"domain": f"d{i}", "state": f"S{i}",
         "gdb_count": 0, "disclaimer_count": 5, "coverage_score": 0.0,
         "status": "gap"}
        for i in range(10)
    ]
    out = gr.outreach_recommendations(heatmap)
    assert all(o["priority"] == "HIGH" for o in out)


def test_outreach_recommendation_uses_state_and_domain():
    heatmap = [
        {"domain": "pest", "state": "MH",
         "gdb_count": 0, "disclaimer_count": 100, "coverage_score": 0.0,
         "status": "gap"},
    ]
    out = gr.outreach_recommendations(heatmap)
    assert len(out) == 1
    assert "MH" in out[0]["recommendation"]
    assert "pest" in out[0]["recommendation"]


def test_outreach_excludes_rows_with_missing_state_even_when_gap_count_high():
    """Rows where state == HEATMAP_MISSING (``"None"``) must not appear
    in ``outreach_recommendations()``, even when their disclaimer_count
    would otherwise put them in the top-N.

    Field-visit outreach needs a real, named state — a
    "Coordinate with None's agri department" target is not
    actionable. The same rows ARE still counted in
    ``coverage_stats`` and ``domains_with_gaps`` for completeness.
    """
    # 11 rows: 10 with real states, 1 with state="None" but the
    # HIGHEST disclaimer count of all. Without the filter, the None
    # row would dominate the top-10.
    heatmap = [
        {"domain": f"d{i}", "state": f"S{i}",
         "gdb_count": 0, "disclaimer_count": c, "coverage_score": 0.0,
         "status": "gap"}
        for i, c in enumerate([5, 4, 3, 3, 2, 2, 2, 1, 1, 1])   # 10 real rows
    ] + [
        # The would-be top row, with the highest disclaimer_count but
        # a missing state. Must be excluded.
        {"domain": "pest", "state": gr.HEATMAP_MISSING,
         "gdb_count": 0, "disclaimer_count": 100, "coverage_score": 0.0,
         "status": "gap"},
    ]
    out = gr.outreach_recommendations(heatmap)

    # Must not include the None-state row.
    states_in_out = {o["target_state"] for o in out}
    assert gr.HEATMAP_MISSING not in states_in_out, (
        f"None-state row leaked into outreach_recommendations: {out!r}"
    )

    # Must not include any row whose recommendation text mentions
    # the HEATMAP_MISSING sentinel — belt-and-suspenders check against
    # a regression where target_state leaks into the recommendation
    # template via the "unspecified" fallback path.
    for o in out:
        assert gr.HEATMAP_MISSING not in o["recommendation"], (
            f"None leaked into recommendation text: {o!r}"
        )

    # Length is bounded by top_n=10 and by the count of real-state rows.
    assert len(out) == 10
    assert all(o["target_state"] != gr.HEATMAP_MISSING for o in out)


def test_outreach_excludes_missing_state_but_coverage_stats_keeps_it():
    """The missing-state filter is scoped to outreach only.

    ``build_heatmap`` / ``coverage_stats`` MUST still count the
    missing-state row as a gap (so the coverage picture stays
    complete). Only ``outreach_recommendations`` drops it.
    """
    gdb_entries = [
        {"_id": "g1", "domain": "pest", "state": "MH"},
    ]
    disclaimers = [
        # Real state — feeds outreach.
        {"domain": "pest", "state": "MH",
         "query": "real q", "query_hash": "h1",
         "query_normalized": "real q",
         "timestamp": NOW},
        # Missing state — counted in coverage_stats, but excluded from
        # outreach_recommendations.
        {"domain": "pest", "state": None,
         "query": "missing q", "query_hash": "h2",
         "query_normalized": "missing q",
         "timestamp": NOW},
    ]
    heatmap = gr.build_heatmap(gdb_entries=gdb_entries, disclaimers=disclaimers)

    # coverage_stats: both rows still present as gaps (heatmap is
    # built without the outreach filter).
    stats = gr.coverage_stats(heatmap)
    assert stats["gaps"] == 2

    # domains_with_gaps: still counts pest=2.
    dom_gaps = gr.domains_with_gaps(disclaimers)
    assert dom_gaps == [{"domain": "pest", "gap_count": 2}]

    # outreach_recommendations: only the real-state row.
    out = gr.outreach_recommendations(heatmap)
    assert len(out) == 1
    assert out[0]["target_state"] == "MH"
    assert out[0]["focus_domain"] == "pest"


def test_outreach_top_n_parameter_respected():
    """Explicit top_n override is honored."""
    heatmap = [
        {"domain": f"d{i}", "state": f"S{i}",
         "gdb_count": 0, "disclaimer_count": 10 - i, "coverage_score": 0.0,
         "status": "gap"}
        for i in range(15)
    ]
    assert len(gr.outreach_recommendations(heatmap, top_n=3)) == 3
    assert len(gr.outreach_recommendations(heatmap, top_n=20)) == 15


# ===========================================================================
# Full report assembly
# ===========================================================================
REQUIRED_TOP_KEYS = {
    "report_type", "period_days", "start_date", "end_date", "generated_at",
    "total_disclaimers", "unique_queries", "clusters_found",
    "top_gaps", "coverage_stats", "outreach_recommendations",
    "domains_with_gaps", "states_with_gaps",
}


def test_build_report_required_top_level_keys():
    report = gr.build_report(
        period_days=30,
        gdb_entries=[_gdb("pest", "MH")],
        disclaimers=[],
        candidates=[],
        now=NOW,
    )
    assert REQUIRED_TOP_KEYS.issubset(report.keys())
    assert report["report_type"] == gr.REPORT_TYPE
    assert report["period_days"] == 30
    assert report["end_date"] == NOW
    assert report["start_date"] == NOW - dt.timedelta(days=30)
    assert report["generated_at"] == NOW


def test_build_report_generated_at_is_tz_aware_utc():
    report = gr.build_report(
        period_days=7, gdb_entries=[], disclaimers=[], candidates=[],
        now=dt.datetime.now(dt.timezone.utc),
    )
    assert report["generated_at"].tzinfo is not None


def test_build_report_clusters_found_equals_top_gaps_length():
    """If clustering produces 3 clusters, clusters_found should be 3."""
    # 3 candidates with different sig-kw signatures → 3 clusters.
    disc = [
        _disc("aphids on tomato", "pest", "MH", qhash="h1"),
        _disc("rust on wheat",    "rust", "PB", qhash="h2"),
        _disc("borers in brinjal", "pest", "UP", qhash="h3"),
    ]
    report = gr.build_report(
        period_days=7, gdb_entries=[], disclaimers=disc, candidates=disc,
        now=NOW,
    )
    assert report["clusters_found"] == len(report["top_gaps"]) == 3


# ===========================================================================
# Markdown rendering
# ===========================================================================
def test_render_markdown_contains_headline_numbers(tmp_path):
    report = gr.build_report(
        period_days=30,
        gdb_entries=[_gdb("pest", "MH"), _gdb("rust", "PB")],
        disclaimers=[
            _disc("aphids on tomato", "pest", "MH", qhash="h1"),
            _disc("aphids on tomato", "pest", "MH", qhash="h2"),
        ],
        candidates=[
            _disc("aphids on tomato", "pest", "MH", qhash="h1"),
            _disc("aphids on tomato", "pest", "MH", qhash="h2"),
        ],
        now=NOW,
    )
    md = gr.render_markdown(report)
    assert "# Gap Report" in md
    assert str(report["total_disclaimers"]) in md
    assert str(report["unique_queries"]) in md
    assert str(report["clusters_found"]) in md
    assert "Coverage" in md
    assert "Outreach" in md


# ===========================================================================
# --write-to-db insert-only safety
# ===========================================================================
def test_write_to_db_only_inserts_never_updates(monkeypatch):
    """Even when --write-to-db is set, only insert_one is called.

    We monkey-patch the MongoClient construction to return a mongomock
    client, then record which collection methods were called. Assert
    that insert_one was called and update/replace/delete were NOT.
    """
    fake_client = mongomock.MongoClient()
    fake_db = fake_client["farmer_feedback"]

    methods_called: list[tuple[str, tuple]] = []

    real_insert = fake_db["gap_reports"].insert_one
    real_update = fake_db["gap_reports"].update_one
    real_replace = fake_db["gap_reports"].replace_one
    real_delete = fake_db["gap_reports"].delete_one

    def spy_insert(*a, **kw):
        methods_called.append(("insert_one", a))
        return real_insert(*a, **kw)
    def spy_update(*a, **kw):
        methods_called.append(("update_one", a))
        return real_update(*a, **kw)
    def spy_replace(*a, **kw):
        methods_called.append(("replace_one", a))
        return real_replace(*a, **kw)
    def spy_delete(*a, **kw):
        methods_called.append(("delete_one", a))
        return real_delete(*a, **kw)

    monkeypatch.setattr(fake_db["gap_reports"], "insert_one", spy_insert)
    monkeypatch.setattr(fake_db["gap_reports"], "update_one", spy_update)
    monkeypatch.setattr(fake_db["gap_reports"], "replace_one", spy_replace)
    monkeypatch.setattr(fake_db["gap_reports"], "delete_one", spy_delete)

    monkeypatch.setattr(
        gr, "MongoClient", lambda *a, **kw: fake_client,
    )
    monkeypatch.setenv("MONGODB_URI", "mongodb://fake:27017")

    report = gr.build_report(
        period_days=7, gdb_entries=[], disclaimers=[], candidates=[],
        now=NOW,
    )
    inserted_id = gr.write_report_to_db(report, db_name="farmer_feedback")

    called_names = [n for n, _ in methods_called]
    assert "insert_one" in called_names
    for forbidden in ("update_one", "replace_one", "delete_one"):
        assert forbidden not in called_names, (
            f"write_report_to_db must not call {forbidden}"
        )
    assert inserted_id  # non-empty


def test_write_to_db_disabled_by_default_via_main(tmp_path, monkeypatch):
    """`python generate_report.py` (no --write-to-db) must not touch Mongo.

    We capture the sys.argv and assert that MongoClient(...) is never
    constructed during the read-only path.
    """
    writes = {"count": 0}
    real_client = mongomock.MongoClient

    def spy(*a, **kw):
        writes["count"] += 1
        return real_client(*a, **kw)

    monkeypatch.setattr(gr, "MongoClient", spy)
    monkeypatch.setenv("MONGODB_URI", "mongodb://fake:27017")
    monkeypatch.setattr(
        gr.fgc, "get_client",
        lambda: _FakeClientWith(fgc_db_name="farmer_feedback"),
    )

    # The _FakeClient is wired below; first, define argv.
    monkeypatch.setattr("sys.argv", [
        "generate_report.py",
        "--output", str(tmp_path / "report.md"),
    ])
    rc = gr.main()
    assert rc == 0
    assert writes["count"] == 0, (
        "MongoClient must not be constructed when --write-to-db is absent"
    )
    assert (tmp_path / "report.md").exists()


class _FakeClientWith:
    """Used by test_write_to_db_disabled_by_default_via_main above."""
    def __init__(self, *, fgc_db_name):
        self._c = mongomock.MongoClient()
        self._db_name = fgc_db_name
    def __getitem__(self, name):
        return _FakeDB(self._c[name])
    def close(self):
        pass


class _FakeDB:
    def __init__(self, db):
        self._db = db
    def __getitem__(self, name):
        return self._db[name]


def test_write_to_db_enabled_calls_insert(monkeypatch, tmp_path):
    """With --write-to-db, exactly one insert happens."""
    fake_client = mongomock.MongoClient()
    insert_calls: list[int] = []

    real_insert = fake_client["farmer_feedback"]["gap_reports"].insert_one

    def counting_insert(*a, **kw):
        insert_calls.append(1)
        return real_insert(*a, **kw)

    monkeypatch.setattr(
        fake_client["farmer_feedback"]["gap_reports"],
        "insert_one", counting_insert,
    )
    monkeypatch.setattr(gr, "MongoClient", lambda *a, **kw: fake_client)
    monkeypatch.setattr(
        gr.fgc, "get_client",
        lambda: _FakeClientWith(fgc_db_name="farmer_feedback"),
    )
    monkeypatch.setenv("MONGODB_URI", "mongodb://fake:27017")

    monkeypatch.setattr("sys.argv", [
        "generate_report.py",
        "--output", str(tmp_path / "report.md"),
        "--write-to-db",
    ])
    rc = gr.main()
    assert rc == 0
    assert len(insert_calls) == 1
    # Verify the inserted doc actually lives in gap_reports.
    docs = list(fake_client["farmer_feedback"]["gap_reports"].find({}))
    assert len(docs) == 1
    assert docs[0]["report_type"] == gr.REPORT_TYPE


# ===========================================================================
# Encoding contract
# ===========================================================================
class _SeededFakeClient:
    """mongomock-backed client that pre-seeds gdb_entries and
    disclaimer_logs so ``generate_report.main()`` produces a non-trivial
    markdown report (i.e. one that exercises every render branch).

    Seed timestamps use ``datetime.now()`` (NOT a hardcoded fixed date)
    because the script's fetcher applies a Mongo-side ``timestamp $gte
    now - since_days`` filter using the real wall-clock ``now``. A
    fixed historical timestamp would fall outside the 30-day default
    window and the row would never be returned.
    """
    def __init__(self):
        self._c = mongomock.MongoClient()
        self._db = self._c["farmer_feedback"]
        # A few gdb entries.
        self._db["gdb_entries"].insert_many([
            {"_id": "g1", "domain": "pest", "state": "MH",
             "question": "aphids on tomato", "answer": "..."},
            {"_id": "g2", "domain": "rust", "state": "PB",
             "question": "wheat rust",       "answer": "..."},
        ])
        # A few disclaimer rows. Timestamps are wall-clock-relative
        # (1 and 2 days ago) so they survive the 30-day default filter.
        from datetime import datetime, timedelta, timezone as _tz
        now = datetime.now(_tz.utc)
        self._db["disclaimer_logs"].insert_many([
            {"query": "aphids on tomato",
             "query_normalized": "aphids on tomato",
             "query_hash": "h1",
             "state": "MH", "domain": "pest",
             "status": "unanswered",
             "timestamp": now - timedelta(days=1)},
            {"query": "wheat rust",
             "query_normalized": "wheat rust",
             "query_hash": "h2",
             "state": "PB", "domain": "rust",
             "status": "unanswered",
             "timestamp": now - timedelta(days=2)},
        ])

    def __getitem__(self, name):
        return self._c[name]

    def close(self):
        pass


def test_main_writes_markdown_with_utf8_encoding(tmp_path, monkeypatch):
    """Encoding contract for ``generate_report.main()`` output.

    The markdown summary written to ``--output`` must contain valid
    UTF-8 bytes, including non-ASCII characters rendered by
    ``render_markdown`` (em dashes ``—``, the ``→`` arrow in the period
    line, etc.). This locks the contract in for future refactors so a
    silent encoding regression cannot turn the output into mojibake
    (which would otherwise only be visible in a viewer that defaults
    to a different encoding, e.g. PowerShell without ``-Encoding UTF8``).

    This is a contract test, not a regression test for a known bug —
    the file was already opened with ``encoding="utf-8"`` when this
    test was added.
    """
    # Seed a non-trivial report (so render_markdown exercises every
    # branch that produces non-ASCII text).
    seeded = _SeededFakeClient()

    # Stub the MongoClient factory AND fgc.get_client so the script's
    # read path succeeds against the seeded mongomock store.
    # main() calls fgc.get_client(), which internally constructs a
    # MongoClient from MONGODB_URI. Both call sites must resolve to our
    # fake or the script's fetchers return empty lists.
    def _fake_client_factory(*a, **kw):
        return seeded._c
    monkeypatch.setattr(gr.fgc, "MongoClient", _fake_client_factory)
    monkeypatch.setattr(gr, "MongoClient", _fake_client_factory)
    monkeypatch.setattr(gr.fgc, "get_client", lambda: seeded)
    monkeypatch.setenv("MONGODB_URI", "mongodb://fake:27017")

    # Don't pass --write-to-db (default off). Just exercise the markdown
    # write path.
    out_path = tmp_path / "report.md"
    monkeypatch.setattr("sys.argv", [
        "generate_report.py",
        "--output", str(out_path),
    ])
    rc = gr.main()
    assert rc == 0
    assert out_path.exists()

    # Contract 1: the file decodes cleanly as UTF-8 (no
    # UnicodeDecodeError, which is what mojibake looks like on disk).
    raw = out_path.read_bytes()
    text = raw.decode("utf-8")   # raises UnicodeDecodeError if not utf-8

    # Contract 2: the decoded text actually contains the non-ASCII
    # characters render_markdown emits. If the file were accidentally
    # written with a non-UTF-8 encoding that mangled em dashes, these
    # assertions would fail.
    assert "\u2014" in text, "em dash (\u2014) missing from report"   # —
    assert "\u2192" in text, "right arrow (\u2192) missing from report"  # →

    # Contract 3: the em dash is on disk as the exact UTF-8 byte
    # sequence, not a cp1252/locale-default re-encoding.
    assert b"\xe2\x80\x94" in raw, (
        "em dash not stored as UTF-8 bytes (\\xe2\\x80\\x94); the file "
        "may have been written in a non-UTF-8 encoding"
    )


# ===========================================================================
# CLI smoke (no Mongo)
# ===========================================================================
def test_help_renders():
    """`python generate_report.py --help` exits 0 and lists flags."""
    proc = subprocess.run(
        [sys.executable,
         str(Path(__file__).resolve().parent.parent / "generate_report.py"),
         "--help"],
        capture_output=True, text=True, timeout=10,
    )
    assert proc.returncode == 0
    for flag in ("--since-days", "--limit", "--db", "--output",
                 "--write-to-db", "--verbose"):
        assert flag in proc.stdout, f"missing flag {flag} in --help output"


def test_limit_zero_fails_loudly():
    """`--limit 0` exits 2 (mirrors find_gap_candidates.py behavior)."""
    env = os.environ.copy()
    env.pop("PYTHONPATH", None)
    proc = subprocess.run(
        [sys.executable,
         str(Path(__file__).resolve().parent.parent / "generate_report.py"),
         "--limit", "0"],
        env=env, capture_output=True, text=True, timeout=10,
    )
    assert proc.returncode == 2
    assert "limit" in proc.stderr.lower()
