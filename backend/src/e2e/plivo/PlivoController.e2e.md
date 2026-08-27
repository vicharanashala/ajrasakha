# Plivo Controller — E2E Test Documentation

**File:** `src/e2e/plivo/PlivoController.e2e.test.ts`

---

## What this covers

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/plivo/history` | Real Plivo call-list API |
| `POST` | `/api/plivo/send-message` | Validation only — see below |
| `GET` | `/api/plivo/analytics` | `call_agent` only, real in-handler check |
| `GET` | `/api/plivo/acc-analytics` | Admin only, real in-handler check |

**Not covered:** `POST /answer` — the inbound-call webhook Plivo itself calls.
Exercising it for real would mark a real agent user as busy and requires
simulating Plivo's own request shape; out of scope for this pass.

---

## Finding

`GET /history` has **no `@Authorized()` decorator at all** — unlike every other
read route in this module, it's reachable with just the shared
`x-internal-api-key` and no per-user login at all. Confirmed against the real
live Plivo API (returned `200` with a real, if empty, call list). Documented, not
fixed — may be intentional for an internal dashboard integration, but worth a
second look given no other route in the codebase skips `@Authorized()` this way
outside of true public routes (`PublicDashboardController`'s GETs) or webhooks
Plivo itself calls (`POST /answer`).

`POST /send-message` proxies to a real Fast2SMS API that would send a real SMS
to a real phone number — this suite **only exercises the validation-error path**
(missing `destination`/`text` → 400) and never reaches the live call.

---

## Test cases (8 total)

| # | Test | Expected |
|---|------|----------|
| 1 | `GET /history` — no logged-in user, real Plivo call | 200 or 500 |
| 2 | `POST /send-message` — no auth | 401 |
| 3 | Same — missing fields (never sends a real SMS) | 400 |
| 4 | `GET /analytics` — no auth | 401 |
| 5 | Same — non-`call_agent` (expert) | 400 |
| 6 | `GET /acc-analytics` — no auth | 401 |
| 7 | Same — non-admin (expert) | 400 |
| 8 | Same — admin | 200 |

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/plivo/PlivoController.e2e.test.ts
```

---

## Last Run

**Date:** 2026-08-24 | **Result:** ✅ all 8 passed | **Duration:** ~8s
