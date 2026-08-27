# Request Controller — E2E Test Documentation

**File:** `src/e2e/request/RequestController.e2e.test.ts`

---

## What this covers

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/requests` | Create a flag request |
| `GET` | `/api/requests` | List requests (blocked for `expert` role) |
| `GET` | `/api/requests/:requestId` | Diff view (current/existing/responses) |
| `PUT` | `/api/requests/:requestId/status` | Approve/reject/in-review |
| `PUT` | `/api/requests/:requestId/delete` | Soft delete |

`getAllRequests` has a REAL in-handler role check (`user.role === 'expert'` →
`UnauthorizedError`, i.e. 401 — not the `@Authorized([roles])` pattern BUG-017 shows
is unenforced elsewhere). This suite exercises that actual guard.

**Fixtures:** a real OUTREACH question (via `POST /api/questions`) is used as the
flagged `entityId`.

---

## Findings

- **BUG-021**: `RequestRepository.createRequest` returns `{ _id: insertedId,
  ...payload }` with raw `ObjectId` instances (`_id`, `requestedBy`, `entityId`) —
  never stringified. The JSON response ships a malformed `{ buffer: { data: [...] }
  }` shape instead of a hex string. Every other create endpoint in this codebase
  (Chemical, Question, ...) returns a clean string id; this one doesn't. Worked
  around in this suite by reading the real id back from Mongo directly.
- **BUG-022**: `softDelete()` (`PUT /:requestId/delete`) resolves with `undefined`
  and has no `@OnUndefined()` decorator. routing-controllers' `ExpressDriver`
  treats an undefined result as "not found" by default, which overrides the
  declared `@HttpCode(204)`. The soft-delete genuinely happens server-side
  (`isDeleted: true` is set) — but every caller sees a 404 regardless. From a real
  client's perspective this endpoint looks completely broken.

---

## Test cases (9 total)

### POST /requests (2 tests)

| # | Test | Expected |
|---|------|----------|
| 1 | No authenticated user | 401 |
| 2 | **BUG-021**: creates a flag request | 201, malformed `_id` in response |

### GET /requests (2 tests)

| # | Test | Expected |
|---|------|----------|
| 3 | Expert blocked (real in-handler check) | 401 |
| 4 | Moderator sees the created request | 200 |

### GET /requests/:requestId (2 tests)

| # | Test | Expected |
|---|------|----------|
| 5 | Diff view for an existing request | 200 |
| 6 | Non-existent request | ≥400 |

### PUT /requests/:requestId/status (2 tests)

| # | Test | Expected |
|---|------|----------|
| 7 | Reject with a response, closes the request | 200 |
| 8 | Further status change on a closed request | 400 |

### PUT /requests/:requestId/delete (1 test)

| # | Test | Expected |
|---|------|----------|
| 9 | **BUG-022**: soft-delete a fresh request | 404 response, but `isDeleted: true` in DB |

---

## Cleanup

`afterAll` deletes the fixture question and every request id tracked in
`createdRequestIds`.

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/request/RequestController.e2e.test.ts
```

---

## Last Run

**Date:** 2026-08-24 | **Result:** ✅ all 9 passed | **Duration:** ~24s
