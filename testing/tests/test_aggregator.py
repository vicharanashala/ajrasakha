"""
Unit tests for `aggregate_results.py` — the per-scenario SLA aggregator.

These tests cover pure logic (CSV in → dict out → SLA gates) and do not
require Mongo, the backend, or Locust to be running.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict

import pytest

# Make `testing/scripts/` importable.
ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "testing" / "scripts"
sys.path.insert(0, str(SCRIPTS))

from aggregate_results import (  # noqa: E402  (path setup above)
    _percentile,
    _per_endpoint,
    _sla_summary,
    _cosine_p95,
    _load_budgets,
    SLA_P95_ALLOCATE_MS,
    SLA_HTTP_5XX_RATIO,
    SLA_QUEUE_WAIT_S,
    SLA_COSINE_P95_MS,
)

# Use the real YAML-driven budgets so tests cover the same path the
# aggregator runs in production.
BUDGETS = _load_budgets()


# ---------------- _percentile ---------------------------------------------

class TestPercentile:
    def test_empty(self) -> None:
        assert _percentile([], 0.95) == 0.0

    def test_single(self) -> None:
        assert _percentile([42.0], 0.95) == 42.0

    def test_p50_odd_count(self) -> None:
        # sorted = [10, 20, 30]; p50 (k=1.0) -> 20
        assert _percentile([30, 10, 20], 0.50) == 20.0

    def test_p95_linear_interp(self) -> None:
        # sorted = [10..100] step 10 (n=10); p95 (k = 9*0.95 = 8.55)
        # -> s[8] + (s[9]-s[8]) * 0.55 = 90 + 10*0.55 = 95.5
        vals = list(range(10, 110, 10))
        assert _percentile(vals, 0.95) == pytest.approx(95.5, abs=0.001)


# ---------------- _per_endpoint -------------------------------------------

class TestPerEndpoint:
    def test_groups_by_name(self) -> None:
        rows = [
            {"name": "list_allocated", "response_time_ms": "100", "status_code": "200"},
            {"name": "list_allocated", "response_time_ms": "200", "status_code": "200"},
            {"name": "submit_review",  "response_time_ms": "300", "status_code": "500"},
        ]
        agg = _per_endpoint(rows)
        assert set(agg.keys()) == {"list_allocated", "submit_review"}
        assert agg["list_allocated"]["count"] == 2
        assert agg["submit_review"]["err_count"] == 1

    def test_zero_division_is_safe(self) -> None:
        # A row with name="" should be ignored, leaving the rest fine.
        rows = [{"name": "", "response_time_ms": "0", "status_code": "0"}]
        assert _per_endpoint(rows) == {}

    def test_p95_within_budget(self) -> None:
        # 100 samples at 100ms; p95 should be well below 800ms.
        rows = [
            {"name": "allocate-experts", "response_time_ms": str(100 + i),
             "status_code": "200"}
            for i in range(100)
        ]
        agg = _per_endpoint(rows)
        assert agg["allocate-experts"]["p95_ms"] < SLA_P95_ALLOCATE_MS

    def test_5xx_ratio(self) -> None:
        rows = (
            [{"name": "queue_details", "response_time_ms": "50",
              "status_code": "200"}] * 999
            + [{"name": "queue_details", "response_time_ms": "50",
                "status_code": "500"}]
        )
        agg = _per_endpoint(rows)
        # 0.1% error rate exactly — at the budget boundary.
        assert agg["queue_details"]["err_ratio"] == pytest.approx(
            SLA_HTTP_5XX_RATIO, abs=0.0001
        )


# ---------------- _cosine_p95 ----------------------------------------------

class TestCosineP95:
    def test_filters_by_endpoint(self) -> None:
        rows = [
            {"endpoint": "/api/questions/check-duplicate", "response_time_ms": "100"},
            {"endpoint": "/api/questions/check-duplicate", "response_time_ms": "200"},
            {"endpoint": "/api/questions/allocated",        "response_time_ms": "9999"},
        ]
        # Only cosine samples should count.
        assert _cosine_p95(rows) == pytest.approx(195.0, abs=1.0)

    def test_no_samples_returns_zero(self) -> None:
        rows = [{"endpoint": "/api/questions/allocated", "response_time_ms": "100"}]
        assert _cosine_p95(rows) == 0.0


# ---------------- _sla_summary ---------------------------------------------

def _full_agg(max_ms: float, err_ratio: float = 0.0,
              p95_ms: float = 100.0) -> Dict[str, Dict[str, float]]:
    """Helper: produce a fully-populated `agg` row the way `_per_endpoint`
    would (the real `_sla_summary` reads `err_ratio`, `p95_ms`, `max_ms`)."""
    return {"q": {
        "count": 1, "p50_ms": p95_ms, "p95_ms": p95_ms, "p99_ms": p95_ms,
        "max_ms": max_ms, "err_count": 0, "err_ratio": err_ratio,
    }}


class TestSlaSummary:
    def _call(self, agg, **kw):
        return _sla_summary(
            scenario="1x_locust",
            agg=agg,
            rep_drift_count=kw.get("rep_drift_count", 0),
            cosine_p95_ms=kw.get("cosine_p95_ms", 900.0),
            end_queue_lengths=kw.get("end_queue_lengths", {}),
            budgets=BUDGETS,
        )

    def test_s1_pass_when_max_latency_under_60s(self) -> None:
        out = self._call(_full_agg(max_ms=30_000.0))
        s1 = next(r for r in out if r[0] == "S1")
        assert s1[2] is True

    def test_s1_fail_when_max_latency_over_60s(self) -> None:
        out = self._call(_full_agg(max_ms=90_000.0))
        s1 = next(r for r in out if r[0] == "S1")
        assert s1[2] is False

    def test_s5_pass_when_no_5xx(self) -> None:
        out = self._call(_full_agg(max_ms=1000.0, err_ratio=0.0))
        s5 = next(r for r in out if r[0] == "S5")
        assert s5[2] is True

    def test_s5_fail_when_5xx_over_budget(self) -> None:
        # At 1× the per-scenario budget is 0.5%; any ratio over that fails.
        out = self._call(_full_agg(max_ms=1000.0, err_ratio=0.01))
        s5 = next(r for r in out if r[0] == "S5")
        assert s5[2] is False

    def test_s6_fail_on_any_drift(self) -> None:
        out = self._call(_full_agg(max_ms=1000.0), rep_drift_count=1)
        s6 = next(r for r in out if r[0] == "S6")
        assert s6[2] is False

    def test_s6_pass_on_zero_drift(self) -> None:
        out = self._call(_full_agg(max_ms=1000.0), rep_drift_count=0)
        s6 = next(r for r in out if r[0] == "S6")
        assert s6[2] is True

    def test_s7_pass_under_budget(self) -> None:
        out = self._call(_full_agg(max_ms=1000.0),
                         cosine_p95_ms=SLA_COSINE_P95_MS - 1.0)
        s7 = next(r for r in out if r[0] == "S7")
        assert s7[2] is True

    def test_s7_fail_over_budget(self) -> None:
        out = self._call(_full_agg(max_ms=1000.0),
                         cosine_p95_ms=SLA_COSINE_P95_MS + 1.0)
        s7 = next(r for r in out if r[0] == "S7")
        assert s7[2] is False

    def test_returns_seven_rows(self) -> None:
        out = self._call(_full_agg(max_ms=1000.0))
        ids = [r[0] for r in out]
        assert ids == ["S1", "S2", "S3", "S4", "S5", "S6", "S7"]

    def test_s3_pass_when_queue_drained(self) -> None:
        # At 1× the threshold is 100; an end-of-run queue length of 50 passes.
        out = self._call(_full_agg(max_ms=1000.0),
                         end_queue_lengths={"/api/questions/allocated": 50})
        s3 = next(r for r in out if r[0] == "S3")
        assert s3[2] is True

    def test_s3_fail_when_queue_above_threshold(self) -> None:
        # At 1× the threshold is 100; 400 fails.
        out = self._call(_full_agg(max_ms=1000.0),
                         end_queue_lengths={"/api/questions/allocated": 400})
        s3 = next(r for r in out if r[0] == "S3")
        assert s3[2] is False

    def test_s4_pass_when_no_breaches(self) -> None:
        # A single "POST /api/auth/login" row at 100 ms — well under 400.
        agg = {"POST /api/auth/login": {
            "count": 1, "p50_ms": 100.0, "p95_ms": 100.0, "p99_ms": 100.0,
            "max_ms": 100.0, "err_count": 0, "err_ratio": 0.0,
        }}
        out = self._call(agg)
        s4 = next(r for r in out if r[0] == "S4")
        assert s4[2] is True

    def test_s4_fail_on_endpoint_breach(self) -> None:
        # Same row but at 500 ms — over the 400 ms budget.
        agg = {"POST /api/auth/login": {
            "count": 1, "p50_ms": 500.0, "p95_ms": 500.0, "p99_ms": 500.0,
            "max_ms": 500.0, "err_count": 0, "err_ratio": 0.0,
        }}
        out = self._call(agg)
        s4 = next(r for r in out if r[0] == "S4")
        assert s4[2] is False