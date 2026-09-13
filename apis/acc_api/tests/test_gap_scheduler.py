"""
Unit tests for ``apis/acc_api/gap_scheduler.py``.

These tests focus on the operational guard surface: env-var parsing,
disabled behaviour, test-environment refusal, multi-worker gating,
and the ``run_once`` plumbing around the detector.

The tests never touch a real MongoDB or SentenceTransformer; they
inject a ``collection_provider`` and an ``embed_fn`` so the scheduler
logic can be exercised in isolation.  ``build_gap_report`` is also
stubbed so we don't reach the real detector.
"""

from __future__ import annotations

import importlib
import os
import sys
from typing import Any
from unittest.mock import MagicMock

import numpy as np
import pytest


# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(__file__)
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
_APIS = os.path.abspath(os.path.join(_HERE, ".."))
if _APIS not in sys.path:
    sys.path.insert(0, _APIS)


# ---------------------------------------------------------------------------
# Env-var helpers
# ---------------------------------------------------------------------------

_SCHEDULER_KEYS = (
    "GDB_SCHEDULER_ENABLED",
    "GDB_SCHEDULER_FORCE_DISABLE",
    "GDB_SCHEDULER_CRON",
    "GDB_SCHEDULER_LOOKBACK_DAYS",
    "GDB_SCHEDULER_SIMILARITY_THRESHOLD",
    "GDB_SCHEDULER_MIN_SAMPLES",
    "GDB_REPORT_CACHE_TTL",
    "GDB_SCHEDULER_WORKER_ID",
    "GDB_SCHEDULER_LEADER_WORKERS",
    "MONGO_URI",
    "PYTEST_CURRENT_TEST",
)


@pytest.fixture(autouse=True)
def _clean_scheduler_env(monkeypatch):
    """Wipe scheduler env vars before each test and reload modules."""
    for key in _SCHEDULER_KEYS:
        monkeypatch.delenv(key, raising=False)

    # Drop and re-import both modules so module-level ``load_dotenv``
    # picks up the freshly-cleared environment.
    for name in ("gap_scheduler", "gap_metrics"):
        if name in sys.modules:
            del sys.modules[name]
    import gap_metrics  # noqa: F401
    import gap_scheduler  # noqa: F401
    yield


def _import_scheduler():
    """Re-import the scheduler module."""
    if "gap_scheduler" in sys.modules:
        return importlib.reload(sys.modules["gap_scheduler"])
    return importlib.import_module("gap_scheduler")


# ---------------------------------------------------------------------------
# Configuration tests
# ---------------------------------------------------------------------------

