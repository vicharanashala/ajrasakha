"""
Lightweight metrics for the GDB gap detector scheduler.

The repository's full monitoring stack (Prometheus + Grafana) is opt-in via
Docker Compose (see ``monitoring/``).  We don't take a hard dependency on it
here.  Instead this module exposes a tiny pluggable interface:

    GapMetrics.record_run(...)
    GapMetrics.record_failure(...)
    GapMetrics.observe_duration_ms(...)
    GapMetrics.register_backend(callable)

The default backend is a no-op.  Production deployments can attach a backend
that bridges to Prometheus / StatsD / OpenTelemetry by calling
``register_backend(callable)`` once at import time.  Tests can attach an
in-memory backend to assert behaviour.

The module deliberately contains **no third-party imports** so that
loading it can never break an otherwise healthy scheduler import chain.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Callable, Dict, List, Optional

log = logging.getLogger("gdb_gap_metrics")


MetricEvent = Dict[str, Any]
Backend = Callable[[str, MetricEvent], None]


class _MetricBus:
    """Fan-out bus for metric events.

    Thread-safe.  Multiple backends can register simultaneously.
    """

    def __init__(self) -> None:
        self._backends: List[Backend] = []
        self._lock = threading.Lock()

    def register(self, backend: Backend) -> None:
        with self._lock:
            if backend not in self._backends:
                self._backends.append(backend)

    def emit(self, name: str, payload: Optional[MetricEvent] = None) -> None:
        payload = dict(payload or {})
        payload.setdefault("event", name)
        with self._lock:
            backends = list(self._backends)
        for be in backends:
            try:
                be(name, payload)
            except Exception as e:  # pragma: no cover - defensive
                log.debug("[gdb-gap-metrics] backend %r raised %r", be, e)


_bus = _MetricBus()


def register_backend(backend: Backend) -> None:
    """Register a metric backend.  Called by the monitoring integrations."""
    _bus.register(backend)


def clear_backends() -> None:
    """Drop every backend.  Used by tests to reset state."""
    with _bus._lock:  # type: ignore[attr-defined]
        _bus._backends.clear()  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Convenience emitters (so callers don't have to repeat the dict literal)
# ---------------------------------------------------------------------------

def record_run(
    *,
    duration_ms: float,
    queries_analyzed: int,
    clusters: int,
    priority_gaps: Dict[str, int],
    trigger: str,
    success: bool = True,
) -> None:
    _bus.emit(
        "gap_report_run",
        {
            "duration_ms": round(float(duration_ms), 2),
            "queries_analyzed": int(queries_analyzed),
            "clusters": int(clusters),
            "priority_gaps": dict(priority_gaps or {}),
            "trigger": trigger,
            "success": bool(success),
        },
    )


def record_failure(*, duration_ms: float, trigger: str, error: str) -> None:
    _bus.emit(
        "gap_report_failure",
        {
            "duration_ms": round(float(duration_ms), 2),
            "trigger": trigger,
            "error": str(error)[:1000],
        },
    )


def record_skip(*, reason: str) -> None:
    """A scheduled tick that intentionally did not run (disabled, test env, ..)."""
    _bus.emit("gap_report_skip", {"reason": reason})


def record_start(*, trigger: str) -> None:
    _bus.emit("gap_report_start", {"trigger": trigger})


__all__ = [
    "register_backend",
    "clear_backends",
    "record_run",
    "record_failure",
    "record_skip",
    "record_start",
]