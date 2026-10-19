# Reviewer-System Locust Suite

This directory contains the load-testing harness that drives the
Ajrasakha reviewer backend through three scenarios — 1× baseline,
5× burst, and 10× overload — and asserts against the SLAs defined in
`results/sla_targets.md`.

## Layout

```
testing/locust/
├── __init__.py
├── locustfile_reviewer.py      # Entry point loaded by `locust -f`.
├── locust.conf                  # Locust config (process count, runtime).
├── requirements.txt             # Pinned deps.
├── helpers/
│   ├── assertions.py            # Locust event-listener + CSV writers.
│   ├── credentials.py           # CredentialPool drawn from `agriai_loadtest`.
│   └── payloads.py              # Request-body builders for every endpoint.
├── tasks/
│   ├── login.py                 # Force re-auth probe.
│   ├── allocated.py             # POST /api/questions/allocated variants.
│   ├── queue_details.py         # GET /api/questions/queue-details.
│   ├── submit_review.py         # POST /api/answers.
│   ├── approve_initial_answer.py
│   ├── allocate_experts.py      # POST /allocate-experts, /bulk-pae-allocate.
│   ├── moderator_approve.py     # POST /api/answers/moderator/approve.
│   ├── feedback_review.py       # POST /:qid/feedback-reviewer, /:qid/:fid/feedback-action.
│   ├── rebalance.py             # /reAllocateLessWorkload, /reallocate-timebound, /reallocate-manual.
│   ├── reroute.py               # POST /:qid/allocate-reroute-experts.
│   └── cosine_check.py          # POST /api/questions/check-duplicate.
├── users/
│   ├── reviewer.py              # Base HttpUser + auth + samplers.
│   └── roles.py                 # Per-role user classes.
└── scenarios/
    ├── 1x.py
    ├── 5x.py
    └── 10x.py
```

## Running

Pre-flight (see `testing/scripts/preflight.ps1`):

1. Mongo is **promoted to a single-node replica set** (the
   `/allocated` and `_withTransaction` paths require it).
2. The seed scripts (`testing/seed/seed_all.mjs`) have been run.
3. `pip install -r testing/locust/requirements.txt` completes.

Then:

```powershell
pwsh -File testing/scripts/run-locust-1x.ps1
pwsh -File testing/scripts/run-locust-5x.ps1   # heavy_allocate profile
pwsh -File testing/scripts/run-locust-10x.ps1  # squash_p95 profile
```

Each script writes its results to `results/<scenario>_locust/`.

## Output artefacts per scenario

| File                              | Producer                     | Consumer                           |
|-----------------------------------|------------------------------|------------------------------------|
| `requests.csv`                    | `helpers/assertions.py`      | `aggregate_results.py`             |
| `assertions.csv`                  | `helpers/assertions.py`      | `aggregate_results.py`             |
| `queue_lengths.csv`               | `helpers/assertions.py`      | bug-1195 regression                |
| `reputation_snapshots.csv`        | `helpers/assertions.py`      | `reconcile_reputation.py`          |
| `aggregated.csv`                  | `aggregate_results.py`       | `performance_report.md`            |
| `sla_summary.csv`                 | `aggregate_results.py`       | `performance_report.md`            |
| `reputation_drift.csv`            | `reconcile_reputation.py`    | `performance_report.md`            |

## Load profiles

The orchestrator supports four profiles via `LOAD_PROFILE`:

| Profile         | Boosts                                                                       |
|-----------------|------------------------------------------------------------------------------|
| `moderate`      | (default) even mix                                                            |
| `heavy_allocate`| PAE workload ×5  — drives the S2 allocator-budget breach                      |
| `squash_p95`    | Expert & Moderator weight ×5 — drives S2/S5 p95+error breach                  |
| `moderator_heap`| Moderator weight ×10 — drives S6 reputation-drift breach                      |

Pass `LOAD_PROFILE=...` to any of the three `run-locust-*.ps1` scripts
or `env LOAD_PROFILE=... python scenarios/<scenario>.py`.

## Environment variables

| Variable                          | Default                   | Notes                                       |
|-----------------------------------|---------------------------|---------------------------------------------|
| `LOCUST_HOST`                     | `http://localhost:3141`   | Backend origin                              |
| `DB_URL`                          | `mongodb://localhost:27017` | Mongo for the credential pool             |
| `DB_NAME`                         | `agriai_loadtest` (asserted) | Must be `agriai_loadtest`                |
| `FIREBASE_AUTH_EMULATOR_HOST`     | (set by `run.ps1`)        | When using the Firebase auth emulator      |
| `LOAD_PROFILE`                    | `moderate`                | See above                                   |
| `RESULTS_DIR`                     | `results/<scenario>_locust` | Auto-set by `run-locust-*.ps1`           |
| `LOCUST_RUN_TIME`                 | per-scenario (60m, 30m, 15m) | Locust headless budget                   |
