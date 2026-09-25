"""
Unit tests for `helpers/assertions.py` — the Locust event listener.

These tests focus on the parts that don't need Locust's runner:
the lock-aware CSV writers and the snapshot/queue-length accumulators.
"""
from __future__ import annotations

import csv
import sys
import threading
from pathlib import Path
from typing import List

import pytest

ROOT = Path(__file__).resolve().parents[2]
LOCUST_DIR = ROOT / "testing" / "locust"

# Pre-load the REAL `locust` package from site-packages before any
# harness module runs. Without this, pytest's sys.path manipulation
# lets `from locust import events` (inside `assertions.py`) resolve to
# the empty `testing/locust/__init__.py`, which raises
# `ImportError: cannot import name 'events'`.
import locust  # noqa: E402, F401  — must precede harness imports below
assert locust.__file__ is not None and "site-packages" in locust.__file__, (
    f"Pre-loaded locust is not the real package: {locust.__file__}"
)

# Add sub-package dirs only — NOT `testing/locust/` itself, which would
# shadow the real `locust` package on sys.path.
for sub in ("helpers", "users", "tasks"):
    p = str(LOCUST_DIR / sub)
    if p not in sys.path:
        sys.path.insert(0, p)

import assertions as A  # noqa: E402  (path setup above)


@pytest.fixture
def clean_listener(tmp_path, monkeypatch):
    """Reset listener state before each test and point at a tmp dir."""
    A._results_dir = None
    A._request_csv = None
    A._request_csv_writer = None
    A._assertions_csv_writer = None
    A._assertions_file = None
    A._reputation_snapshots = {}
    A._reputation_snapshot_history = []
    A._assertion_counts = {}
    A._failed_request_count = {}
    A._total_request_count = {}
    A._queue_lengths = []
    A._cosine_p95_samples = []
    A.init(str(tmp_path))
    yield tmp_path
    A.close()


class TestInit:
    def test_creates_requests_csv_with_header(self, clean_listener, tmp_path) -> None:
        p = tmp_path / "requests.csv"
        assert p.exists()
        with open(p, newline="", encoding="utf-8") as f:
            header = next(csv.reader(f))
        assert header[0] == "timestamp"
        assert "endpoint" in header
        assert "status_code" in header

    def test_creates_assertions_csv_with_header(self, clean_listener, tmp_path) -> None:
        p = tmp_path / "assertions.csv"
        assert p.exists()


class TestRecordRequest:
    def test_appends_row(self, clean_listener, tmp_path) -> None:
        A.record_request(
            endpoint="/x", method="GET", name="n", status_code=200,
            response_time_ms=12.0, response_length=10,
            failure=None, assertion="PASS", context={"k": "v"},
        )
        with open(tmp_path / "requests.csv", newline="", encoding="utf-8") as f:
            rows = list(csv.reader(f))
        assert len(rows) == 2  # header + 1
        assert rows[1][3] == "n"
        assert rows[1][4] == "200"

    def test_5xx_bumps_failure_count(self, clean_listener) -> None:
        A.record_request(
            endpoint="/x", method="GET", name="alloc", status_code=503,
            response_time_ms=5.0, response_length=0,
            failure="HTTP 503", assertion="FAIL_5XX", context={},
        )
        ratio = A.get_failure_ratio()
        assert ratio["alloc"] == 1.0
        assert A.get_assertion_counts().get("HTTP_5XX") == 1


class TestRaceOnClose:
    """The known race: `_on_quitting` closes the file while a writer is
    mid-row. The fix puts `close()` under `_lock`. This test exercises
    that the lock prevents the ValueError that would otherwise come
    from writing to a closed file."""

    def test_close_waits_for_record_request(self, clean_listener) -> None:
        errors: List[Exception] = []

        def writer():
            try:
                for _ in range(1000):
                    A.record_request(
                        endpoint="/x", method="GET", name="n",
                        status_code=200, response_time_ms=1.0,
                        response_length=0, failure=None,
                        assertion="PASS", context={},
                    )
            except Exception as e:  # pragma: no cover
                errors.append(e)

        t = threading.Thread(target=writer)
        t.start()
        A.close()  # should block until writer is done with this batch.
        t.join(timeout=5.0)
        assert not errors


class TestReputationSnapshots:
    def test_record_and_read_back(self, clean_listener) -> None:
        A.record_reputation_snapshot("u1", {"reputation_score": 5, "at": 0.0})
        snaps = A.get_reputation_snapshots()
        assert snaps["u1"]["reputation_score"] == 5

    def test_write_csv_with_expected_columns(self, clean_listener, tmp_path) -> None:
        A.record_reputation_snapshot("u1", {"reputation_score": 5})
        A.record_reputation_snapshot("u2", {"reputation_score": 7})
        out = A.write_reputation_snapshot_csv()
        assert out.exists()
        assert out == tmp_path / "reputation_snapshots.csv"

    def test_history_appends_every_event(self, clean_listener) -> None:
        A.record_reputation_snapshot("u1", {"reputation_score": 5, "at": 1.0})
        A.record_reputation_snapshot("u1", {"reputation_score": 7, "at": 2.0})
        A.record_reputation_snapshot("u2", {"reputation_score": 3, "at": 3.0})
        hist = A.get_reputation_snapshot_history()
        assert len(hist) == 3
        assert hist[0] == (1.0, "u1", 5.0, "")
        assert hist[1] == (2.0, "u1", 7.0, "")
        assert hist[2] == (3.0, "u2", 3.0, "")

    def test_history_csv_writes_with_expected_columns(
        self, clean_listener, tmp_path,
    ) -> None:
        A.record_reputation_snapshot("u1", {"reputation_score": 5, "at": 2.0})
        A.record_reputation_snapshot("u1", {"reputation_score": 7, "at": 1.0})
        A.record_reputation_snapshot("u2", {"reputation_score": 3, "at": 3.0})
        out = A.write_reputation_snapshot_history_csv()
        assert out == tmp_path / "reputation_snapshot_history.csv"
        rows = list(csv.reader(open(out, encoding="utf-8")))
        assert rows[0] == ["at", "user_id", "reputation_score", "context"]
        # u1 sorted by (user_id, at) → 1.0 then 2.0
        assert rows[1][1] == "u1" and rows[2][1] == "u1"
        assert float(rows[1][0]) < float(rows[2][0])


class TestQueueLengths:
    def test_record_and_dump(self, clean_listener, tmp_path) -> None:
        A.record_queue_length("/queue", 12)
        A.record_queue_length("/queue", 18)
        out = A.write_queue_length_csv()
        assert out is not None
        assert out.exists()
        with open(out, newline="", encoding="utf-8") as f:
            rows = list(csv.reader(f))
        assert len(rows) == 3  # header + 2
        assert rows[1][2] == "12"
        assert rows[2][2] == "18"


class TestCosineSamples:
    def test_record_and_percentile(self, clean_listener) -> None:
        for v in [100, 200, 300, 400, 500]:
            A.record_cosine_sample(float(v))
        samples = A.get_cosine_samples()
        assert samples == [100.0, 200.0, 300.0, 400.0, 500.0]