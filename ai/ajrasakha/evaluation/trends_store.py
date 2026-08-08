"""
Append-only history of per-domain/per-metric answer-quality scores, one row
per (run, domain, metric). Used by generate_trend_report.py to render
quality_trends.html and detect regressions between consecutive runs.

Backend selection mirrors deepeval_metrics.py's judge-model fallback: when
DATABASE_URL is set (the real Postgres/Neon database), score history is
persisted there via psycopg2; when it isn't set, this falls back to a local
SQLite file so offline/local demo runs still work with zero setup. Same
public API (log_run/fetch_history) either way - callers never need to know
which backend is active.

Schema (identical shape on both backends): run_timestamp, mode, domain,
metric, avg_score - one row per (run, domain, metric). This is the format
the brief's observability dashboard is meant to eventually consume; see
product.md for why that dashboard doesn't exist yet in this repo.
"""

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DEFAULT_DB_PATH = Path(__file__).resolve().parent / "quality_history.db"

_SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS quality_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_timestamp TEXT NOT NULL,
    mode TEXT,
    domain TEXT NOT NULL,
    metric TEXT NOT NULL,
    avg_score REAL NOT NULL
)
"""

_POSTGRES_SCHEMA = """
CREATE TABLE IF NOT EXISTS quality_runs (
    id SERIAL PRIMARY KEY,
    run_timestamp TEXT NOT NULL,
    mode TEXT,
    domain TEXT NOT NULL,
    metric TEXT NOT NULL,
    avg_score DOUBLE PRECISION NOT NULL
)
"""


def _database_url() -> str | None:
    # Read fresh each call (matches deepeval_metrics._build_judge_model's
    # os.getenv-per-call style) so env changes/monkeypatching take effect
    # without needing to know an internal module-level constant name.
    return os.getenv("DATABASE_URL")


def _use_postgres(force_sqlite: bool = False) -> bool:
    return bool(_database_url()) and not force_sqlite


def active_backend(force_sqlite: bool = False) -> str:
    """"postgres" or "sqlite" - whichever log_run()/fetch_history() actually use."""
    return "postgres" if _use_postgres(force_sqlite) else "sqlite"


def _connect_sqlite(db_path: Path) -> sqlite3.Connection:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.execute(_SQLITE_SCHEMA)
    conn.commit()
    return conn


def _connect_postgres():
    import psycopg2  # imported lazily - never required for the SQLite-only/offline path

    conn = psycopg2.connect(_database_url())
    with conn.cursor() as cur:
        cur.execute(_POSTGRES_SCHEMA)
    conn.commit()
    return conn


def _rows_from_breakdown(domain_quality_breakdown: dict, run_timestamp: str, mode: str | None) -> list[tuple]:
    return [
        (run_timestamp, mode, domain, metric, score)
        for domain, metrics in (domain_quality_breakdown or {}).items()
        for metric, score in metrics.items()
        if isinstance(score, (int, float))
    ]


def log_run(
    domain_quality_breakdown: dict,
    mode: str | None = None,
    db_path: Path = DEFAULT_DB_PATH,
    run_timestamp: str | None = None,
    force_sqlite: bool = False,
) -> str:
    """
    Append one run's per-domain/per-metric average scores to the history.

    All rows written by a single call share the same run_timestamp, which is
    how fetch_history() groups them back into "one run". Safe to call every
    time run.py executes, even with an empty/all-null breakdown (mock mode) -
    it just writes zero rows and returns the timestamp used. `db_path` is
    only consulted on the SQLite fallback path; Postgres mode ignores it.

    `force_sqlite=True` always uses the SQLite file at `db_path`, regardless
    of DATABASE_URL - for callers that need guaranteed isolation from the
    real Postgres history even when a real DATABASE_URL is configured in the
    environment (e.g. demo_project3.py's hand-seeded, clearly-labeled
    mode="mock-demo" proof, which must never land in the real baseline).
    """
    run_timestamp = run_timestamp or datetime.now(timezone.utc).isoformat()
    rows = _rows_from_breakdown(domain_quality_breakdown, run_timestamp, mode)

    if _use_postgres(force_sqlite):
        conn = _connect_postgres()
        try:
            if rows:
                with conn.cursor() as cur:
                    cur.executemany(
                        """
                        INSERT INTO quality_runs (run_timestamp, mode, domain, metric, avg_score)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        rows,
                    )
                conn.commit()
        finally:
            conn.close()
    else:
        conn = _connect_sqlite(db_path)
        try:
            if rows:
                conn.executemany(
                    """
                    INSERT INTO quality_runs (run_timestamp, mode, domain, metric, avg_score)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    rows,
                )
                conn.commit()
        finally:
            conn.close()

    return run_timestamp


def fetch_history(db_path: Path = DEFAULT_DB_PATH, last_n_runs: int = 10, force_sqlite: bool = False) -> list[dict]:
    """
    Return the last `last_n_runs` runs, oldest first:
    [{"run_timestamp": str, "mode": str | None, "domains": {domain: {metric: score}}}, ...]

    Reads from whichever backend log_run() is currently writing to - Postgres
    when DATABASE_URL is set, SQLite (at `db_path`) otherwise. See log_run's
    `force_sqlite` docstring - pass the same value used to write the history
    you're trying to read back.
    """
    if _use_postgres(force_sqlite):
        conn = _connect_postgres()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT DISTINCT run_timestamp FROM quality_runs ORDER BY run_timestamp DESC LIMIT %s",
                    (last_n_runs,),
                )
                timestamps = [row[0] for row in cur.fetchall()]
            timestamps.reverse()

            runs = []
            for ts in timestamps:
                domains: dict[str, dict[str, float]] = {}
                mode = None

                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT mode, domain, metric, avg_score FROM quality_runs WHERE run_timestamp = %s",
                        (ts,),
                    )
                    for mode_val, domain, metric, score in cur.fetchall():
                        mode = mode_val
                        domains.setdefault(domain, {})[metric] = score

                runs.append({"run_timestamp": ts, "mode": mode, "domains": domains})

            return runs
        finally:
            conn.close()
    else:
        conn = _connect_sqlite(db_path)
        try:
            timestamps = [
                row[0]
                for row in conn.execute(
                    "SELECT DISTINCT run_timestamp FROM quality_runs ORDER BY run_timestamp DESC LIMIT ?",
                    (last_n_runs,),
                ).fetchall()
            ]
            timestamps.reverse()

            runs = []
            for ts in timestamps:
                domains: dict[str, dict[str, float]] = {}
                mode = None

                for mode_val, domain, metric, score in conn.execute(
                    "SELECT mode, domain, metric, avg_score FROM quality_runs WHERE run_timestamp = ?",
                    (ts,),
                ):
                    mode = mode_val
                    domains.setdefault(domain, {})[metric] = score

                runs.append({"run_timestamp": ts, "mode": mode, "domains": domains})

            return runs
        finally:
            conn.close()
