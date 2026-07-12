"""
test_storage_sqlite.py — round-trip test for storage.py against in-memory sqlite.

WHAT THIS TEST PROVES
---------------------
That storage.save_eval_results() and storage.get_recent_results() work
end-to-end:
  - CREATE TABLE IF NOT EXISTS is idempotent
  - Empty-string scores from evaluate_response_quality() → NULL
  - executemany INSERTs all rows
  - ORDER BY created_at DESC, id DESC returns rows newest-first
  - LIMIT N truncates correctly
  - The result dict shape matches the SQL columns

WHAT THIS TEST DOES NOT PROVE
-----------------------------
That storage.save_eval_results() works against real Postgres. The
psycopg2 driver, the SERIAL keyword, the TIMESTAMP DEFAULT NOW() clause,
and the production DDL are all unexercised here. A live round-trip
against ai-postgres is still required once Docker/infra is available.

Until that live round-trip is performed, treat the production path
(psycopg2 + Postgres) as "code-reviewed, not executed." The LOGIC
tested here is the conversion, batching, and read-back ordering — the
parts that don't depend on a specific driver.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure ajrasakha's parent (the ai/ dir) is on the path so
# `import ajrasakha.evaluation.storage` resolves.
#   test file:     ai/tests/test_storage_sqlite.py
#   parents[0]:    ai/tests/
#   parents[1]:    ai/        <-- this is what we want on sys.path
_AI_ROOT = Path(__file__).resolve().parents[1]
if str(_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_ROOT))

from ajrasakha.evaluation import storage
from ajrasakha.evaluation.storage import (
    save_eval_results,
    get_recent_results,
    _set_placeholder,
    _set_create_table,
    _DDL_STATEMENTS_SQLITE,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_result(
    question_id: str,
    ar_score: str,
    ar_passed: str,
    fa_status: str,
    co_status: str,
) -> dict:
    """Build a fake evaluate_response_quality() result dict for one case."""
    return {
        "question_id": question_id,
        "answerrelevancymetric_score":  ar_score,
        "answerrelevancymetric_passed": ar_passed,
        "faithfulnessmetric_passed":    fa_status,
        "contextualrelevancymetric_passed": co_status,
    }


def _switch_to_sqlite_mode() -> None:
    """
    Flip storage.py's dialect hooks to sqlite before the round-trip.

    This is the ONLY way production storage.py talks to sqlite: via these
    two internal hooks. Same SQL, same logic, just driver-portable
    placeholder and DDL. The _connect() dispatcher already routes
    sqlite:// URLs to sqlite3 instead of psycopg2.
    """
    _set_placeholder("?")
    _set_create_table(_DDL_STATEMENTS_SQLITE)


def _switch_back_to_postgres_mode() -> None:
    """Restore production defaults after the test (defensive)."""
    _set_placeholder("%s")
    _set_create_table(storage._DDL_STATEMENTS_PG)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_round_trip_in_memory_sqlite() -> None:
    """
    End-to-end: write 6 fake results (mimicking the multidomain fixture
    output), read back, assert shape and ordering.

    Implementation note: each call to sqlite3.connect(":memory:") returns a
    FRESH database. To validate cross-connection persistence (the actual
    property we care about for production) we use a tempfile-backed db so
    save_eval_results() and get_recent_results() can run on separate
    connections and still see each other's writes — which is what the
    production psycopg2 path does.
    """
    import tempfile
    _switch_to_sqlite_mode()
    try:
        tmp = Path(tempfile.gettempdir()) / "ajrasakha_storage_roundtrip.db"
        if tmp.exists():
            tmp.unlink()
        db_url = f"sqlite:///{tmp}"

        # Build a realistic batch: all six multidomain cases, with the
        # synthetic-mock score pattern (1.0 PASS, SKIPPED for the others).
        results = [
            _make_result("synthetic_weather_pune_week_01",        "1.0",  "PASS",    "SKIPPED", "SKIPPED"),
            _make_result("synthetic_weather_karnataka_monsoon_01", "1.0", "PASS",    "SKIPPED", "SKIPPED"),
            _make_result("synthetic_market_tomato_price_01",       "1.0",  "PASS",    "SKIPPED", "SKIPPED"),
            _make_result("synthetic_market_wheat_msp_01",          "1.0",  "PASS",    "SKIPPED", "SKIPPED"),
            _make_result("synthetic_soil_nutrient_deficiency_01",  "1.0",  "PASS",    "SKIPPED", "SKIPPED"),
            _make_result("synthetic_soil_salinity_01",             "1.0",  "PASS",    "SKIPPED", "SKIPPED"),
        ]

        # --- SAVE ----------------------------------------------------------
        inserted = save_eval_results(results, db_url)
        assert inserted == 6, f"expected 6 rows inserted, got {inserted}"
        print(f"  save_eval_results: inserted {inserted} rows")

        # --- READ BACK (NEW CONNECTION — proves persistence, not just
        #                    in-connection visibility) ------------------
        recent = get_recent_results(db_url, limit=50)
        assert len(recent) == 6, f"expected 6 rows back, got {len(recent)}"
        print(f"  get_recent_results: read back {len(recent)} rows")

        # --- SHAPE ---------------------------------------------------------
        expected_keys = {
            "id", "question_id", "answer_relevancy_score",
            "answer_relevancy_passed", "faithfulness_status",
            "contextual_relevancy_status", "created_at",
        }
        for row in recent:
            missing = expected_keys - set(row.keys())
            assert not missing, f"row missing keys: {missing}"
            # Types from sqlite3: REAL → float, TIMESTAMP → str, TEXT → str
            assert isinstance(row["answer_relevancy_score"], float)
            assert isinstance(row["answer_relevancy_passed"], str)
            assert isinstance(row["faithfulness_status"], str)
            assert isinstance(row["contextual_relevancy_status"], str)
            assert isinstance(row["created_at"], str), \
                f"created_at should be ISO string, got {type(row['created_at'])}"
        print(f"  row shape: all 6 rows have correct keys + types")

        # --- CONTENT -------------------------------------------------------
        qids = {r["question_id"] for r in recent}
        assert qids == {r["question_id"] for r in results}, \
            f"question_id mismatch: db={qids} input={ {r['question_id'] for r in results} }"
        print(f"  content: all 6 question_ids round-tripped intact")

        # --- ORDERING ------------------------------------------------------
        # All rows were inserted back-to-back (sqlite CURRENT_TIMESTAMP has
        # 1-second resolution — they all share the same created_at), so the
        # secondary sort key (id DESC) determines order. The LAST inserted
        # row should be FIRST in the result set.
        assert recent[0]["question_id"] == "synthetic_soil_salinity_01", \
            f"expected most-recent row first, got {recent[0]['question_id']}"
        assert recent[-1]["question_id"] == "synthetic_weather_pune_week_01", \
            f"expected oldest row last, got {recent[-1]['question_id']}"
        print(f"  ordering: id DESC tiebreak works (most-recent first)")

        # --- LIMIT ---------------------------------------------------------
        recent_3 = get_recent_results(db_url, limit=3)
        assert len(recent_3) == 3
        assert recent_3[0]["question_id"] == recent[0]["question_id"]
        print(f"  limit=3: returned 3 rows, first matches full set")

    finally:
        _switch_back_to_postgres_mode()
        if tmp.exists():
            tmp.unlink()


def test_empty_string_score_becomes_null() -> None:
    """
    evaluate_response_quality() returns "" for score when the metric was
    disabled or skipped. save_eval_results() must convert that to SQL NULL
    so the column is genuinely empty (not a string that looks like a number).

    File-backed (NOT in-memory) so we can verify the round-trip via a
    separate connection.
    """
    import tempfile
    _switch_to_sqlite_mode()
    try:
        tmp = Path(tempfile.gettempdir()) / "ajrasakha_storage_nullscore.db"
        if tmp.exists():
            tmp.unlink()
        db_url = f"sqlite:///{tmp}"

        disabled_result = _make_result(
            question_id="disabled_case_01",
            ar_score="",            # empty string from disabled metric
            ar_passed="DISABLED",
            fa_status="SKIPPED",
            co_status="SKIPPED",
        )
        save_eval_results([disabled_result], db_url)

        rows = get_recent_results(db_url, limit=1)
        assert len(rows) == 1
        row = rows[0]

        # Empty string "" → None → stored as NULL → read back as None
        assert row["answer_relevancy_score"] is None, \
            f"empty-string score should be NULL, got {row['answer_relevancy_score']!r}"
        assert row["answer_relevancy_passed"] == "DISABLED"
        assert row["faithfulness_status"] == "SKIPPED"
        assert row["contextual_relevancy_status"] == "SKIPPED"
        print(f"  empty-string score -> NULL conversion works")

    finally:
        _switch_back_to_postgres_mode()
        if tmp.exists():
            tmp.unlink()


def test_create_table_is_idempotent() -> None:
    """
    Calling save_eval_results() twice against the same db_url must not fail
    on the second call (CREATE TABLE IF NOT EXISTS is idempotent).
    """
    _switch_to_sqlite_mode()
    try:
        # Use a file-backed sqlite (not :memory:) so the second save_eval_results
        # call sees the same database the first one created.
        import tempfile
        tmp = Path(tempfile.gettempdir()) / "ajrasakha_storage_test.db"
        if tmp.exists():
            tmp.unlink()
        db_url = f"sqlite:///{tmp}"

        r1 = _make_result("case_01", "0.9", "PASS", "SKIPPED", "SKIPPED")
        r2 = _make_result("case_02", "0.7", "PASS", "SKIPPED", "SKIPPED")

        n1 = save_eval_results([r1], db_url)
        n2 = save_eval_results([r2], db_url)   # second call — must not fail
        assert n1 == 1 and n2 == 1

        rows = get_recent_results(db_url, limit=50)
        assert len(rows) == 2
        print(f"  CREATE TABLE IF NOT EXISTS is idempotent across calls")

    finally:
        _switch_back_to_postgres_mode()
        if tmp.exists():
            tmp.unlink()


def test_empty_input_is_noop() -> None:
    """
    save_eval_results([]) must return 0 without touching the DB — saves a
    round-trip and avoids spurious "INSERT 0 0" log noise.
    """
    _switch_to_sqlite_mode()
    try:
        db_url = "sqlite://:memory:"
        n = save_eval_results([], db_url)
        assert n == 0
        # And get_recent_results on a never-written table returns []
        rows = get_recent_results(db_url, limit=10)
        assert rows == []
        print(f"  empty input is a no-op (returns 0, no DB writes)")
    finally:
        _switch_back_to_postgres_mode()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    print("=" * 70)
    print("storage.py round-trip test — sqlite3 in-memory + file-backed")
    print("=" * 70)
    print()
    print("NOTE: This validates LOGIC, not the real psycopg2 round-trip.")
    print("      A live ai-postgres test is still required once Docker/infra")
    print("      is available. See storage.py module docstring.")
    print()

    tests = [
        ("round-trip (6 cases, full read-back)", test_round_trip_in_memory_sqlite),
        ("empty-string score → NULL",            test_empty_string_score_becomes_null),
        ("CREATE TABLE IF NOT EXISTS idempotent", test_create_table_is_idempotent),
        ("empty input is no-op",                 test_empty_input_is_noop),
    ]

    failures = 0
    for name, fn in tests:
        print(f"[{name}]")
        try:
            fn()
            print(f"  PASS\n")
        except AssertionError as e:
            print(f"  FAIL: {e}\n")
            failures += 1
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}\n")
            failures += 1

    print("=" * 70)
    if failures == 0:
        print(f"RESULT: {len(tests)}/{len(tests)} tests passed (LOGIC validated)")
        print()
        print("Outstanding work (NOT covered by this test):")
        print("  - Live psycopg2 round-trip against ai-postgres")
        print("  - Apply ai/ajrasakha/evaluation/schema.sql to ai-postgres")
        print("  - Confirm TIMESTAMP DEFAULT NOW() returns expected type")
        return 0
    else:
        print(f"RESULT: {failures} test(s) FAILED")
        return 1


if __name__ == "__main__":
    sys.exit(main())
