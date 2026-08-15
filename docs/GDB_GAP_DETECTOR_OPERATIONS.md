# GDB Gap-Detector Scheduler — Operator Runbook

This document explains how operators interact with the **real** GDB
gap-detector scheduler that lives in `apis/acc_api/gap_scheduler.py` and
`apis/acc_api/gap_metrics.py`.  It also calls out, in plain language,
what still has to be wired up at deployment time before the weekly run
is actually firing in production.

> **Status:** the scheduler module, configuration, guards, structured
> logs, metrics bus, admin endpoints, and unit tests are in place and
> green.  **Weekly production execution is *not* enabled until the
> deployment checklist at the bottom of this doc is finished.**

---

## 1. What ships in this change set

| Area | File | Status |
| --- | --- | --- |
| Scheduler module + config + guards | `apis/acc_api/gap_scheduler.py` | ✅ implemented |
| Structured logging | `apis/acc_api/gap_scheduler.py` | ✅ implemented |
| Lightweight metrics bus | `apis/acc_api/gap_metrics.py` | ✅ implemented |
| Admin / operator endpoints | `apis/acc_api/main.py` (`/gdb/scheduler/*`) | ✅ implemented |
| Bearer-token auth dependency | `apis/acc_api/gap_scheduler_auth.py` | ✅ implemented |
| FastAPI startup hook | `apis/acc_api/main.py` | ✅ implemented (guarded) |
| Unit tests (config, guards, auth, endpoints) | `apis/acc_api/tests/test_gap_scheduler*.py` | ✅ 38 tests passing |
| `.env.example` entries | `apis/acc_api/.env.example` | ✅ updated |
| Requirements pin | `apis/acc_api/requirements.txt` (`schedule>=1.2,<3.0`) | ✅ updated |
| Operational Prometheus export (optional) | TBD — see checklist below | ⏳ not yet wired |
| Real deployment configuration | TBD — see checklist below | ⏳ not yet done |

---

## 2. Environment variables

All scheduler knobs are read from environment variables (see
`SchedulerConfig.from_env` in `gap_scheduler.py`).  Defaults are
**safe-by-default** — the scheduler does nothing unless you
explicitly opt in.

| Variable | Default | Meaning |
| --- | --- | --- |
| `GDB_SCHEDULER_ENABLED` | `false` | Master switch.  Set to `true` to let the in-process scheduler tick. |
| `GDB_SCHEDULER_FORCE_DISABLE` | `false` | Hard kill switch — overrides `GDB_SCHEDULER_ENABLED`.  Used by tests, CI, and emergency stop. |
| `GDB_SCHEDULER_CRON` | `0 2 * * 1` | Five-field cron expression (`minute hour day-of-month month day-of-week`).  Default = Mondays 02:00. |
| `GDB_SCHEDULER_LOOKBACK_DAYS` | `90` | Window of queries analysed by `build_gap_report`. |
| `GDB_SCHEDULER_SIMILARITY_THRESHOLD` | `0.85` | Cosine threshold fed to the clusterer. |
| `GDB_SCHEDULER_MIN_SAMPLES` | `2` | Minimum queries per cluster to qualify as a gap. |
| `GDB_REPORT_CACHE_TTL` | `900` | Frontend cache TTL in seconds (also used by `/gdb/gap-report`). |
| `GDB_SCHEDULER_WORKER_ID` | `0` | This worker's zero-based index. |
| `GDB_SCHEDULER_LEADER_WORKERS` | `0` | Comma-separated worker IDs that are allowed to run the scheduler. |
| `GDB_SCHEDULER_ADMIN_TOKEN` | *(unset)* | Bearer token required to call `/gdb/scheduler/*`.  When unset, those endpoints return 503 (fail-closed). |

### Multi-worker safety

Only workers whose id is in `GDB_SCHEDULER_LEADER_WORKERS` will start
the scheduler.  In a typical 3-worker Gunicorn deployment:

```
GDB_SCHEDULER_ENABLED=true
GDB_SCHEDULER_WORKER_ID=0   # set per process in systemd unit / docker-compose
GDB_SCHEDULER_LEADER_WORKERS=0
```

For higher availability, run two leaders:

```
GDB_SCHEDULER_LEADER_WORKERS=0,1
```

…with `WORKER_ID` set to `0` in process A and `1` in process B.  The
in-process scheduler will only tick in those two processes.

### Test-environment safety

`GapScheduler.start()` inspects `PYTEST_CURRENT_TEST`.  When pytest is
running, the scheduler refuses to start even if
`GDB_SCHEDULER_ENABLED=true`.  Tests prove this behaviour in
`test_start_skips_in_test_environment`.

---

## 3. Endpoints

