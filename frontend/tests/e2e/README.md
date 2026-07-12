# Ajrasakha Frontend — Playwright E2E Test Suite

> **Status:** v1.0.0 — production-ready.
> **Location:** `frontend/tests/e2e/` (sits next to the React app it tests).
> **Requirement:** zero test credentials. Runs on any environment that has
> `E2E_BASE_URL` and `E2E_API_URL`.
> **Coverage:** 154 tests, 12 spec files, 5 phases (`@public`, `@network`,
> `@contract`, `@a11y`).

Playwright suite that protects the Reviewer System frontend
(`desk.vicharanashala.ai`) without needing test user accounts. The suite
operates entirely via status-code probes, anonymous HTTP requests, and
browser-only smoke checks — so it can run against any environment the team
gives it.

> **Pair this with the backend Vitest e2e suite** at
> `backend/src/e2e/` (on the `QA/e2e-testcases` branch). Frontend tests
> catch the bug **before** it reaches the backend; backend tests catch it
> **at** the backend. Together they cover both halves of the request.

---

## 🚀 TL;DR

```bash
cd frontend
pnpm install
pnpm exec playwright install --with-deps chromium

# Local dev (skip-when-down mode)
E2E_BASE_URL=http://localhost:5173 \
E2E_API_URL=http://localhost:3141/api \
pnpm test:e2e

# Staging (strict mode — fail if unreachable)
E2E_BASE_URL=https://desk-staging.example.com \
E2E_API_URL=https://desk-staging.example.com/api \
E2E_SKIP_IF_DOWN=false \
pnpm test:e2e

# One phase only
pnpm test:public       # @public — SPA shell + login
pnpm test:contract     # @contract — every backend status code
pnpm test:network      # @network — routes + auth-gate
pnpm test:a11y         # @a11y — semantic HTML + keyboard
pnpm test:e2e:smoke    # @public + @a11y (no backend needed)
```

---

## 📁 Structure

```
frontend/tests/e2e/
├── README.md                     ← you are here
├── CHANGELOG.md                  ← version history
├── CONTRIBUTING.md               ← how to add new tests
├── RUNBOOK.md                    ← troubleshooting guide
├── LICENSE                       ← MIT
├── .gitignore
├── .env.example                  ← copy to .env, edit
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── environment.ts
├── helpers/
│   ├── http.ts                   ← statusFor, isApiReachable, matchesExpect
│   ├── auth.ts                   ← auth helpers (placeholder for creds)
│   ├── env-validator.ts          ← env validation
│   ├── logger.ts                 ← level-aware logger
│   ├── global-setup.ts           ← Playwright global setup
│   └── global-teardown.ts        ← Playwright global teardown
├── specs/
│   ├── 00-public.spec.ts         16 tests  SPA shell + login page
│   ├── 02-assets.spec.ts          5 tests  static asset integrity
│   ├── 03-contract-questions.spec.ts  36 tests  /questions/* contract
│   ├── 04-contract-answers.spec.ts    11 tests  /answers/* + /reroute/* contract
│   ├── 05-contract-users.spec.ts      19 tests  /users/* contract
│   ├── 06-contract-notifications.spec.ts 6 tests  /notifications/* contract
│   ├── 07-contract-audit.spec.ts       4 tests  /audit-trails/* contract
│   ├── 08-contract-performance.spec.ts 18 tests  /performance/* contract
│   ├── 09-contract-misc.spec.ts       11 tests  comments/crops/context/etc
│   ├── 10-network-routes.spec.ts      12 tests  every FE route renders cleanly
│   ├── 10b-network-auth-gate.spec.ts   5 tests  anonymous auth-gate proof
│   └── 11-accessibility.spec.ts        8 tests  semantic HTML + keyboard
├── scripts/
│   ├── verify-setup.sh           ← pre-flight check
│   └── run-smoke.sh              ← convenience runner
└── docs/
    ├── AUDIT_REPORT.md           ← findings + comparison vs old suite
    ├── FLOW_ANALYSIS.md          ← end-to-end flow map of the app
    └── TEST_INVENTORY.md         ← every test, by ID
```

