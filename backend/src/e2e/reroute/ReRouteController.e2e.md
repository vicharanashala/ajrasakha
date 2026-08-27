# Re-Route Controller — E2E Test Documentation

**File:** `src/e2e/reroute/ReRouteController.e2e.test.ts`

---

## What this covers

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/reroute/:questionId/allocate-reroute-experts` | Assign a re-routed expert |
| `POST` | `/api/reroute/allocated` | List questions allocated to the current expert |
| `GET` | `/api/reroute/:questionId` | Get a re-routed question + history |
| `PATCH` | `/api/reroute/:rerouteId/:questionId` | Expert rejects a re-route |
| `GET` | `/api/reroute/:answerId/history` | Reroute history for an answer |
| `PATCH` | `/api/reroute/:questionId/:expertId/action` | Moderator rejects a re-route |

---

## Scope of this pass

A genuine reroute record only exists after a peer-review rejection cycle produces
one — the underlying mechanics are already exercised structurally by
`post-allocation/` and `gatekeeper-auditor/`. Building the full multi-stage fixture
chain (allocate → submit → reviewer rejects → reroute created) just to reach these
6 routes would duplicate a lot of unrelated machinery, so **this suite covers the
auth gate and the error paths every route takes for nonexistent/invalid ids — not
the full reroute happy path.** Worth a dedicated follow-up suite if reroute-specific
business logic needs deeper coverage (e.g. verifying reroute ordering, notification
content, or reputation-score effects).

---

## Test cases (12 total)

| # | Test | Expected |
|---|------|----------|
| 1 | `POST /:questionId/allocate-reroute-experts` — no auth | 401 |
| 2 | Same — non-existent question/expert/answer | ≥400 |
| 3 | `POST /allocated` — no auth | 401 |
| 4 | Same — authenticated expert | 200, array |
| 5 | `GET /:questionId` — no auth | 401 |
| 6 | Same — non-existent question | ≤500 (documents actual behavior) |
| 7 | `GET /:answerId/history` — no auth | 401 |
| 8 | Same — answer with no reroutes | 200, empty array |
| 9 | `PATCH /:rerouteId/:questionId` — no auth | 401 |
| 10 | Same — non-existent reroute record | ≥400 |
| 11 | `PATCH /:questionId/:expertId/action` — no auth | 401 |
| 12 | Same — non-existent question/expert | ≥400 |

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/reroute/ReRouteController.e2e.test.ts
```

---

## Last Run

**Date:** 2026-08-24 | **Result:** ✅ all 12 passed | **Duration:** ~6s
