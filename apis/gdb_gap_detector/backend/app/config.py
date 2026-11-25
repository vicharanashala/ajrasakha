"""Runtime configuration, read from environment variables (.env supported)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _list(name: str, default: str) -> list[str]:
    return [x.strip() for x in os.getenv(name, default).split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    # --- Database -----------------------------------------------------------
    # Use "mongomock://" for an in-memory demo DB that is auto-seeded.
    mongo_uri: str = os.getenv("MONGO_URI", "mongomock://")
    mongo_db: str = os.getenv("MONGO_DB", "agriai")
    questions_collection: str = os.getenv("QUESTIONS_COLLECTION", "questions")
    # Read-only source of truth is `questions`; the pipeline writes only to these:
    out_clusters: str = "gdb_gap_clusters"
    out_cells: str = "gdb_gap_coverage_cells"
    out_reports: str = "gdb_gap_reports"

    # questions | disclaimer_logs
    source_mode: str = os.getenv("SOURCE_MODE", "questions")
    source_db: str = os.getenv("SOURCE_DB", "farmer_feedback")
    source_collection: str = os.getenv("SOURCE_COLLECTION", "disclaimer_logs")
    gdb_collection: str = os.getenv("GDB_COLLECTION", "gdb_entries")
    ignored_log_sources: list[str] = field(default_factory=lambda: _list("IGNORED_LOG_SOURCES", "test"))
    # Database that receives the pipeline output (defaults to MONGO_DB)
    out_db: str = os.getenv("OUT_DB", "")
    # "latest" = treat the newest record as "now" (for static / historical datasets)
    as_of: str = os.getenv("AS_OF", "")

    # --- What counts as a "disclaimer-triggered" query ----------------------
    # Chatbot-originated questions (web app + WhatsApp) are the ones that get
    # routed to the reviewer pipeline when the GDB cannot answer them.
    disclaimer_sources: list[str] = field(default_factory=lambda: _list("DISCLAIMER_SOURCES", "AJRASAKHA,WHATSAPP"))
    # Status values meaning "a reviewed answer now exists in the GDB".
    resolved_statuses: list[str] = field(default_factory=lambda: _list("RESOLVED_STATUSES", "closed"))
    # Statuses to ignore entirely (not real farmer demand).
    ignored_statuses: list[str] = field(default_factory=lambda: _list("IGNORED_STATUSES", "non_agri,duplicate_closed"))
    lookback_days: int = int(os.getenv("LOOKBACK_DAYS", "90"))

    # --- Clustering ---------------------------------------------------------
    # auto | sbert | tfidf  (auto = sentence-transformers if installed, else TF-IDF)
    embedding_backend: str = os.getenv("EMBEDDING_BACKEND", "auto")
    sbert_model: str = os.getenv("SBERT_MODEL", "paraphrase-multilingual-MiniLM-L12-v2")
    distance_threshold_sbert: float = float(os.getenv("DISTANCE_THRESHOLD_SBERT", "0.40"))
    distance_threshold_tfidf: float = float(os.getenv("DISTANCE_THRESHOLD_TFIDF", "0.80"))
    min_cluster_size: int = int(os.getenv("MIN_CLUSTER_SIZE", "3"))

    # --- Reporting ----------------------------------------------------------
    top_n: int = int(os.getenv("REPORT_TOP_N", "20"))
    # Pipeline re-runs automatically every N hours (interval job, starts when the API starts).
    report_interval_hours: float = float(os.getenv("REPORT_INTERVAL_HOURS", "2"))
    report_tz: str = os.getenv("REPORT_TZ", "Asia/Kolkata")
    enable_scheduler: bool = os.getenv("ENABLE_SCHEDULER", "1") == "1"
    demo_seed: bool = os.getenv("DEMO_SEED", "1") == "1"
    cors_origins: list[str] = field(default_factory=lambda: _list("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"))


settings = Settings()
