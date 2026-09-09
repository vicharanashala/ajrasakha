# GDB Gap-Detector – Visual Demo

A self-contained FastAPI demo that runs the **real** `gdb_gap_detector`
module against a mock `FakeCollection` (no MongoDB, no embedding model,
no Firebase auth required) and serves an interactive HTML dashboard.

## Run it

```powershell
cd apis/acc_api
./.venv/Scripts/python.exe demo/run_demo.py --port 8765
# open http://localhost:8765/   (script auto-opens the browser unless --no-browser)
```

The server listens on `127.0.0.1:8765`.

## What it exposes

| Method | Path                              | What it does                                  |
| ------ | --------------------------------- | --------------------------------------------- |
| GET    | `/`                               | Self-contained interactive dashboard          |
| POST   | `/gdb/gap-report`                 | Returns the cached/rerun gap report (JSON)    |
| POST   | `/gdb/gap-report`  `{"refresh":true}` | Forces a fresh detection pass               |
| GET    | `/gdb/scheduler/state`            | Scheduler status (running, last_run, history) |
| POST   | `/gdb/scheduler/run-now`          | Manually triggers a detection pass            |
| POST   | `/gdb/scheduler/invalidate-cache` | Drops the in-memory cache                     |
| POST   | `/api/acc/gdb/gap-report`         | Same report under the production contract     |
| GET    | `/docs`                           | FastAPI auto-generated Swagger UI             |

## How it works

* `run_demo.py` – FastAPI app, mounts `dashboard.html` at `/` and the
  four `/gdb/*` endpoints.  At import time it pins the detector's
  thresholds (`GDB_MIN_QUERIES=2`, `GDB_PRIORITY_MAX_DEMAND=20`, ...) to
  values tuned for the small demo corpus so you see a full priority
  spread instead of an all-"low" report.
* `sample_data.py` – Builds two in-memory corpora:
  - **Reviewer questions** – ~130 paraphrased queries spanning 10
    agricultural themes (wheat rust control, PM-Kisan, drip-irrigation
    subsidy, …).
  - **Golden QA corpus** – `{theme_id: [entries]}` map keyed by cluster
    theme id so the coverage bands land as a balanced mix:
      - 6 entries → **STRONG** (wheat rust / Punjab)
      - 3 entries → **PARTIAL** (PM-Kisan)
      - 2 entries → **PARTIAL** (paddy / Bihar)
      - 1 entry each → **PARTIAL** (drip-irrigation, soil-health-card)
      - 0 entries → **GAP** (cotton bollworm, tomato leaf-curl, mustard,
        mango, noise) – these are the right-hand candidates the demo
        wants you to add.
* `_write_dashboard.py` – Generates the static HTML/CSS/JS asset
  `dashboard.html` from 5 raw `r"""…"""` chunks so the editor tool
  doesn't need to ship 14 KB of HTML in one shot.  Re-run it after
  editing any chunk:
  ```bash
  python demo/_write_dashboard.py    # rewrites demo/dashboard.html
  ```

## Expected output (on a cold cache)

```
gap report:        130 queries → 27 clusters
gap priorities:    critical=2, high=3, medium=19, low=3
coverage bands:    STRONG=5, PARTIAL=11, GAP=11
duration:          ~15-20 ms (in-process)
```

## What to look for in the dashboard

1. **KPI strip** – total queries, clusters, counts per priority band,
   current/previous demand.
2. **Top 10 priority gaps** table with growth %, crop(s), state(s),
   GDB coverage band, suggested action.
3. **Coverage bands** – STRONG (wheat rust), PARTIAL (PM-Kisan, etc.),
   GAP (cotton, tomato, …).
4. **Recommendations** – every gap that fell into the GAP band.
5. **Full cluster list** sorted by `priority_score` descending – lets
   you see the long-tail of medium/low clusters.
6. **Scheduler card** – live-updates every 8 s, "Run now" button forces
   a fresh pass, "Invalidate cache" drops the in-memory cache.

## Zero external dependencies

* No MongoDB    – `sample_data.FakeCollection` mirrors the cursor
  operators (`find`, `aggregate`, `$regex`, …) that `gdb_gap_detector`
  actually uses.
* No embedding model – a deterministic *bigram-bag* embedder substitutes
  for `sentence-transformers` so the demo runs offline.
* No Firebase auth – the FastAPI layer is unauthenticated (matches the
  read-only `/gdb/gap-report` surface used by the dashboard).
