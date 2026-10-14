# Project 7 — Reviewer System Load & SLA Testbed

This directory holds the **isolated** test bed for the Ajrasakha reviewer backend
(P7 in the project tracker). It brings up a self-contained copy of the backend,
a dedicated MongoDB (`DB_NAME=agriai_loadtest`) and a Firebase Auth Emulator so
we can run 1×/5×/10× load profiles without ever touching the production
database, project, or any external notification channel.

> **Hard rule.** Every script under `testing/` uses the regex prefix `lt-` on
> `firebaseUID` so that running on a misconfigured environment (pointed at
> staging, for instance) cannot delete unrelated records. Each script also
> asserts `process.env.DB_NAME === 'agriai_loadtest'` before writing.

---

## 1. Layout

```
testing/
├── README.md                      ← this file
├── Makefile                       ← GNU Make targets (Linux/macOS)
├── package.json                   ← Node deps for seed/ + scripts/
├── docker/
│   ├── docker-compose.yml         ← mongo + auth-emu + backend stack
│   ├── backend-loadtest.env       ← env overlay that kills every side-effect
│   └── mongo-init/01-loadtest-indexes.js
├── seed/                          ← seed scripts (run on the host)
│   ├── lib/db.mjs                 ← Mongo helper
│   ├── lib/fixtures.mjs           ← states/crops/templates shared with locust
│   ├── seed_users.mjs             ← experts/mods/auditors/gatekeepers
│   ├── seed_questions.mjs         ← questions + matching question_submissions
│   ├── register_firebase_users.mjs ← auth-emulator signUp for every seed user
│   ├── seed_all.mjs               ← orchestrator (users → fb → questions)
│   └── clear.mjs                  ← drop loadtest-tagged docs (idempotent)
├── scripts/
│   ├── run.ps1                    ← Windows entrypoint
│   ├── smoke.mjs                  ← /api/health + login + /api/questions/allocated
│   └── reconcile_reputation.mjs   ← wrapper around recalculate-reputation-scores.mjs
├── locust/                        ← created in Phase 3
├── bugs/                          ← bug-1195 / bug-1204 harnesses (Phase 4)
└── results/                       ← raw + processed outputs from each run
```

---

## 2. Why a Firebase Auth Emulator?

`backend/src/modules/auth/controllers/AuthController.ts:228` calls

```
https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_API_KEY
```

…which is Google-managed. To run end-to-end without owning a Firebase project,
the container sets `FIREBASE_AUTH_EMULATOR_HOST=firebase-emulator:9099` so the
official Firebase SDK and IdentityToolkit REST calls transparently target the
emulator. The emulated `signUp` REST endpoint:

```
POST http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=<any>
{ "email": "...", "password": "...", "returnSecureToken": true }
```

is what `register_firebase_users.mjs` uses to provision an auth user per
`users` document. The keys are arbitrary — the emulator never validates them.

---

## 3. Quick start (Windows)

```powershell
pwsh -File testing/scripts/run.ps1 deps      # npm install in testing/
pwsh -File testing/scripts/run.ps1 up        # docker compose up
pwsh -File testing/scripts/run.ps1 seed      # users + auth + questions
pwsh -File testing/scripts/run.ps1 smoke     # hit /api/health + login
```

On Linux/macOS:

```bash
cd testing && make deps && make up && make seed && make smoke
```

When you are done:

```powershell
pwsh -File testing/scripts/run.ps1 down      # stop containers, keep mongo-data
pwsh -File testing/scripts/run.ps1 nuke      # also wipe the volume
```

---

## 4. What the seed scripts produce

| Collection               | Count (defaults)  | Notes                                                             |
|--------------------------|-------------------|-------------------------------------------------------------------|
| `users`                  | 200 experts, 50 PAE, 50 mods, 20 GKs, 20 auditors, 1 admin | schema follows `User.ts` |
| `questions`              | 5000 + 2 × #DUPLICATE_PAIRS | status mix default 60% open / 30% in-review / 5% closed / 5% delayed |
| `question_submissions`   | one per `autoAllocateModerator=true` question | empty `queue` so the cron has work |

Tunable via env:

```bash
EXPERTS=500 MODERATORS=100 QUESTIONS=20000 STATUS_MIX=open:0.5,closed:0.5 \
  node seed/seed_all.mjs
```

---

## 5. Guarantees against staging/prod contamination

* **DB name:** every script asserts `process.env.DB_NAME === 'agriai_loadtest'`.
* **UID prefix:** all loadtest `firebaseUID`s start with `lt-`; delete filters
  use `firebaseUID: { $regex: /^lt-/ }`.
* **External side-effects:** `backend-loadtest.env` blanks every external URL
  (`WA_WEBHOOK_*`, `WEB_WEBHOOK_*`, `SMTP_*`, `PLIVO_*`, tailnet vars, GCS
  bucket, Sentry DSN, GCP credentials, etc.) and forces `ENABLE_AI_SERVER=false`,
  `ENABLE_DB_BACKUP=false`.
* **Tailnet not needed:** the reviewer backend is fully usable without
  Tailscale if the 100.x AI/agent/GDB URLs are unreachable — every request to
  them will 502, but the reviewer surfaces and cron paths we measure will work.

---

## 6. Smoke test

`scripts/smoke.mjs` is intentionally trivial but it catches regressions that
would silently poison every later phase:

1. `GET /api/health` → `{ status: "healthy" }`
2. `POST /api/login` with the seeded admin → idToken
3. `POST /api/questions/allocated` with `Bearer <idToken>` → any 2xx/4xx

Run it after every backend image rebuild.

---

## 7. Files reference

| File                                         | Purpose                                  |
|----------------------------------------------|------------------------------------------|
| `docker/docker-compose.yml`                  | Topology + port mapping                  |
| `docker/backend-loadtest.env`                | Env overlay that neuters side-effects    |
| `docker/mongo-init/01-loadtest-indexes.js`   | Pre-creates indexes for measurement runs |
| `seed/seed_users.mjs`                        | Users collection                         |
| `seed/seed_questions.mjs`                    | Questions + question_submissions         |
| `seed/register_firebase_users.mjs`           | Firebase Auth Emulator signUp            |
| `seed/clear.mjs`                             | Idempotent cleanup                       |
| `scripts/run.ps1`                            | Windows orchestration                    |
| `Makefile`                                   | GNU Make orchestration                   |