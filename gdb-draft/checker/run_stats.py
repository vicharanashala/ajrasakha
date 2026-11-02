"""Thread-safe counters for where a run's time and retries actually go.

A 40k run is only plannable if it can be measured: how many model calls
were made, how many attempts failed and had to be retried, and how much
wall-clock time went to requests, backoff sleeps and document downloads.
Callers record with `record()`; a run reads `snapshot()` afterwards.
"""

from __future__ import annotations

import threading
from typing import Any

_lock = threading.Lock()
_stats: dict[str, float] = {}


def record(**amounts: float) -> None:
    with _lock:
        for name, amount in amounts.items():
            _stats[name] = _stats.get(name, 0.0) + amount


def snapshot() -> dict[str, float]:
    with _lock:
        return dict(_stats)


def reset() -> None:
    with _lock:
        _stats.clear()


def summary_lines() -> list[str]:
    s = snapshot()
    calls = int(s.get("model_calls", 0))
    if not calls and not s.get("document_fetches"):
        return []
    attempts = int(s.get("model_attempts", 0))
    lines = [
        f"model calls: {calls}  attempts: {attempts}  "
        f"failed attempts: {int(s.get('model_failed_attempts', 0))}  "
        f"gave up: {int(s.get('model_gave_up', 0))}",
        f"time in model requests: {s.get('model_request_seconds', 0):.0f}s  "
        f"backoff sleeping: {s.get('model_sleep_seconds', 0):.0f}s",
    ]
    fetches = int(s.get("document_fetches", 0))
    if fetches:
        lines.append(
            f"document fetches: {fetches}  time fetching/parsing: {s.get('document_fetch_seconds', 0):.0f}s"
        )
    return lines
