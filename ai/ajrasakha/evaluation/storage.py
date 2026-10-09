"""
Postgres persistence for stable-suite evaluation results.

This is what lets the observability dashboard show per-domain answer
quality trends over time (rather than only the pass/fail CSV snapshot of
the latest run). Every call to `save_results_to_postgres` records one
`evaluation_runs` row plus one `evaluation_case_results` row and N
`evaluation_metric_scores` rows (one per applicable quality metric).

Connection is via EVAL_POSTGRES_URL. We deliberately do NOT fall back to
the project's existing `DATABASE_URL` by default: that variable already
points at the LangGraph checkpointer Postgres instance
(`postgresql+asyncpg://...`), and (a) psycopg2 can't parse the
`+asyncpg` driver suffix, (b) writing evaluation rows into whatever
database backs the checkpointer is the wrong default even if the driver
issue were fixed. Set EVAL_POSTGRES_URL explicitly, e.g.:
    EVAL_POSTGRES_URL=postgresql://user:password@localhost:5432/ajrasakha_eval

If you do want to point this at the same Postgres server as
DATABASE_URL (different database/schema), set EVAL_POSTGRES_URL to a
plain `postgresql://` URL yourself -- this module will not do that
translation for you.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("EVAL_POSTGRES_URL")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS evaluation_runs (
    run_id UUID PRIMARY KEY,
    mode TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    total_cases INT,
    passed_cases INT
);

CREATE TABLE IF NOT EXISTS evaluation_case_results (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID REFERENCES evaluation_runs(run_id) ON DELETE CASCADE,
    case_name TEXT NOT NULL,
    domain TEXT,
    query TEXT,
    technical_pass BOOLEAN,
    routing_pass BOOLEAN,
    quality_overall_score DOUBLE PRECISION,
    quality_pass BOOLEAN,
    triage_category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluation_metric_scores (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID REFERENCES evaluation_runs(run_id) ON DELETE CASCADE,
    case_name TEXT NOT NULL,
    domain TEXT,
    metric_name TEXT NOT NULL,
    score DOUBLE PRECISION,
    passed BOOLEAN,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metric_scores_domain_metric
    ON evaluation_metric_scores (domain, metric_name, created_at);

CREATE INDEX IF NOT EXISTS idx_case_results_domain
    ON evaluation_case_results (domain, created_at);
"""

QUALITY_METRIC_NAMES = [
    "AnswerRelevancyMetric",
    "FaithfulnessMetric",
    "ContextualRelevancyMetric",
    "GDBMatchScore",
    "AgriAccuracyMetric",
]


def get_connection():
    import psycopg2

    if not DATABASE_URL:
        raise RuntimeError(
            "EVAL_POSTGRES_URL is not set; cannot store evaluation scores "
            "in Postgres. (Not falling back to DATABASE_URL on purpose -- "
            "that variable is used by the LangGraph checkpointer and uses "
            "a postgresql+asyncpg:// scheme psycopg2 can't parse.)"
        )
    return psycopg2.connect(DATABASE_URL)


def ensure_schema() -> None:
    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
    finally:
        conn.close()


def _safe_bool(value):
    return value if isinstance(value, bool) else None


def save_results_to_postgres(results: list[dict], mode: str) -> str:
    ensure_schema()

    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)
    passed_cases = sum(1 for r in results if r.get("technical_pass") is True)

    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO evaluation_runs
                    (run_id, mode, started_at, finished_at, total_cases, passed_cases)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (run_id, mode, started_at, datetime.now(timezone.utc), len(results), passed_cases),
            )

            for result in results:
                domain = result.get("domain") or result.get("expected_domain")

                cur.execute(
                    """
                    INSERT INTO evaluation_case_results
                        (run_id, case_name, domain, query, technical_pass,
                         routing_pass, quality_overall_score, quality_pass, triage_category)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        run_id,
                        result.get("name"),
                        domain,
                        result.get("query"),
                        _safe_bool(result.get("technical_pass")),
                        _safe_bool(result.get("routing_pass")),
                        result.get("quality_overall_score") or None,
                        _safe_bool(result.get("quality_pass")),
                        result.get("triage_category"),
                    ),
                )

                breakdown = {}
                breakdown_raw = result.get("quality_breakdown")
                if breakdown_raw:
                    try:
                        breakdown = json.loads(breakdown_raw)
                    except Exception:
                        breakdown = {}

                for metric_name in QUALITY_METRIC_NAMES:
                    metric_values = breakdown.get(metric_name)
                    if not metric_values:
                        continue

                    cur.execute(
                        """
                        INSERT INTO evaluation_metric_scores
                            (run_id, case_name, domain, metric_name, score, passed, reason)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            run_id,
                            result.get("name"),
                            domain,
                            metric_name,
                            metric_values.get("score"),
                            _safe_bool(metric_values.get("passed")),
                            metric_values.get("reason"),
                        ),
                    )
    finally:
        conn.close()

    return run_id
