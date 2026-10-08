"""Ingestion readers: seed collections -> normalised pydantic models. Read-only."""

from backend.app.ingest.disclaimer_sources import load_disclaimer_queries
from backend.app.ingest.gdb_source import load_gdb_entries

__all__ = ["load_disclaimer_queries", "load_gdb_entries"]
