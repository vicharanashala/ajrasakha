# Question Create — E2E Test Documentation

**File:** `src/e2e/question/QuestionCreate.e2e.test.ts`

---

## What this covers

Basic CRUD lifecycle for Questions (create, get, update, delete, bulk delete),
exercised against a **live server at `http://localhost:4000`** via a real Firebase
JWT token for a moderator user.

> ⚠ **This is an old-style live-server test.** Unlike the other e2e suites in this
> directory (which spin up an in-process server via `loadAppModules`), this test
> requires a separately running backend instance. If no server is listening at
> `localhost:4000`, all tests will time out immediately.

---

## Endpoints tested

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/questions` | Create question (source=AGRI_EXPERT) |
| `GET` | `/api/questions/:id/full` | Get full question by ID |
| `PUT` | `/api/questions/:id` | Update question |
| `DELETE` | `/api/questions/:id` | Delete single question |
| `DELETE` | `/api/questions/bulk` | Bulk delete questions |

---

## Auth strategy

Single Firebase JWT token for `MODERATOR_EMAIL` / `MODERATOR_PASSWORD` (from `.env.test`),
fetched in `beforeAll`.

---

## Test cases (8 total)

| # | Test | Expected |
|---|------|----------|
| 1 | Moderator creates question (source=AGRI_EXPERT, Punjab/Ludhiana/Brinjal/Rabi) | 201 |
| 2 | Moderator gets created question by ID | 200, correct fields |
| 3 | Moderator updates question | 200 |
| 4 | Question reflects updated values | 200, updated fields |
| 5 | Moderator deletes question | 200, deletedCount=1 |
| 6 | Deleted question no longer retrievable | 400 or 404 |
| 7 | Moderator bulk creates 2 questions then bulk deletes | 200 |
| 8 | Bulk-deleted questions not retrievable | 404 or 500 |

---

## Last Test Run Results

**Date:** 2026-06-15  
**Prerequisite:** live server running at `localhost:4000`  
**Total:** 8 tests — **3 passed, 5 failed**

| # | Test | Result | Error |
|---|------|--------|-------|
| **1** | **Moderator creates question → 201** | ❌ FAIL | **Test timed out in 5000ms** — no server at localhost:4000 |
| **2** | **Moderator gets question by ID → 200** | ❌ FAIL | `questionId` is undefined (cascade from #1) |
| 3 | Moderator updates question → 200 | ✅ | (skipped/no assertion if questionId undefined) |
| 4 | Question reflects updated values → 200 | ✅ | (skipped/no assertion) |
| **5** | **Moderator deletes question → 200** | ❌ FAIL | `questionId` is undefined (cascade from #1) |
| **6** | **Deleted question not retrievable** | ❌ FAIL | cascade from #5 |
| **7** | **Moderator bulk deletes questions → 200** | ❌ FAIL | Timeout or cascade |
| 8 | Bulk deleted not retrievable | ✅ | (empty array, vacuously passes) |

---

## Failing Paths (2026-06-15)

### All failures caused by: no server at `localhost:4000`

Test #1 (`POST /api/questions`) times out in 5000ms. This is the canonical symptom of
ECONNREFUSED when supertest cannot connect to the target host.

All subsequent tests cascade because `questionId` is never populated (set inside the
`then` block of test #1 which never resolves) and `bulkDeletedQuestionIds` stays empty.

### Fix options

1. **Start the backend first:** `pnpm start` (requires a prior `pnpm build`)
2. **Migrate to in-process pattern:** refactor this test to use `loadAppModules('all')`
   the same way `ManualAllocation.e2e.test.ts` and `AutoAllocation.e2e.test.ts` do.
   This removes the live-server dependency and makes the test self-contained.

---

## How to run

```bash
# Requires backend running at localhost:4000
pnpm start &
NODE_ENV=test pnpm exec vitest run src/e2e/question/QuestionCreate.e2e.test.ts
```

> Consider migrating to the in-process pattern to align with the rest of the e2e suite.
