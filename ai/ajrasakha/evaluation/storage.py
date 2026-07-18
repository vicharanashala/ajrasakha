"""
storage.py — Postgres persistence for DeepEval answer quality results.

This module writes the eval_results rows produced by run_ground_truth.py (or any
caller of evaluate_response_quality()) into Postgres, and provides a read-back
function for dashboards / longitudinal analysis.

DB API choice
-------------
Uses DB-API 2.0 parameterised queries. Works with both psycopg2 (production
ai-postgres) and sqlite3 (test harness). Two intentional dialect shims:

  1. Placeholder syntax: psycopg2 wants %s, sqlite3 wants ?.
     _PLACEHOLDER = "%s" in production; the sqlite harness substitutes ?.
  2. CREATE TABLE DDL: Postgres uses SERIAL + TIMESTAMP + REAL; sqlite uses
     INTEGER PRIMARY KEY AUTOINCREMENT + TIMESTAMP + REAL.
     The DDL constant _CREATE_TABLE_PG matches schema.sql exactly; the test
     harness substitutes _CREATE_TABLE_SQLITE.

The shim is intentional and minimal. We are NOT building a generic
SQLAlchemy/Core abstraction — that would be over-engineering for one table.
We are explicitly supporting two known-good backends so the LOGIC can be
validated offline.

Live deployment
---------------
schema.sql is the source of truth for the production table shape.
save_eval_results() will issue CREATE TABLE IF NOT EXISTS on first call so the
table comes up automatically; admins can also pre-create it with:

    PGPASSWORD=ai_secret psql -h localhost -U ai -d ai -f schema.sql

Module import side effects: none. No top-level DB connections.

WHAT THIS MODULE DOES NOT DO
----------------------------
- It does NOT connect on import. Callers pass db_url explicitly.
- It does NOT batch across calls. Each save_eval_results() is one transaction.
- It does NOT mutate the input list. Results are read-only; rows are
  extracted into a list of tuples before INSERT.
- It does NOT swallow exceptions. Connection / SQL errors propagate so the
  caller (run_ground_truth.py, a CLI script, a CI step) can decide what to do.

Round-trip note
---------------
This module was designed against the real Postgres schema (schema.sql) but
validated against an in-memory sqlite3 database with a parallel schema. The
LOGIC (column mapping, empty-string → NULL conversion, idempotent CREATE
TABLE, ORDER BY + LIMIT read-back) is proven end-to-end by
test_storage_sqlite.py. The actual psycopg2 round-trip against ai-postgres
is deferred until Docker / infra is available.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Columns we read from each result dict and write to eval_results, in order.
# Tuple form: (result-dict-key, sql-column-name, coercion-type)
#   coercion-type:
#     "score" — float-like; "" (empty string from disabled/skipped metric) → None
#     "status" — str; pass through as-is (may be "" or a status string)
#     "question_id" — str; pass through (may be empty if not carried)
_INSERT_COLUMNS = (
    ("question_id",                       "question_id",                       "question_id"),
    ("answerrelevancymetric_score",       "answer_relevancy_score",            "score"),
    ("answerrelevancymetric_passed",      "answer_relevancy_passed",           "status"),
    ("faithfulnessmetric_passed",         "faithfulness_status",               "status"),
    ("contextualrelevancymetric_passed",  "contextual_relevancy_status",       "status"),
)


def save_eval_results(results: list[dict], db_url: str) -> int:
    """
    Write a list of result dicts (as produced by evaluate_response_quality) to
    the eval_results table. Creates the table on first call (idempotent).

    Parameters
    ----------
    results : list[dict]
        Each dict must be a single eval case's result, carrying the canonical
        CSV-stable keys returned by evaluate_response_quality() /
        _quality_dict(). Missing keys are tolerated — empty strings / None
        are written as NULL.
    db_url : str
        A DB-API 2.0 connection URL.
          Postgres (production): "postgresql://user:pass@host:5432/dbname"
          sqlite (tests):        "sqlite://:memory:" or "sqlite:///path.db"

    Returns
    -------
    int
        Number of rows inserted.

    Raises
    ------
    Any DB-API / connection error propagates. The caller decides retry policy.
    """
    if not results:
        # Still ensure the table exists so a follow-up get_recent_results()
        # doesn't 404 on an empty (fresh) database.
        conn = _connect(db_url)
        try:
            with conn:
                cur = conn.cursor()
                try:
                    _ensure_table(cur)
                finally:
                    cur.close()
        finally:
            conn.close()
        return 0

    # Build SQL BEFORE opening the connection so the active dialect's
    # placeholder syntax (%s vs ?) is baked into the SQL string.
    # _connect() also flips the dialect hooks (defensive), but the order
    # here ensures correctness even if a caller invokes these functions
    # in an unexpected order.
    _select_dialect(db_url)
    rows = [_result_to_row(r) for r in results]
    sql, params = _build_insert(rows)

    conn = _connect(db_url)
    try:
        with conn:
            cur = conn.cursor()
            try:
                _ensure_table(cur)
                cur.executemany(sql, params)
            finally:
                cur.close()
        return len(rows)
    finally:
        conn.close()


def get_recent_results(db_url: str, limit: int = 50) -> list[dict]:
    """
    Read back the most recent N eval_results rows, newest first.

    Parameters
    ----------
    db_url : str
        Same format as save_eval_results.
    limit : int
        Maximum rows to return. Must be > 0.

    Returns
    -------
    list[dict]
        One dict per row, with keys matching the column names:
          id, question_id, answer_relevancy_score, answer_relevancy_passed,
          faithfulness_status, contextual_relevancy_status, created_at
        Ordered by created_at DESC, id DESC (id breaks same-second ties).
    """
    if limit <= 0:
        raise ValueError(f"limit must be > 0, got {limit}")

    # Set the dialect hooks BEFORE building the SQL so the placeholder
    # matches the connection we're about to open.
    _select_dialect(db_url)

    sql = (
        f"SELECT id, question_id, answer_relevancy_score, "
        f"answer_relevancy_passed, faithfulness_status, "
        f"contextual_relevancy_status, created_at "
        f"FROM eval_results "
        f"ORDER BY created_at DESC, id DESC "
        f"LIMIT {_PLACEHOLDER}"
    )

    conn = _connect(db_url)
    try:
        cur = conn.cursor()
        try:
            _ensure_table(cur)
            cur.execute(sql, (limit,))
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
        finally:
            cur.close()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Internal — dialect shim
# ---------------------------------------------------------------------------

# Placeholder syntax: psycopg2 uses %s; sqlite uses ?. The PUBLIC API never
# exposes this — it only affects the internal _build_insert helper.
_PLACEHOLDER = "%s"   # production default (psycopg2)


def _set_placeholder(ph: str) -> None:
    """Test-harness hook: swap to "?" before sqlite round-trips."""
    global _PLACEHOLDER
    _PLACEHOLDER = ph


def _select_dialect(db_url: str) -> None:
    """Flip placeholder + DDL hooks to match the connection's backend.

    Called by save_eval_results / get_recent_results before building SQL,
    so the right dialect syntax is in effect regardless of caller order.
    """
    if db_url.startswith("sqlite://"):
        _set_placeholder("?")
        _set_create_table(_DDL_STATEMENTS_SQLITE)
    else:
        _set_placeholder("%s")
        _set_create_table(_DDL_STATEMENTS_PG)


# Production DDL — must match ai/ajrasakha/evaluation/schema.sql exactly.
# IF NOT EXISTS makes the call idempotent — safe on every save_eval_results().
# Split into individual statements (sqlite3's cursor.execute() only accepts
# one statement at a time; psycopg2 is more permissive but we keep the
# single-statement discipline for portability).
_DDL_STATEMENTS_PG = [
    """
    CREATE TABLE IF NOT EXISTS eval_results (
        id                              SERIAL PRIMARY KEY,
        question_id                     TEXT,
        answer_relevancy_score          REAL,
        answer_relevancy_passed         TEXT,
        faithfulness_status             TEXT,
        contextual_relevancy_status     TEXT,
        created_at                      TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_eval_results_created_at
        ON eval_results (created_at DESC);
    """,
]

# sqlite equivalent (only used by the test harness):
#   SERIAL PRIMARY KEY  → INTEGER PRIMARY KEY AUTOINCREMENT
#   TIMESTAMP DEFAULT NOW() → TIMESTAMP DEFAULT CURRENT_TIMESTAMP
_DDL_STATEMENTS_SQLITE = [
    """
    CREATE TABLE IF NOT EXISTS eval_results (
        id                              INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id                     TEXT,
        answer_relevancy_score          REAL,
        answer_relevancy_passed         TEXT,
        faithfulness_status             TEXT,
        contextual_relevancy_status     TEXT,
        created_at                      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_eval_results_created_at
        ON eval_results (created_at DESC);
    """,
]

_DDL_ACTIVE = _DDL_STATEMENTS_PG  # production default


def _set_create_table(ddl: list[str]) -> None:
    """Test-harness hook: swap to sqlite DDL before sqlite round-trips."""
    global _DDL_ACTIVE
    _DDL_ACTIVE = ddl


def _ensure_table(cur) -> None:
    """Run all DDL statements in order. Idempotent (CREATE ... IF NOT EXISTS)."""
    for stmt in _DDL_ACTIVE:
        cur.execute(stmt)


# ---------------------------------------------------------------------------
# Internal — connection dispatch
# ---------------------------------------------------------------------------

def _connect(db_url: str):
    """
    Dispatch a DB-API 2.0 connection based on the URL prefix, and set the
    dialect-specific DDL hook so subsequent CREATE TABLE uses the right
    syntax without the caller needing to toggle hooks manually.

    Supports:
      postgresql://...  → psycopg2.connect (production)
      sqlite:///...     → sqlite3.connect with file path
      sqlite://:memory: → sqlite3.connect with in-memory database (tests)

    psycopg2 import is deferred to here so the module can be imported on
    hosts that don't have psycopg2 installed (e.g. minimal CI images that
    only need the test harness).
    """
    if db_url.startswith("postgresql://") or db_url.startswith("postgres://"):
        import psycopg2  # deferred — may be absent on test-only hosts
        # Set the dialect DDL hook so _ensure_table() emits Postgres DDL.
        _set_create_table(_DDL_STATEMENTS_PG)
        _set_placeholder("%s")
        # Strip the scheme prefix; psycopg2 wants a libpq conninfo string.
        conninfo = db_url.split("://", 1)[1]
        return psycopg2.connect(conninfo)

    if db_url.startswith("sqlite://"):
        import sqlite3
        # Set the dialect DDL hook so _ensure_table() emits sqlite-compatible DDL.
        _set_create_table(_DDL_STATEMENTS_SQLITE)
        _set_placeholder("?")
        path_part = db_url[len("sqlite://"):]
        if path_part == ":memory:":
            return sqlite3.connect(":memory:")
        # sqlite:///abs/path.db OR sqlite://rel/path.db
        return sqlite3.connect(path_part)

    raise ValueError(
        f"Unsupported db_url scheme: {db_url!r}. "
        f"Expected 'postgresql://...', 'postgres://...', or 'sqlite://...'."
    )


# ---------------------------------------------------------------------------
# Internal — row construction
# ---------------------------------------------------------------------------

def _result_to_row(result: dict) -> tuple:
    """Convert one evaluate_response_quality() result dict into a row tuple."""
    out = []
    for dict_key, _col, kind in _INSERT_COLUMNS:
        value = result.get(dict_key, "")
        if kind == "score":
            out.append(_coerce_score(value))
        else:
            # question_id, status — store as-is; empty string stays empty
            # (TEXT column accepts empty string and NULL; both are valid here).
            out.append(value if value is not None else "")
    return tuple(out)


def _coerce_score(value) -> float | None:
    """
    Empty string from evaluate_response_quality() (when metric was disabled
    or skipped) → None → stored as SQL NULL. Numeric strings → float.
    Anything else → None.
    """
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_insert(rows: list[tuple]) -> tuple[str, list[tuple]]:
    """
    Build the parameterised INSERT statement and the parameter list for
    executemany(). Placeholder style follows the active _PLACEHOLDER.
    """
    placeholders = ", ".join([_PLACEHOLDER] * len(_INSERT_COLUMNS))
    columns = ", ".join(col for _, col, _ in _INSERT_COLUMNS)
    sql = f"INSERT INTO eval_results ({columns}) VALUES ({placeholders})"
    return sql, rows