All admin endpoints live under `/gdb/scheduler/*` and require the
bearer token.  The dependency is in `gap_scheduler_auth.py`; behaviour
is locked down by `tests/test_gap_scheduler_auth.py`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET`  | `/gdb/scheduler/state`        | Returns running flag, last-run stats, next-run time, skip reasons, leadership. |
| `POST` | `/gdb/scheduler/run-now`      | Triggers a single pass synchronously.  Bypasses the disabled/pytest guards but still logs and records metrics. |
| `POST` | `/gdb/scheduler/invalidate-cache` | Clears the in-memory cache so the next `/gdb/gap-report` re-fetches from MongoDB. |

### Calling the endpoints

```bash
# State
curl -H "Authorization: Bearer $GDB_SCHEDULER_ADMIN_TOKEN" \
     https://api.example.com/gdb/scheduler/state

# Manual report run
curl -X POST -H "Authorization: Bearer $GDB_SCHEDULER_ADMIN_TOKEN" \
     https://api.example.com/gdb/scheduler/run-now

# Cache invalidation
curl -X POST -H "Authorization: Bearer $GDB_SCHEDULER_ADMIN_TOKEN" \
     https://api.example.com/gdb/scheduler/invalidate-cache
```

`run-now` returns JSON with `success`, `duration_ms`,
`queries_analyzed`, `clusters`, `priority_gaps`, `report_id`, and
`error`.  If the scheduler is force-disabled, `run-now` still returns
200 with `success=false` and a human-readable `error` reason.

---

## 4. Structured logs

Every scheduler pass emits a log line on a dedicated logger named
`gap_scheduler` (and on `gap_metrics`).  Lines are JSON-friendly
key=value pairs:

| Event | When | Notable keys |
| --- | --- | --- |
| `gap_scheduler.start` | `start()` called | `enabled`, `pytest_detected`, `is_leader`, `force_disable`, `cron`, `worker_id` |
| `gap_scheduler.skip` | A tick is skipped | `reason` |
| `gap_scheduler.run.start` | Beginning a pass | `trigger` (`scheduled` / `manual`), `lookback_days`, `similarity_threshold`, `min_samples` |
| `gap_scheduler.run.success` | Pass succeeded | `trigger`, `duration_ms`, `queries_analyzed`, `clusters`, `priority_gaps`, `report_id` |
| `gap_scheduler.run.failure` | Pass raised | `trigger`, `duration_ms`, `error` |
| `gap_scheduler.stop` | `stop()` called | `running` |

Inspecting logs in production:

```bash
# Last 100 scheduler events
journalctl -u acc-api -n 1000 | grep gap_scheduler

# All runs since boot
journalctl -u acc-api --since today | grep gap_scheduler.run
```

---

## 5. Metrics

`gap_metrics.py` is a tiny in-process bus.  Each scheduler pass fires
the following metric names:

- `gap_report_start`
- `gap_report_skip`
- `gap_report_run`
- `gap_report_failure`

Payloads always include `duration_ms` and `trigger`.  Successful runs
add `queries_analyzed`, `clusters`, and `priority_gaps.{critical,high,medium,low}`.

### Integrating with the existing monitoring stack

The repo's monitoring stack lives in `monitoring/` (Prometheus +
Grafana).  The scheduler's metrics are intentionally backend-agnostic
— wire them in by registering an exporter on startup.  Suggested
approach (not yet wired — see checklist below):

```python
from gap_metrics import register_backend

def prometheus_backend(name, payload):
    if name == "gap_report_run":
        REPORT_DURATION.observe(payload["duration_ms"] / 1000)
        REPORT_QUERIES.set(payload["queries_analyzed"])
        REPORT_CLUSTERS.set(payload["clusters"])
        # ... map priority gaps to labelled counters ...

register_backend(prometheus_backend)
```

Until that wiring is added, the JSON log lines from §4 are the
authoritative source of truth.

---

## 6. Running a report manually

There are three options, listed from most to least recommended.

1. **Production API** (no downtime, audit-friendly):

   ```bash
   curl -X POST -H "Authorization: Bearer $TOKEN" \
        https://api.example.com/gdb/scheduler/run-now
   ```

2. **Inside the running container** (use sparingly; bypasses the
   token gate):

   ```bash
   docker exec -it acc-api python -c "
     import asyncio, gap_scheduler
     from main import reviewer_client  # imported by the app
     print(asyncio.run(gap_scheduler.run_once.__wrapped__('manual', ...)))"
   ```

   In practice prefer the endpoint.

3. **One-off CLI** (used during bring-up; needs `MONGO_URI`):

   ```bash
   MONGO_URI=... python -c "
   import asyncio, gap_scheduler
   asyncio.run(gap_scheduler.run_once(
       trigger='manual',
       collection_provider=lambda: (
           reviewer_client['ajrasakha']['answer_reviews'],
           reviewer_client['ajrasakha']['golden_faqs'],
           reviewer_client['ajrasakha']['queries'],
       ),
       embed_fn=embed_fn,
   ))"
   ```

---

## 7. Invalidating the cache

The frontend reads the gap report from `/gdb/gap-report`, which
caches results in memory for `GDB_REPORT_CACHE_TTL` seconds.  To force
a re-fetch after a manual run:

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
     https://api.example.com/gdb/scheduler/invalidate-cache
```

The endpoint is also called automatically after a successful
scheduled run.

---

## 8. Enabling scheduled runs

Two conditions must both be true:

