"""Operational scheduler for the GDB gap detector.

This module supersedes the deprecated ``project_06_gdb_gap_detector/scheduler.py``
(APScheduler in-process worker).  It wraps ``gdb_gap_detector.build_gap_report``
behind a deterministic, *opt-in* scheduler that:

* is configured entirely through environment variables
  (enabled flag, weekly cron, lookback, similarity threshold,
  min_samples, cache TTL, multi-worker gating);
* refuses to start in test environments;
* refuses to start on more than one worker unless explicitly told;
* emits structured logging at every important state transition;
* records lightweight metrics via ``gap_metrics`` (prometheus-ready);
* never crashes the FastAPI app it is attached to.

The scheduler is intentionally **in-process** but uses a Mongo-backed
leader lock so that, when you scale the API to N workers, exactly one
worker runs the report per tick.  See :func:`_acquire_leader_lock`.

Typical production wiring
-------------------------
* Cron-like cadence driven by the embedded ``schedule`` library.
* Triggered manually with :func:`run_now` (operator runbook / CLI).
* Operationally cached for ``GDB_REPORT_CACHE_TTL`` seconds.

Safety guards
-------------
The scheduler will *not* run unless **all** of these hold:

1. ``GDB_SCHEDULER_ENABLED=true`` in the environment.
2. ``GDB_SCHEDULER_FORCE_DISABLE`` is unset or ``false``.
3. ``PYTEST_CURRENT_TEST`` and ``pytest`` are not detected.
4. This worker passed the multi-worker gate
   (see ``GDB_SCHEDULER_WORKER_ID`` / ``GDB_SCHEDULER_LEADER_WORKERS``).
5. Mongo leader-lock acquisition succeeded (when ``MONGO_URI`` is set).
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import time
import traceback
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Optional

from dotenv import load_dotenv

load_dotenv()

from gdb_gap_detector import (  # noqa: E402  (after load_dotenv)
    build_gap_report,
    invalidate_cache as gdb_invalidate_cache,
)

import gap_metrics  # noqa: E402


log = logging.getLogger("gdb_gap_scheduler")


# ---------------------------------------------------------------------------
# Env-var helpers
# ---------------------------------------------------------------------------

def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on", "y", "t")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        log.warning("[gdb-scheduler] %s=%r is not an int - using default %d",
                    name, raw, default)
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        log.warning("[gdb-scheduler] %s=%r is not a float - using default %r",
                    name, raw, default)
        return default


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SchedulerConfig:
    """Immutable configuration loaded from env vars.

    Every field has a documented default so the scheduler is *predictable*
    even when nothing is set - the only field that flips it on is
    ``enabled``.
    """

    enabled: bool = False
    force_disable: bool = False
    # Weekly cron in the form "minute hour day-of-month month day-of-week".
    # Default: every Monday at 02:00 (server local time).
    cron: str = "0 2 * * 1"
    lookback_days: int = 90
    similarity_threshold: float = 0.85
    min_samples: int = 2
    cache_ttl_seconds: int = 900
    # Multi-worker gating
    worker_id: int = 0
    leader_workers: tuple[int, ...] = field(default_factory=lambda: (0,))

    @classmethod
    def from_env(cls) -> "SchedulerConfig":
        leader_raw = os.getenv("GDB_SCHEDULER_LEADER_WORKERS", "0").strip()
        try:
            leaders = tuple(
                int(x) for x in
                (p.strip() for p in leader_raw.split(",")) if x
            )
        except ValueError:
            log.warning(
                "[gdb-scheduler] GDB_SCHEDULER_LEADER_WORKERS=%r invalid - using (0,)",
                leader_raw,
            )
            leaders = (0,)
        return cls(
            enabled=_env_bool("GDB_SCHEDULER_ENABLED", False),
            force_disable=_env_bool("GDB_SCHEDULER_FORCE_DISABLE", False),
            cron=os.getenv("GDB_SCHEDULER_CRON", "0 2 * * 1"),
            lookback_days=_env_int("GDB_SCHEDULER_LOOKBACK_DAYS", 90),
            similarity_threshold=_env_float(
                "GDB_SCHEDULER_SIMILARITY_THRESHOLD", 0.85),
            min_samples=_env_int("GDB_SCHEDULER_MIN_SAMPLES", 2),
            cache_ttl_seconds=_env_int("GDB_REPORT_CACHE_TTL", 900),
            worker_id=_env_int("GDB_SCHEDULER_WORKER_ID", 0),
            leader_workers=leaders or (0,),
        )

    def describe(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "force_disable": self.force_disable,
            "cron": self.cron,
            "lookback_days": self.lookback_days,
            "similarity_threshold": self.similarity_threshold,
            "min_samples": self.min_samples,
            "cache_ttl_seconds": self.cache_ttl_seconds,
            "worker_id": self.worker_id,
            "leader_workers": list(self.leader_workers),
        }


# ---------------------------------------------------------------------------
# Guard predicates
# ---------------------------------------------------------------------------

def _running_under_pytest() -> bool:
    """Heuristic: detect whether the current process is running under pytest.

    We refuse to start the scheduler in that case so unit-test runs don't
    silently spawn background threads that outlive the test process.
    """
    if os.getenv("PYTEST_CURRENT_TEST"):
        return True
    if "pytest" in sys.modules:
        return True
    argv = " ".join(sys.argv).lower()
    if "pytest" in argv or "py.test" in argv:
        return True
    return False


def is_worker_leader(cfg: SchedulerConfig) -> bool:
    """Is this worker in the leader set?"""
    return cfg.worker_id in cfg.leader_workers


def config_passes_basic_guards(cfg: SchedulerConfig) -> tuple[bool, str]:
    """Pure-function guard.  Returns (ok, reason).

    Used by tests and by :meth:`GapScheduler.start`.
    """
    if cfg.force_disable:
        return False, "force_disable=true"
    if not cfg.enabled:
        return False, "enabled=false"
    if cfg.lookback_days < 1:
        return False, f"lookback_days={cfg.lookback_days} invalid"
    if not (0.0 <= cfg.similarity_threshold <= 1.0):
        return False, (
            f"similarity_threshold={cfg.similarity_threshold} out of range")
    if cfg.min_samples < 1 or cfg.min_samples > 50:
        return False, f"min_samples={cfg.min_samples} out of range"
    if cfg.cache_ttl_seconds < 0:
        return False, f"cache_ttl_seconds={cfg.cache_ttl_seconds} invalid"
    if not is_worker_leader(cfg):
        return False, (
            f"worker_id={cfg.worker_id} not in "
            f"leaders={list(cfg.leader_workers)}")
    return True, ""


# ---------------------------------------------------------------------------
# Optional schedule dependency
# ---------------------------------------------------------------------------

try:
    import schedule as _schedule  # type: ignore
    _schedule_ok = True
except ImportError:  # pragma: no cover
    _schedule = None  # type: ignore
    _schedule_ok = False


def _parse_cron(cron: str) -> tuple[int, int, str, str, str]:
    """Split a 5-field cron expression into (minute, hour, dom, month, dow)."""
    parts = cron.split()
    if len(parts) != 5:
        raise ValueError(
            f"Cron expression must have 5 fields, got {len(parts)}: {cron!r}")
    minute, hour, _dom, _month, dow = parts
    return int(minute), int(hour), _dom, _month, dow


def _schedule_weekly_job(cron: str, fn: Callable[[], None]) -> None:
    """Register ``fn`` with the embedded ``schedule`` library.

    Supported cron subsets:

    * ``<m> <h> * * <dow>`` - every ``dow`` at ``h:m`` local time.
    * ``<m> <h> * * *``    - every day at ``h:m``.
    * ``<m> <h> * * */*``  - logged as warning, defaults to Monday.

    Anything unsupported falls back to Monday with a warning.
    """
    if not _schedule_ok:  # pragma: no cover
        raise RuntimeError(
            "The 'schedule' package is not installed; install it to enable "
            "the in-process scheduler.")

    minute, hour, _dom, _month, dow = _parse_cron(cron)

    dow_map = {
        "0": "sunday", "7": "sunday",
        "1": "monday", "2": "tuesday",
        "3": "wednesday", "4": "thursday",
        "5": "friday", "6": "saturday",
    }

    time_str = f"{hour:02d}:{minute:02d}"
    dow_norm = dow.lower()

    if dow_norm in dow_map:
        getattr(_schedule.every(), dow_map[dow_norm]).at(time_str).do(fn)
        log.info("[gdb-scheduler] weekly job scheduled for %s at %s",
                 dow_norm, time_str)
    elif dow_norm == "*":
        _schedule.every().day.at(time_str).do(fn)
        log.info("[gdb-scheduler] daily job scheduled at %s", time_str)
    else:
        log.warning(
            "[gdb-scheduler] unsupported cron DOW=%r; defaulting to Monday %s",
            dow, time_str)
        _schedule.every().monday.at(time_str).do(fn)


# ---------------------------------------------------------------------------
# Multi-worker leader election via Mongo (optional)
# ---------------------------------------------------------------------------

_LEADER_LOCK_NAME = "gdb_gap_scheduler_lock"
_LEADER_LOCK_LEASE_SECONDS = 600  # 10 minutes


def _acquire_leader_lock(cfg: SchedulerConfig) -> bool:
    """Try to claim the leader lock in Mongo.  Returns True if claimed.

    No-op (returns True) when ``MONGO_URI`` is unset, since multi-worker
    safety is then handled by ``GDB_SCHEDULER_LEADER_WORKERS`` instead.
    """
    uri = os.getenv("MONGO_URI")
    if not uri:
        return True

    try:
        from pymongo import MongoClient  # type: ignore
        from pymongo.errors import PyMongoError  # type: ignore
    except ImportError:
        log.warning("[gdb-scheduler] pymongo unavailable - skipping leader lock")
        return False

    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=2000)
        db_name = os.getenv("DB_NAME", "agriai")
        coll = client[db_name]["gdb_scheduler_state"]

        now = time.time()
        expires = now + _LEADER_LOCK_LEASE_SECONDS
        worker_token = f"pid{os.getpid()}-{cfg.worker_id}-{int(now)}"

        result = coll.find_one_and_update(
            {
                "_id": _LEADER_LOCK_NAME,
                "$or": [
                    {"expires_at": {"$lte": now}},
                    {"owner": worker_token},
                ],
            },
            {"$set": {"expires_at": expires,
                      "owner": worker_token,
                      "claimed_at": now}},
            upsert=True,
            return_document=True,
        )
        if result is None:
            return False
        return result.get("owner") == worker_token
    except Exception as e:  # PyMongoError or anything else
        log.warning("[gdb-scheduler] could not reach Mongo for leader lock: %s", e)
        return False


# ---------------------------------------------------------------------------
# Run-once entry point
# ---------------------------------------------------------------------------

@dataclass
class RunResult:
    """Public result of a single ``run_once`` invocation."""

    success: bool
    duration_ms: float
    queries_analyzed: int = 0
    clusters: int = 0
    priority_gaps: dict[str, int] = field(default_factory=dict)
    report_id: Optional[str] = None
    error: Optional[str] = None


def _priority_gaps_from_report(report: dict) -> dict[str, int]:
    by_pri = report.get("gaps_by_priority") or {}
    return {
        "critical": int(by_pri.get("critical", 0)),
        "high":     int(by_pri.get("high", 0)),
        "medium":   int(by_pri.get("medium", 0)),
        "low":      int(by_pri.get("low", 0)),
    }


def run_once(
    *,
    trigger: str = "manual",
    collection_provider: Optional[Callable[[], Iterable[Any]]] = None,
    similarity_threshold: Optional[float] = None,
    min_samples: Optional[int] = None,
    lookback_days: Optional[int] = None,
    invalidate_first: bool = False,
    embed_fn: Optional[Callable[[list[str]], Any]] = None,
) -> RunResult:
    """Run a single gap-report pass synchronously and return a RunResult.

    ``collection_provider`` is a no-arg callable that returns a 3-tuple
    ``(review_collection, golden_collection, pop_collection)``.  When
    ``None`` the function falls back to the module-level collections
    imported from ``main`` (lazily, so importing this module never
    imports ``main``).

    ``embed_fn`` overrides the lazy ``main._get_model().encode`` so
    tests can inject a deterministic embed function without booting
    SentenceTransformer.

    The ``trigger`` string is propagated into logs and metrics so ops
    can distinguish manual runs from weekly cron runs.
    """
    cfg = SchedulerConfig.from_env()

    # Apply explicit overrides on top of the env defaults.
    eff_threshold = (
        cfg.similarity_threshold if similarity_threshold is None
        else similarity_threshold
    )
    eff_min_samples = cfg.min_samples if min_samples is None else min_samples
    eff_lookback = cfg.lookback_days if lookback_days is None else lookback_days
    eff_embed = embed_fn if embed_fn is not None else _embed_fn()

    started = time.perf_counter()
    gap_metrics.record_start(trigger=trigger)
    log.info(
        "gap_report.start trigger=%s threshold=%.3f min_samples=%d "
        "lookback_days=%s invalidate_first=%s",
        trigger, eff_threshold, eff_min_samples, eff_lookback, invalidate_first,
    )

    if invalidate_first:
        try:
            gdb_invalidate_cache()
            log.info("gap_report.cache_invalidated trigger=%s", trigger)
        except Exception as e:  # pragma: no cover
            log.warning("gap_report.cache_invalidate_failed err=%s", e)

    try:
        review_coll, golden_coll, pop_coll = _resolve_collections(
            collection_provider
        )

        # Push the cache TTL so the freshly built report stays warm
        # until the next tick.  Must happen *before* the build so any
        # concurrent HTTP read picks up the new value.
        try:
            import gdb_gap_detector as _g  # local alias
            _g.CACHE_TTL_SECONDS = int(cfg.cache_ttl_seconds)
        except Exception:  # pragma: no cover
            pass

        report = build_gap_report(
            review_collection=review_coll,
            review_golden_collection=golden_coll,
            review_pop_collection=pop_coll,
            embed_fn=eff_embed,
            similarity_threshold=eff_threshold,
            min_samples=eff_min_samples,
            lookback_days=eff_lookback,
        )

        # Warm the detector's own cache so subsequent HTTP calls hit it.
        try:
            import gdb_gap_detector as _g  # local alias
            _g.set_cached_report(report)
        except Exception:  # pragma: no cover
            pass

        elapsed_ms = (time.perf_counter() - started) * 1000.0
        priority = _priority_gaps_from_report(report)
        result = RunResult(
            success=True,
            duration_ms=elapsed_ms,
            queries_analyzed=int(report.get("total_queries_analyzed", 0)),
            clusters=int(report.get("total_clusters_found", 0)),
            priority_gaps=priority,
            report_id=report.get("report_id"),
        )

        log.info(
            "gap_report.success trigger=%s report_id=%s queries=%d clusters=%d "
            "priority=%s elapsed_ms=%.1f",
            trigger, result.report_id, result.queries_analyzed,
            result.clusters, result.priority_gaps, elapsed_ms,
        )
        gap_metrics.record_run(
            duration_ms=elapsed_ms,
            queries_analyzed=result.queries_analyzed,
            clusters=result.clusters,
            priority_gaps=result.priority_gaps,
            trigger=trigger,
            success=True,
        )
        return result

    except Exception as e:
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        log.error(
            "gap_report.failure trigger=%s elapsed_ms=%.1f err=%s\n%s",
            trigger, elapsed_ms, e, traceback.format_exc(),
        )
        gap_metrics.record_failure(
            duration_ms=elapsed_ms, trigger=trigger, error=str(e),
        )
        return RunResult(
            success=False, duration_ms=elapsed_ms, error=str(e),
        )


def _resolve_collections(
    provider: Optional[Callable[[], Iterable[Any]]],
) -> tuple[Any, Any, Any]:
    """Resolve (review, golden, pop) collections from provider or main."""
    if provider is not None:
        triple = provider()
        r, g, p = triple
        return r, g, p

    # Late import to avoid forcing ``main`` to load before tests have
    # patched its globals.
    import main as _main  # type: ignore
    return (
        _main.reviewer_collection,
        _main.golden_qa_collection,
        _main.golden_pop_collection,
    )


def _embed_fn() -> Callable[[list[str]], Any]:
    """Return the embedding function used by the gap detector.

    Falls back to ``main._get_model().encode`` so we use the same
    lazy-loaded model as the HTTP endpoint.  Tests that wish to stub
    the embed function should pass an ``embed_fn`` to ``run_once``.
    """
    import main as _main  # type: ignore
    return _main._get_model().encode


# ---------------------------------------------------------------------------
# Scheduler lifecycle
# ---------------------------------------------------------------------------

class GapScheduler:
    """The in-process weekly scheduler.

    Public surface
    --------------
    * :meth:`start`     - spin up the background loop.
    * :meth:`stop`      - graceful shutdown.
    * :meth:`run_now`   - operator-triggered one-shot.
    * :meth:`state`     - snapshot for ``/gdb/health`` style probes.
    """

    def __init__(
        self,
        config: Optional[SchedulerConfig] = None,
        collection_provider: Optional[Callable[[], Iterable[Any]]] = None,
    ) -> None:
        self.config: SchedulerConfig = config or SchedulerConfig.from_env()
        self._collection_provider = collection_provider
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._last_run: Optional[RunResult] = None
        self._last_attempt_ts: float = 0.0
        self._leader_token: Optional[str] = None

    def start(self) -> bool:
        """Try to start the background loop.  Returns True on success."""
        # --- guard 1: test environment ----------------------------------
        if _running_under_pytest():
            log.info("gap_scheduler.skip reason=test_environment")
            gap_metrics.record_skip(reason="test_environment")
            return False

        # --- guard 2: explicit config -----------------------------------
        ok, reason = config_passes_basic_guards(self.config)
        if not ok:
            log.info("gap_scheduler.skip reason=%s", reason)
            gap_metrics.record_skip(reason=reason)
            return False

        # --- guard 3: Mongo leader lock ---------------------------------
        if not _acquire_leader_lock(self.config):
            log.warning(
                "gap_scheduler.skip reason=leader_lock_failed worker_id=%d",
                self.config.worker_id)
            gap_metrics.record_skip(reason="leader_lock_failed")
            return False

        # --- actually start --------------------------------------------
        if not _schedule_ok:
            log.warning(
                "gap_scheduler.skip reason=schedule_library_missing - "
                "install the 'schedule' package to enable the in-process "
                "scheduler.  Operators can still invoke run_now() manually.")
            gap_metrics.record_skip(reason="schedule_library_missing")
            return False

        if self._thread is not None and self._thread.is_alive():
            log.info("gap_scheduler.already_running")
            return True

        log.info(
            "gap_scheduler.start cron=%r worker_id=%d lookback=%d "
            "threshold=%.3f min_samples=%d cache_ttl=%ds",
            self.config.cron, self.config.worker_id,
            self.config.lookback_days, self.config.similarity_threshold,
            self.config.min_samples, self.config.cache_ttl_seconds,
        )
        try:
            _schedule_weekly_job(self.config.cron, self._tick)
        except Exception as e:
            log.warning("gap_scheduler.start invalid cron=%r err=%s",
                        self.config.cron, e)
            gap_metrics.record_skip(reason="invalid_cron")
            return False

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._loop,
            name=f"gdb-gap-scheduler-{os.getpid()}",
            daemon=True,
        )
        self._thread.start()
        return True

    def stop(self, *, timeout: float = 5.0) -> None:
        if not self._thread:
            return
        log.info("gap_scheduler.stop")
        self._stop_event.set()
        try:
            self._thread.join(timeout=timeout)
        except Exception:  # pragma: no cover
            pass
        self._thread = None
        if self._leader_token:
            try:
                uri = os.getenv("MONGO_URI")
                if uri:
                    from pymongo import MongoClient  # type: ignore
                    client = MongoClient(uri, serverSelectionTimeoutMS=1000)
                    client[os.getenv("DB_NAME", "agriai")]["gdb_scheduler_state"] \
                        .update_one(
                            {"_id": _LEADER_LOCK_NAME,
                             "owner": self._leader_token},
                            {"$set": {"expires_at": 0}})
            except Exception:  # pragma: no cover
                pass
            self._leader_token = None

    def _loop(self) -> None:
        log.debug("gap_scheduler.loop entered")
        while not self._stop_event.is_set():
            try:
                _schedule.run_pending()
            except Exception as e:  # pragma: no cover
                log.warning("gap_scheduler.loop error: %s", e)
            if self._stop_event.wait(timeout=30):
                break
        log.debug("gap_scheduler.loop exited")

    def _tick(self) -> None:
        """Hook invoked by ``schedule`` at each cron firing."""
        self._last_attempt_ts = time.time()
        result = run_once(
            trigger="scheduled",
            collection_provider=self._collection_provider,
        )
        self._last_run = result

    def run_now(self) -> RunResult:
        """Run a single report pass *now*, ignoring scheduler guards.

        Always runs (no env-var check, no leader election) - that's the
        whole point: it's the operational escape hatch.  Manual runs are
        safe to invoke from any worker.
        """
        log.info("gap_scheduler.run_now invoked")
        self._last_attempt_ts = time.time()
        result = run_once(
            trigger="manual",
            collection_provider=self._collection_provider,
        )
        self._last_run = result
        return result

    def invalidate_cache(self) -> None:
        """Drop both the in-process detector cache and the HTTP cache."""
        try:
            gdb_invalidate_cache()
            import main as _main  # type: ignore
            _main._GAP_REPORT_CACHE.clear()
        except Exception as e:  # pragma: no cover
            log.warning("gap_scheduler.cache_invalidate failed: %s", e)
            raise
        log.info("gap_scheduler.cache_invalidated")

    def state(self) -> dict:
        """Snapshot for ``/gdb/health`` style probes."""
        last = self._last_run
        return {
            "running": bool(self._thread and self._thread.is_alive()),
            "config": self.config.describe(),
            "last_attempt_ts": self._last_attempt_ts,
            "last_run": (
                {
                    "success": last.success,
                    "duration_ms": last.duration_ms,
                    "queries_analyzed": last.queries_analyzed,
                    "clusters": last.clusters,
                    "priority_gaps": last.priority_gaps,
                    "report_id": last.report_id,
                    "error": last.error,
                }
                if last else None
            ),
            "pytest_detected": _running_under_pytest(),
        }


# ---------------------------------------------------------------------------
# Module-level singleton (used by ``main.py`` startup event)
# ---------------------------------------------------------------------------

_default_scheduler: Optional[GapScheduler] = None
_default_lock = threading.Lock()


def get_default_scheduler() -> GapScheduler:
    global _default_scheduler
    with _default_lock:
        if _default_scheduler is None:
            _default_scheduler = GapScheduler()
        return _default_scheduler


def reset_default_scheduler() -> None:
    """Drop the singleton.  Tests use this between cases."""
    global _default_scheduler
    with _default_lock:
        if _default_scheduler is not None:
            try:
                _default_scheduler.stop()
            except Exception:
                pass
        _default_scheduler = None


# Convenience aliases that bind to the singleton AT IMPORT TIME.
# They are re-bound whenever reset_default_scheduler() is called by
# tests via the property functions below.
def _bind_singleton_aliases() -> None:
    """Refresh module-level shortcuts against the current singleton."""
    global run_now, invalidate_cache, state
    s = get_default_scheduler()
    run_now = s.run_now           # type: ignore[assignment]
    invalidate_cache = s.invalidate_cache       # type: ignore[assignment]
    state = s.state               # type: ignore[assignment]


_bind_singleton_aliases()


__all__ = [
    "SchedulerConfig",
    "GapScheduler",
    "RunResult",
    "run_once",
    "get_default_scheduler",
    "reset_default_scheduler",
    "config_passes_basic_guards",
    "is_worker_leader",
]