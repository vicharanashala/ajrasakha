# Reviewer System Load & SLA Testing (Project 7)

Locust-based load and SLA test suite for the Ajrasakha reviewer pipeline:
expert logins, question ingestion, and the peer-review / 3-approval flow.

## What's here

```
load-tests/
├── locustfile.py      # Locust scenarios (ExpertLoginUser, QuestionCreatorUser, ReviewPipelineUser)
├── race_probe.py      # Targeted concurrency probe for the 3-approval logic
├── seed_users.py      # Seeds Firebase + Mongo test accounts
├── run_sla.sh         # SLA matrix: each scenario at 1x / 5x / 10x load
├── common/            # config / auth / db helpers
├── stack/             # scripts to run the local test stack (see below)
└── results/           # CSV output from run_sla.sh
```

## Test environment

The suite targets a real backend instance — no mocks. The full auth path is
exercised: Firebase password sign-in mints real ID tokens that the backend
verifies via firebase-admin.

Local stack (all in `stack/`):

| Component | Script | Notes |
|---|---|---|
| MongoDB 1-node replica set, TLS | `run-mongo.sh` | Replica set required (backend uses transactions); TLS required (`MongoClient` hardcodes `tls: true`) |
| Firebase Auth emulator | `run-firebase-emulator.sh` | Backend picks it up via `FIREBASE_AUTH_EMULATOR_HOST` — no backend code changes |
| Backend | `run-backend.sh` | `NODE_ENV=development`, port 3000, throwaway VAPID/Plivo/Firebase-cert values |

Configuration is env-driven (see `common/config.py`, `LT_*` variables), so the
same suite can point at staging instead.

## Running

```bash
pip install -r requirements.txt

# 1. Start the stack (each in its own process/workflow)
bash stack/run-mongo.sh &
bash stack/run-firebase-emulator.sh &
bash stack/run-backend.sh &

# 2. Seed accounts (idempotent)
python seed_users.py --experts 60 --moderators 3 --farmers 5

# 3. Individual scenarios
locust -f locustfile.py ExpertLoginUser     --headless -u 50 -r 10 -t 2m
locust -f locustfile.py QuestionCreatorUser --headless -u 10 -r 5  -t 2m
locust -f locustfile.py ReviewPipelineUser  --headless -u 10 -r 5  -t 2m

# 4. Full SLA matrix (1x / 5x / 10x per scenario, CSVs in results/)
./run_sla.sh 2m

# 5. Concurrency probes for the approval-count / reputation logic
python race_probe.py --mode duplicate  --shots 5 --rounds 10
python race_probe.py --mode multi      --shots 4 --rounds 10
python race_probe.py --mode reputation --shots 4 --rounds 6
python race_probe.py --mode deadlock   --rounds 2
python race_probe.py --mode allocation --shots 6 --rounds 6
python race_probe.py --mode moderator  --shots 4 --rounds 3
```

## Scenarios

1. **ExpertLoginUser** — 50+ concurrent expert logins. A login = Firebase
   password sign-in (timed separately as `firebase:signInWithPassword`)
   followed by the first authenticated call the app makes (submission queue).
2. **QuestionCreatorUser** — questions entering the pipeline via
   `POST /questions/` with realistic crop/state/season details.
3. **ReviewPipelineUser** — the full reviewer cycle per iteration: a question
   is allocated (seeded exactly like the allocation cron writes it), the
   assigned expert submits an answer, three peers submit accepted reviews,
   and the 3-approval promotion (`approvalCount >= 3` →
   `pending-with-moderator`) is verified against Mongo. Correctness failures
   surface as failures on the `pipeline:verify` pseudo-request.

`race_probe.py` additionally fires *concurrent* accepted reviews (duplicate
reviewer / multiple reviewers) and checks invariants: approvalCount matches
review documents (I1), no double-counting per reviewer (I2), promotion iff
>= 3 (I3). The `reputation` mode adds I4 — each participant's
`reputation_score` delta equals their number of committed answer/review
documents (ledger consistency under simultaneous review landings; see
REPORT.md Finding 4 for the exact scope). Note: `reputation` mode pins
`reputation_score` via direct Mongo writes as setup — run it only against a
disposable test database, never shared staging data.

Two further modes cover the remaining brief items: `allocation` fires
concurrent manual expert allocations against one question, cycling three
scenarios (distinct experts, same expert, near-cap with the queue pre-seeded
to 9), and checks the queue invariants (at least one commit — A0, 10-expert
cap — A1, no duplicate experts — A2, exactly one +1 first-allocation
workload grant — A3, and the 30 s allocation SLA); see REPORT.md Finding 7.
`moderator` drives an answer to promotion and fires concurrent final
approvals across moderator accounts, checking the question closes exactly
once, the author incentive is paid exactly once, and exactly one approval
succeeds (M1–M4); see Finding 8. Both modes mutate `reputation_score` and upsert LGD reference
docs (`states`/`districts`) as setup — same disposable-database warning
applies.

## Direct-DB seeding rationale

Expert allocation in production is cron/worker-driven, not client-triggered.
To make scenarios deterministic, the suite writes the same documents the
allocation crons produce (`questions`, `question_submissions` with
`queue`/`history`), then drives everything else through the public API.

## Findings

See `REPORT.md` for the load-test report (SLA tables, breaking points, and
correctness findings).