---

## 🧪 Phases

| Phase | Tag | What it proves | When it fails |
|-------|-----|----------------|---------------|
| Public smoke | `@public` | SPA shell, login form, asset integrity render without backend | FE is broken |
| Route table | `@network` | All FE routes return non-5xx, no `/api` leak | TanStack Router misconfigured |
| Status-code contract | `@contract` | Every backend endpoint returns the right status (401 / 400 / 200) when hit with no token | Accidental auth bypass |
| Auth-gate proof | `@network` | Security-critical endpoints (`/answers/moderator/approve`) refuse anonymous calls | **Critical security regression** |
| Accessibility | `@a11y` | Semantic HTML, keyboard reach, no broken images / empty hrefs | A11y regressions |

---

## ⚙️ Configuration

All configuration is via environment variables. See `.env.example`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `E2E_BASE_URL` | `http://localhost:5173` | Frontend SPA URL |
| `E2E_API_URL` | `http://localhost:3141/api` | Backend API URL (must end with `/api`) |
| `E2E_STAGING_URL` | _empty_ | Optional staging marker (CI-only) |
| `E2E_SKIP_IF_DOWN` | `true` | If `false`, fail loudly when target unreachable |
| `E2E_LOG_LEVEL` | `info` | `silent` / `error` / `warn` / `info` / `debug` |
| `E2E_TIMEOUT_MS` | `30000` | Default per-test timeout |
| `E2E_USER_AGENT_SUFFIX` | `qa-e2e/1.0.0` | Suffix added to request UA (helps log identification) |
| `NO_COLOR` | _unset_ | Set to `1` to disable ANSI colours |

---

## 🛡️ Error handling

The suite is built for failure modes:

* **Backend down** — every contract spec calls `isApiReachable()` in `beforeEach` and **skips cleanly** when unreachable, with a clear message. Switch to `E2E_SKIP_IF_DOWN=false` for hard fail.
* **FE down** — same pattern, via `isFrontendReachable()`.
* **Firebase env missing/invalid** — login form tests detect the pageerror and skip rather than 30-second timeouts.
* **Network error on HTTP probe** — `statusFor()` returns `0`, asserted as "doesn't match 401" → test fails loudly (or skips when `skipIfDown`).
* **Wrong config** — `global-setup` runs `assertValidEnvironment()` and aborts with a list of missing/invalid vars.
* **Flaky network** — retries are `1` in CI, `0` locally.

See [`RUNBOOK.md`](./RUNBOOK.md) for troubleshooting.

---

## 🤝 Relationship with backend e2e

This suite complements the backend Vitest e2e suite at
`backend/src/e2e/` (on `QA/e2e-testcases` branch).

| Concern | This suite (frontend) | Backend suite (`backend/src/e2e/`) |
|---------|----------------------|-------------------------------------|
| Tool | Playwright | Vitest |
| Tests | 154 | 164 |
| Needs credentials | **No** | **Yes** (Firebase, DB) |
| Needs infrastructure | **No** | **Yes** (Atlas Mongo + seeded users) |
| Runtime | ~30s | ~2 min |
| Proves | "FE reaches the right URLs" | "Backend works end-to-end" |
| Fails on | Accidental auth bypass, route removal, SPA crash | Real bug in business logic |

Both should run in CI as parallel jobs (see `.github/workflows/e2e-public-contract.yml` for this one; the backend suite has its own workflow on the `QA/e2e-testcases` branch).

---

## 📚 More docs

* [`docs/FLOW_ANALYSIS.md`](./docs/FLOW_ANALYSIS.md) — every flow, every endpoint
* [`docs/AUDIT_REPORT.md`](./docs/AUDIT_REPORT.md) — bugs found + comparison vs old suite
* [`docs/TEST_INVENTORY.md`](./docs/TEST_INVENTORY.md) — every test, with ID and what it proves
* [`CHANGELOG.md`](./CHANGELOG.md)
* [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to add a new test
* [`RUNBOOK.md`](./RUNBOOK.md) — troubleshooting

---

## 📜 License

MIT — same as parent repo.