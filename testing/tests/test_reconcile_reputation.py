"""
Unit tests for `scripts/reconcile_reputation.py` — the post-run reconciliation
that produces the S6 (`REP_DRIFT`) and `REP_RACE_MONOTONICITY` counts.

We do NOT exercise the live Mongo path here (it would require a replica set).
Only `_detect_monotonicity_races`, which is the in-memory race detector.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "testing" / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import reconcile_reputation as R  # noqa: E402


def _write_history(path: Path, rows: list[tuple[str, str, str, str]]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["at", "user_id", "reputation_score", "context"])
        for r in rows:
            w.writerow(r)


def test_no_history_file_returns_empty(tmp_path: Path) -> None:
    """Missing history file → zero races (not an error)."""
    races = R._detect_monotonicity_races(tmp_path / "nope.csv")
    assert races == []


def test_monotonic_run_yields_zero_races(tmp_path: Path) -> None:
    p = tmp_path / "h.csv"
    _write_history(p, [
        ("1.0", "u1", "1", "POST /api/answers"),
        ("2.0", "u1", "2", "POST /api/answers"),
        ("3.0", "u1", "5", "POST /api/answers/moderator/approve"),
    ])
    assert R._detect_monotonicity_races(p) == []


def test_single_race_detected(tmp_path: Path) -> None:
    p = tmp_path / "h.csv"
    _write_history(p, [
        ("1.0", "u1", "5", "POST /api/answers"),
        ("2.0", "u1", "7", "POST /api/answers"),
        ("3.0", "u1", "6", "POST /api/answers/moderator/approve"),  # race
    ])
    races = R._detect_monotonicity_races(p)
    assert len(races) == 1
    uid, prev, curr, prev_ctx, curr_ctx = races[0]
    assert uid == "u1"
    assert prev == 7.0 and curr == 6.0
    assert "POST /api/answers" in prev_ctx
    assert "moderator/approve" in curr_ctx


def test_race_is_per_user_isolated(tmp_path: Path) -> None:
    p = tmp_path / "h.csv"
    _write_history(p, [
        ("1.0", "u1", "5", "ctx"),
        ("2.0", "u1", "7", "ctx"),  # up, fine
        ("1.5", "u2", "3", "ctx"),
        ("2.5", "u2", "2", "ctx"),  # race for u2 only
    ])
    races = R._detect_monotonicity_races(p)
    assert len(races) == 1
    assert races[0][0] == "u2"


def test_malformed_rows_are_skipped(tmp_path: Path) -> None:
    p = tmp_path / "h.csv"
    _write_history(p, [
        ("not_a_number", "u1", "5", "ctx"),
        ("2.0", "u1", "broken_score", "ctx"),
        ("3.0", "u1", "7", "ctx"),
    ])
    # Two bad rows + one good row → monotonicity check yields nothing.
    assert R._detect_monotonicity_races(p) == []