"""Mongo access layer.

Seed databases are READ ONLY. Every document this system produces goes to
``settings.output_db`` (``ace_insights``). Readers call ``get_source_db``;
pipeline jobs are the only code that writes via ``get_output_db``.
"""

from __future__ import annotations

from functools import lru_cache

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database

from backend.app.config import get_settings

# Output collections. Names mirror the seed collections where an equivalent exists.
COL_DISCLAIMERS = "disclaimer_queries"  # normalised DisclaimerQuery docs
COL_EMBEDDINGS = "embedding_cache"
COL_CLUSTERS = "clusters"
COL_GAP_REPORTS = "gap_reports"
COL_HEATMAP = "coverage_heatmap"
COL_JOB_RUNS = "job_runs"


@lru_cache
def get_client() -> MongoClient:
    s = get_settings()
    return MongoClient(s.mongodb_uri, serverSelectionTimeoutMS=20000, appname="ace-insights")


def get_source_db(name: str) -> Database:
    """One of the read-only seed databases, by configured name."""
    return get_client()[name]


def get_output_db() -> Database:
    return get_client()[get_settings().output_db]


def ensure_indexes(db: Database | None = None) -> None:
    """Idempotent index creation on the output DB (called by pipeline jobs)."""
    db = db if db is not None else get_output_db()
    db[COL_DISCLAIMERS].create_index([("source_ref", ASCENDING)], unique=True)
    db[COL_DISCLAIMERS].create_index([("timestamp", DESCENDING)])
    db[COL_EMBEDDINGS].create_index([("text_hash", ASCENDING), ("model", ASCENDING)], unique=True)
    db[COL_CLUSTERS].create_index([("run_id", ASCENDING), ("gap_score", DESCENDING)])
    db[COL_GAP_REPORTS].create_index([("generated_at", DESCENDING)])
    db[COL_HEATMAP].create_index([("run_id", ASCENDING)])
    db[COL_JOB_RUNS].create_index([("started_at", DESCENDING)])


def ping() -> bool:
    get_client().admin.command("ping")
    return True