class TestSchedulerConfig:

    def test_defaults_when_nothing_set(self):
        gap_scheduler = _import_scheduler()
        cfg = gap_scheduler.SchedulerConfig.from_env()
        assert cfg.enabled is False
        assert cfg.force_disable is False
        assert cfg.cron == "0 2 * * 1"
        assert cfg.lookback_days == 90
        assert cfg.similarity_threshold == 0.85
        assert cfg.min_samples == 2
        assert cfg.cache_ttl_seconds == 900
        assert cfg.worker_id == 0
        assert cfg.leader_workers == (0,)

    def test_enabled_flag_from_env(self, monkeypatch):
        monkeypatch.setenv("GDB_SCHEDULER_ENABLED", "true")
        gap_scheduler = _import_scheduler()
        cfg = gap_scheduler.SchedulerConfig.from_env()
        assert cfg.enabled is True

    def test_force_disable_takes_precedence(self, monkeypatch):
        monkeypatch.setenv("GDB_SCHEDULER_ENABLED", "true")
        monkeypatch.setenv("GDB_SCHEDULER_FORCE_DISABLE", "true")
        gap_scheduler = _import_scheduler()
        cfg = gap_scheduler.SchedulerConfig.from_env()
        assert cfg.enabled is True
        assert cfg.force_disable is True
        ok, reason = gap_scheduler.config_passes_basic_guards(cfg)
        assert ok is False
        assert reason == "force_disable=true"

    def test_numeric_parsing_and_fallback(self, monkeypatch):
        monkeypatch.setenv("GDB_SCHEDULER_LOOKBACK_DAYS", "30")
        monkeypatch.setenv("GDB_SCHEDULER_SIMILARITY_THRESHOLD", "0.92")
        monkeypatch.setenv("GDB_SCHEDULER_MIN_SAMPLES", "5")
        monkeypatch.setenv("GDB_REPORT_CACHE_TTL", "600")
        monkeypatch.setenv("GDB_SCHEDULER_WORKER_ID", "2")
        monkeypatch.setenv("GDB_SCHEDULER_LEADER_WORKERS", "0,1,2")
        gap_scheduler = _import_scheduler()
        cfg = gap_scheduler.SchedulerConfig.from_env()
        assert cfg.lookback_days == 30
        assert cfg.similarity_threshold == 0.92
        assert cfg.min_samples == 5
        assert cfg.cache_ttl_seconds == 600
        assert cfg.worker_id == 2
        assert cfg.leader_workers == (0, 1, 2)

    def test_invalid_numeric_falls_back_with_warning(self, monkeypatch):
        monkeypatch.setenv("GDB_SCHEDULER_LOOKBACK_DAYS", "not-a-number")
        monkeypatch.setenv("GDB_SCHEDULER_LEADER_WORKERS", "garbage")
        gap_scheduler = _import_scheduler()
        cfg = gap_scheduler.SchedulerConfig.from_env()
        assert cfg.lookback_days == 90
        assert cfg.leader_workers == (0,)

    def test_is_worker_leader_helper(self):
        gap_scheduler = _import_scheduler()
        cfg = gap_scheduler.SchedulerConfig(worker_id=0, leader_workers=(0,))
        assert gap_scheduler.is_worker_leader(cfg) is True
        cfg2 = gap_scheduler.SchedulerConfig(worker_id=1, leader_workers=(0,))
        assert gap_scheduler.is_worker_leader(cfg2) is False

    def test_config_basic_guards(self):
        gap_scheduler = _import_scheduler()
        # Disabled by default.
        cfg = gap_scheduler.SchedulerConfig()
        ok, reason = gap_scheduler.config_passes_basic_guards(cfg)
        assert ok is False and reason == "enabled=false"

        # Force disable is reported separately.
        cfg2 = gap_scheduler.SchedulerConfig(enabled=True, force_disable=True)
        ok, reason = gap_scheduler.config_passes_basic_guards(cfg2)
        assert ok is False and reason == "force_disable=true"

        # Out-of-range similarity threshold fails.
        cfg3 = gap_scheduler.SchedulerConfig(enabled=True,
                                             similarity_threshold=1.5)
        ok, reason = gap_scheduler.config_passes_basic_guards(cfg3)
        assert ok is False and "similarity_threshold" in reason

        # Out-of-range min_samples fails.
        cfg4 = gap_scheduler.SchedulerConfig(enabled=True, min_samples=0)
        ok, reason = gap_scheduler.config_passes_basic_guards(cfg4)
        assert ok is False and "min_samples" in reason

        # Lookback must be >= 1.
        cfg5 = gap_scheduler.SchedulerConfig(enabled=True, lookback_days=0)
        ok, reason = gap_scheduler.config_passes_basic_guards(cfg5)
        assert ok is False and "lookback_days" in reason

        # Non-leader worker fails.
        cfg6 = gap_scheduler.SchedulerConfig(enabled=True, worker_id=3,
                                             leader_workers=(0,))
        ok, reason = gap_scheduler.config_passes_basic_guards(cfg6)
        assert ok is False and "worker_id" in reason

        # The happy path.
        ok, _ = gap_scheduler.config_passes_basic_guards(
            gap_scheduler.SchedulerConfig(enabled=True))
        assert ok is True


# ---------------------------------------------------------------------------
# Disabled behaviour tests
# ---------------------------------------------------------------------------

