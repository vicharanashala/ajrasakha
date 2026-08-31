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

The first pass covered only the auth gate and the error paths every route
takes for nonexistent/invalid ids. A second pass added a real fixture chain
— a real `OUTREACH` question created via `POST /questions`, plus a
directly-inserted `answers` doc (the service layer never validates
`answerId` against a real document, but `getAllocatedQuestions`/
`getAllocatedQuestionsByID` both `$lookup` + `$unwind` on `answers`, so an
`answerId` with no match silently drops the whole result — the fixture
answer has to be real for those two reads to return anything) — to exercise
the actual business logic: `addrerouteAnswer`, `getQuestionById`,
`getAllocatedQuestions`, `getRerouteHistory`, `rejectRerouteRequest`
(expert path, including the real "already rejected" business-rule 400 on a
second attempt), and `moderatorReject`/`updateStatus` (moderator path).

**Note on `GET /:answerId/history`:** despite the param name, the
repository (`ReRouteRepository.getRerouteHistory`) matches it against
`questionId`, not the reroute's `answerId` field — the happy-path test
calls this route with the question id, documenting actual behavior rather
than the route's apparent contract.

---

## Test cases (15 total)

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
| 13 | Real reroute assignment — record created, visible via `GET /:questionId` + `POST /allocated`, real history via `GET /:questionId/history` | 200s throughout, real DB state asserted |
| 14 | Expert rejects — real `expert_rejected` flip, question → `in-review`, reputation/notification side effects run, second reject on same record | 200 then real 400 ("already rejected") |
| 15 | Moderator rejects via the dedicated action route — real `updateStatus` write | 200, real `moderator_rejected` state |

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/reroute/ReRouteController.e2e.test.ts
```

---

## Last Run

**Date:** 2026-08-31 | **Result:** ✅ all 15 passed | **Duration:** ~13s
