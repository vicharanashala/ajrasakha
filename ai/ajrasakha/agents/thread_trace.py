"""Structured trace blocks for per-thread log files (logs/{thread_id}.txt)."""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("ajrasakha.agents.thread_trace")

_MAX_TEXT = 4000


def _fmt(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, ensure_ascii=False, indent=2, default=str)
    text = str(value)
    if len(text) > _MAX_TEXT:
        return text[:_MAX_TEXT] + f"\n... [{len(text) - _MAX_TEXT} chars truncated]"
    return text


def trace_event(event: str, **fields: Any) -> None:
    """Write a multi-line trace block to ajrasakha thread logs."""
    lines = [f"=== {event} ==="]
    for key, value in fields.items():
        if value is None:
            continue
        formatted = _fmt(value)
        if "\n" in formatted:
            lines.append(f"{key}:\n{formatted}")
        else:
            lines.append(f"{key}: {formatted}")
    body = "\n".join(lines)
    logger.info(body)