class TestSchedulerDisabled:

    def test_start_is_noop_when_enabled_flag_is_false(self, monkeypatch):
        monkeypatch.setenv("GDB_SCHEDULER_ENABLED", "false")
        gap_scheduler = _import_scheduler()
        s = gap_scheduler.GapScheduler()
        assert s.start() is False
        assert s.state()["running"] is False
        s.stop()

    def test_start_skips_in_test_environment(self, monkeypatch):
        monkeypatch.setenv("GDB_SCHEDULER_ENABLED", "true")
        monkeypatch.setenv("PYTEST_CURRENT_TEST",
                          "test_gap_scheduler.py::test_x")
        gap_scheduler = _import_scheduler()
        s = gap_scheduler.GapScheduler()
        assert s.start() is False
        assert s.state()["pytest_detected"] is True
        s.stop()

    def test_start_skips_on_non_leader_worker(self, monkeypatch):
        monkeypatch.setenv("GDB_SCHEDULER_ENABLED", "true")
        monkeypatch.setenv("GDB_SCHEDULER_WORKER_ID", "3")
        monkeypatch.setenv("GDB_SCHEDULER_LEADER_WORKERS", "0,1")
        gap_scheduler = _import_scheduler()
        s = gap_scheduler.GapScheduler()
        assert s.start() is False
        s.stop()


# ---------------------------------------------------------------------------
# run_once plumbing
# ---------------------------------------------------------------------------

class _FakeCollection:
    def __init__(self, *a, **kw):
        pass


def _fake_embed_fn(texts):
    """A no-frills deterministic embed function."""
    return np.zeros((len(texts), 8), dtype=np.float32)


def _install_stub_build_gap_report(monkeypatch, return_value: dict | None = None,
                                   raises: Exception | None = None):
    gap_scheduler = _import_scheduler()

    if return_value is None:
        return_value = {
            "report_id": "stub-report",
            "total_queries_analyzed": 7,
            "total_clusters_found": 3,
            "gaps_by_priority": {
                "critical": 1, "high": 1, "medium": 1, "low": 0,
            },
            "clusters": [],
        }

    if raises is None:
        def _stub(*args, **kwargs):
            return dict(return_value)
        stub = MagicMock(side_effect=_stub)
    else:
        stub = MagicMock(side_effect=raises)

    monkeypatch.setattr(gap_scheduler, "build_gap_report", stub)
    return gap_scheduler, stub