1. **`GDB_SCHEDULER_ENABLED=true`** in the deployed `.env` /
   `docker-compose.yml` / k8s `ConfigMap`.
2. **`GDB_SCHEDULER_FORCE_DISABLE` is unset or `false`.**

Additionally:

- The process must be running under **pytest-free** conditions
  (production, staging).
- The process's `WORKER_ID` must be in `LEADER_WORKERS`.

`start()` logs the final decision (`gap_scheduler.start` /
`gap_scheduler.skip`).  If you don't see a `start` line within a
minute of boot, inspect the `skip` reason — it will be one of:

- `enabled=false`
- `force_disable=true`
- `pytest detected`
- `worker_id=N not in leaders (...)`
- `similarity_threshold out of range`
- `min_samples out of range`
- `lookback_days out of range`

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `gap_scheduler.start` line never appears | env vars not propagated to the running process | `docker exec acc-api env | grep GDB_` |
| `skip reason="force_disable=true"` | Hard kill switch is on | unset `GDB_SCHEDULER_FORCE_DISABLE` and restart |
| `skip reason="pytest detected"` | Running under pytest (should never happen in prod) | verify your process manager isn't running tests at boot |
| `skip reason="worker_id=N not in leaders (...)"` | Wrong worker index | set `GDB_SCHEDULER_WORKER_ID` per process |
| `failure error="SentenceTransformer must not be instantiated in tests…"` | Test harness reached prod code path | confirm you're not booting the API under pytest |
| `failure error="model not loaded"` / similar | Embedding model download/cache missing | ensure `sentence-transformers` cache dir is mounted |
| `/gdb/scheduler/state` returns 503 | `GDB_SCHEDULER_ADMIN_TOKEN` not set on the server | set the env var on the **server** (not the caller) |
| `/gdb/scheduler/state` returns 401 | Caller token mismatch | re-check the bearer token; query-string `?token=...` works as a fallback |
| Dashboard still shows stale data after `run-now` | Cache not invalidated | call `/gdb/scheduler/invalidate-cache` |
| Weekly run did not appear in logs at the expected time | Wrong timezone on host | cron is evaluated in the **process** timezone — set `TZ=UTC` for predictability |
| All queries `0`, clusters `0`, gaps `0` | `lookback_days` is too short, or `queries` collection is empty | bump `GDB_SCHEDULER_LOOKBACK_DAYS` and verify Mongo data |

### Quick health check

```bash
TOKEN=$GDB_SCHEDULER_ADMIN_TOKEN
API=https://api.example.com
curl -fsS -H "Authorization: Bearer $TOKEN" $API/gdb/scheduler/state | jq .
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" $API/gdb/scheduler/invalidate-cache
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" $API/gdb/scheduler/run-now | jq .
```

If `/state` returns `running: true` and `last_run.success: true`, the
scheduler is healthy.

---

## 10. Deployment checklist (still required before weekly production runs are real)

The code is **operationally ready** but it is **not yet deployed**.
Before you flip the weekly switch in production, the operator on call
must complete every item below.

- [ ] Set `GDB_SCHEDULER_ADMIN_TOKEN` in the production secrets store
      (long random string, kept secret from the frontend).
- [ ] Decide leader topology (typically worker 0 only, or workers 0+1
      for redundancy) and set `GDB_SCHEDULER_LEADER_WORKERS` plus per-
      process `GDB_SCHEDULER_WORKER_ID` in systemd unit /
      docker-compose / k8s Deployment.
- [ ] Set `GDB_SCHEDULER_ENABLED=true` and **remove**
      `GDB_SCHEDULER_FORCE_DISABLE` from the production environment.
- [ ] Confirm `MONGO_URI` is reachable from the API process and that
      the Mongo user has read access to `answer_reviews`, `golden_faqs`,
      and `queries`.
- [ ] Confirm the `sentence-transformers` model cache is provisioned
      (either pre-baked into the container image or mounted from a
      shared volume).  The first run will fail if the model cannot be
      downloaded.
- [ ] Set `TZ=UTC` on the API process so cron evaluations are
      timezone-stable.
- [ ] Wire the Prometheus exporter described in §5 (or accept the JSON
      log lines as the source of truth — either is fine, but pick one
      and document it).
- [ ] Add log shipping for the `gap_scheduler` logger to your log
      aggregator with the same fields shown in §4.
- [ ] Configure an external alerting rule: "no `gap_scheduler.run.success`
      line in the last 7 days" → page on-call.
- [ ] Run `curl POST /gdb/scheduler/run-now` once after deploy and
      confirm a 200 response with non-zero `queries_analyzed`.
- [ ] Verify the dashboard at `/gdb-gap-report` renders the new data
      after `/gdb/scheduler/invalidate-cache`.
- [ ] Remove `GDB_SCHEDULER_FORCE_DISABLE` from `.env.example` defaults
      if and only if you decide weekly runs should be on-by-default
      for *all* environments (current default is intentionally
      off-by-default).

Until every box above is ticked, the scheduler will log
`skip reason="enabled=false"` (or `"force_disable=true"`) and produce
no reports.  That is the correct, safe behaviour.