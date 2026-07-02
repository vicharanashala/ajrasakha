"""Shared startup for POP v2 API and MCP."""

from __future__ import annotations

from metadata_cache import load_metadata_cache, start_metadata_refresh_loop

_started = False


def ensure_pop_started() -> None:
    global _started
    if _started:
        return
    load_metadata_cache()
    start_metadata_refresh_loop()
    _started = True