class TestRunOnce:

    def test_run_once_calls_build_gap_report_with_correct_kwargs(self, monkeypatch):
        gap_scheduler, stub = _install_stub_build_gap_report(monkeypatch)

        result = gap_scheduler.run_once(
            trigger="manual",
            collection_provider=lambda: (_FakeCollection(), _FakeCollection(),
                                         _FakeCollection()),
            similarity_threshold=0.9,
            min_samples=3,
            lookback_days=42,
            embed_fn=_fake_embed_fn,
        )

        assert result.success is True
        assert stub.call_count == 1
        kwargs = stub.call_args.kwargs
        assert kwargs["similarity_threshold"] == 0.9
        assert kwargs["min_samples"] == 3
        assert kwargs["lookback_days"] == 42
        assert result.queries_analyzed == 7
        assert result.clusters == 3
        assert result.priority_gaps == {"critical": 1, "high": 1,
                                        "medium": 1, "low": 0}
        assert result.report_id == "stub-report"

    def test_run_once_records_metrics(self, monkeypatch):
        gap_scheduler, _ = _install_stub_build_gap_report(monkeypatch)

        events: list[tuple[str, dict]] = []
        gap_metrics = sys.modules["gap_metrics"]
        gap_metrics.register_backend(lambda n, p: events.append((n, p)))

        try:
            gap_scheduler.run_once(
                trigger="manual",
                collection_provider=lambda: (_FakeCollection(), _FakeCollection(),
                                             _FakeCollection()),
                embed_fn=_fake_embed_fn,
            )

            names = {n for n, _ in events}
            assert "gap_report_start" in names
            assert "gap_report_run" in names

            run_payload = next(p for n, p in events if n == "gap_report_run")
            assert run_payload["success"] is True
            assert run_payload["queries_analyzed"] == 7
            assert run_payload["clusters"] == 3
            assert run_payload["trigger"] == "manual"
            assert run_payload["priority_gaps"]["critical"] == 1
            assert run_payload["duration_ms"] >= 0
        finally:
            gap_metrics.clear_backends()

    def test_run_once_records_failure_when_detector_raises(self, monkeypatch):
        gap_scheduler, _ = _install_stub_build_gap_report(
            monkeypatch, raises=RuntimeError("synthetic boom"))

        events: list[tuple[str, dict]] = []
        gap_metrics = sys.modules["gap_metrics"]
        gap_metrics.register_backend(lambda n, p: events.append((n, p)))

        try:
            result = gap_scheduler.run_once(
                trigger="manual",
                collection_provider=lambda: (_FakeCollection(), _FakeCollection(),
                                             _FakeCollection()),
                embed_fn=_fake_embed_fn,
            )
            assert result.success is False
            assert "synthetic boom" in (result.error or "")

            names = {n for n, _ in events}
            assert "gap_report_failure" in names
            fail_payload = next(p for n, p in events if n == "gap_report_failure")
            assert "synthetic boom" in fail_payload["error"]
        finally:
            gap_metrics.clear_backends()

    def test_run_now_bypasses_scheduler_guards(self, monkeypatch):
        """``GapScheduler.run_now`` must always execute a pass, even when
        the scheduler is disabled."""
        gap_scheduler, _ = _install_stub_build_gap_report(monkeypatch)

        s = gap_scheduler.GapScheduler()  # disabled by default
        assert s.state()["running"] is False
        # Inject a provider + embed_fn by monkeypatching run_once.
        monkeypatch.setattr(s, "_collection_provider",
                            lambda: (_FakeCollection(), _FakeCollection(),
                                     _FakeCollection()))

        # ``_embed_fn`` is a factory that returns the embed function; wrap
        # the bare function so ``run_once`` sees a callable when it invokes
        # the factory.
        monkeypatch.setattr(gap_scheduler, "_embed_fn", lambda: _fake_embed_fn)

        result = s.run_now()
        assert result.success is True


# ---------------------------------------------------------------------------
# Metrics bus tests
# ---------------------------------------------------------------------------

class TestMetricsBus:

    def test_register_and_emit(self):
        gap_metrics = sys.modules["gap_metrics"]
        gap_metrics.clear_backends()

        received: list[tuple[str, dict]] = []
        gap_metrics.register_backend(lambda n, p: received.append((n, p)))

        gap_metrics.record_start(trigger="manual")
        gap_metrics.record_skip(reason="disabled")
        gap_metrics.record_failure(duration_ms=10.0, trigger="scheduled",
                                   error="boom")
        gap_metrics.record_run(duration_ms=42.0, queries_analyzed=3,
                               clusters=1, priority_gaps={"high": 1},
                               trigger="manual", success=True)

        names = {n for n, _ in received}
        assert names == {
            "gap_report_start",
            "gap_report_skip",
            "gap_report_failure",
            "gap_report_run",
        }

        fail = next(p for n, p in received if n == "gap_report_failure")
        assert fail["error"] == "boom"
        assert fail["trigger"] == "scheduled"
        assert fail["duration_ms"] == 10.0

    def test_backend_failure_is_swallowed(self):
        gap_metrics = sys.modules["gap_metrics"]
        gap_metrics.clear_backends()

        def boom(name, payload):
            raise RuntimeError("backend exploded")

        gap_metrics.register_backend(boom)
        # Must not raise even though the backend is broken.
        gap_metrics.record_start(trigger="x")
        gap_metrics.clear_backends()


# ---------------------------------------------------------------------------
# Singleton aliases
# ---------------------------------------------------------------------------

class TestSingletonAliases:

    def test_get_default_scheduler_returns_singleton(self):
        gap_scheduler = _import_scheduler()
        gap_scheduler.reset_default_scheduler()
        a = gap_scheduler.get_default_scheduler()
        b = gap_scheduler.get_default_scheduler()
        assert a is b
        gap_scheduler.reset_default_scheduler()


# ---------------------------------------------------------------------------
# Cron parser
# ---------------------------------------------------------------------------

class TestCronParser:
    """Cover ``_parse_cron`` directly.  The parser is the operator's
    only source of truth about what cadences the in-process scheduler
    will honour.  Every supported subset (weekly, daily) and every
    malformed input we know about must round-trip exactly."""

    def test_parse_weekly_monday_default(self):
        gap_scheduler = _import_scheduler()
        minute, hour, dom, month, dow = gap_scheduler._parse_cron("0 2 * * 1")
        assert minute == 0
        assert hour == 2
        assert dom == "*"
        assert month == "*"
        assert dow == "1"

    def test_parse_daily_cron(self):
        gap_scheduler = _import_scheduler()
        minute, hour, _dom, _month, dow = gap_scheduler._parse_cron("30 14 * * *")
        assert minute == 30 and hour == 14 and dow == "*"

    def test_parse_with_extra_fields_raises(self):
        gap_scheduler = _import_scheduler()
        with pytest.raises(ValueError):
            gap_scheduler._parse_cron("0 2 * * 1 *")

    def test_parse_with_too_few_fields_raises(self):
        gap_scheduler = _import_scheduler()
        with pytest.raises(ValueError):
            gap_scheduler._parse_cron("0 2 * 1")


# ---------------------------------------------------------------------------
# Scheduled trigger path
# ---------------------------------------------------------------------------

class TestScheduledTrigger:
    """When the ``schedule`` library fires a tick, the scheduler must
    invoke ``run_once`` with ``trigger='scheduled'`` (not 'manual')."""

    def test_schedule_weekly_job_registers_a_job(self, monkeypatch):
        gap_scheduler = _import_scheduler()
        sentinel = object()

        # Fake out the embedded 'schedule' library so we don't depend on
        # the real package behaving the way we expect on the test host.
        # The production code path is:
        #   _schedule.every().<day>.at(time).do(fn)
        # so the fake has to support attribute access for any day-of-week.
        calls: dict = {}

        class _Doer:
            def __init__(self):
                pass

            def do(self, fn):
                calls.setdefault("do_fn", []).append(fn)
                return sentinel

        class _DayAtBuilder:
            def __init__(self, day):
                calls.setdefault("day_calls", []).append(day)

            def at(self, time_str):
                calls.setdefault("at_calls", []).append(time_str)
                return _Doer()

        class _Every:
            def __getattr__(self, name):
                return _DayAtBuilder(name)

        class _FakeSchedule:
            def every(self):
                calls.setdefault("every", 0)
                calls["every"] += 1
                return _Every()

        fake = _FakeSchedule()
        monkeypatch.setattr(gap_scheduler, "_schedule", fake, raising=False)
        monkeypatch.setattr(gap_scheduler, "_schedule_ok", True, raising=False)

        def _runner():
            return "ran"

        gap_scheduler._schedule_weekly_job("0 2 * * 1", _runner)
        # 1 call to every(), the dow branch ("monday") was selected,
        # .at() was called with "02:00", and .do() received our runner.
        assert calls["every"] == 1
        assert calls["day_calls"] == ["monday"]
        assert calls["at_calls"] == ["02:00"]
        assert calls["do_fn"] == [_runner]
        assert calls["do_fn"][0] is _runner

    def test_tick_invokes_run_once_with_trigger_scheduled(self, monkeypatch):
        """``GapScheduler._tick`` must dispatch into ``run_once`` with
        ``trigger='scheduled'`` so the structured-log trigger field
        distinguishes manual hits from scheduled ones.
        """
        gap_scheduler = _import_scheduler()
        scheduler = gap_scheduler.GapScheduler(
            config=gap_scheduler.SchedulerConfig(enabled=False),
        )

        captured: dict = {}

        def fake_run_once(**kwargs):
            captured.update(kwargs)
            return gap_scheduler.RunResult(
                success=True,
                duration_ms=0,
                queries_analyzed=0,
                clusters=0,
                priority_gaps={},
                report_id=None,
                error=None,
            )

        # The module-level ``run_once`` is what ``_tick`` calls.
        monkeypatch.setattr(gap_scheduler, "run_once", fake_run_once)
        scheduler._tick()
        assert captured["trigger"] == "scheduled"


# ---------------------------------------------------------------------------
# run-now endpoint behaviour (no auth wired yet)
# ---------------------------------------------------------------------------


class TestRunNowEndpointShape:
    """Smoke-test the JSON shape returned by the ``/gdb/scheduler/run-now``
    endpoint via FastAPI's TestClient, ensuring the auth dependency
    doesn't block us when the env var is set.

    The ``main`` module creates a ``MongoClient`` at import time.  We
    stub ``pymongo.MongoClient`` *before* the import runs so the test
    process never reaches a real Mongo server.
    """

    def _build_client(self, monkeypatch, token_value):
        if token_value is None:
            monkeypatch.delenv("GDB_SCHEDULER_ADMIN_TOKEN", raising=False)
        else:
            monkeypatch.setenv("GDB_SCHEDULER_ADMIN_TOKEN", token_value)
        monkeypatch.setenv("GDB_SCHEDULER_ENABLED", "false")
        monkeypatch.setenv("GDB_SCHEDULER_FORCE_DISABLE", "true")

        # Stub MongoClient at the module level so ``from pymongo import
        # MongoClient`` in main.py sees our placeholder.
        class _StubClient:
            def __init__(self, *a, **kw):
                pass

            def __getitem__(self, name):
                class _DB:
                    def __getitem__(self, coll):
                        class _Coll:
                            def find(self, *a, **kw):
                                return iter([])

                            def count_documents(self, *a, **kw):
                                return 0

                            def aggregate(self, *a, **kw):
                                return []
                        return _Coll()
                return _DB()

            def close(self):
                pass

        monkeypatch.setattr("pymongo.MongoClient", _StubClient)

        # Drop main from sys.modules so a fresh import sees our stub.
        for name in ("gap_scheduler_auth", "main"):
            if name in sys.modules:
                del sys.modules[name]

        from fastapi.testclient import TestClient
        import main  # noqa: F401
        # conftest installs a stub for ``sentence_transformers`` whose
        # constructor raises; if the endpoint reaches ``_get_model`` it
        # will explode with the stub's RuntimeError.  Patch the loader
        # to a no-op that returns a stand-in object.
        class _FakeModel:
            def encode(self, texts, **_):
                import numpy as _np
                return _np.zeros((len(texts), 8), dtype=_np.float32)

        monkeypatch.setattr(main, "_get_model", lambda: _FakeModel())
        from main import app
        return TestClient(app)

    def test_run_now_requires_token_when_configured(self, monkeypatch):
        c = self._build_client(monkeypatch, "secret-token")
        with c as client:
            r = client.post("/gdb/scheduler/run-now")
            assert r.status_code == 401

    def test_run_now_with_correct_token_returns_200_shape(self, monkeypatch):
        c = self._build_client(monkeypatch, "secret-token")
        with c as client:
            r = client.post(
                "/gdb/scheduler/run-now",
                headers={"Authorization": "Bearer secret-token"},
            )
            # The scheduler is force-disabled in this test, so the run is
            # skipped — run_now returns success=False with a reason.
            assert r.status_code == 200
            payload = r.json()
            for key in ("success", "duration_ms", "queries_analyzed",
                        "clusters", "priority_gaps", "report_id", "error"):
                assert key in payload

    def test_state_endpoint_requires_token(self, monkeypatch):
        c = self._build_client(monkeypatch, "secret-token")
        with c as client:
            r = client.get("/gdb/scheduler/state")
            assert r.status_code == 401
            assert r.headers.get("www-authenticate", "").lower() == "bearer"

    def test_state_endpoint_returns_503_when_token_unset(self, monkeypatch):
        c = self._build_client(monkeypatch, None)
        with c as client:
            r = client.get("/gdb/scheduler/state")
            assert r.status_code == 503