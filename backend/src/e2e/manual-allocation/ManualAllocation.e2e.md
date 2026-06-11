# Manual Allocation — E2E Test Documentation

**File:** `src/e2e/manual-allocation/ManualAllocation.e2e.test.ts`

## What this covers

Two manual-allocation endpoints exercised against the real Mongo DB (`.env`):

| Method | Endpoint | What it does |
|--------|----------|--------------|
| `POST` | `/api/questions/:questionId/allocate-experts` | Moderator picks specific experts for a question |
| `DELETE` | `/api/questions/:questionId/allocation` | Moderator removes an expert by queue index |

## Strategy

**In-process server** — `loadAppModules('all')` builds the real production DI container against the real DB. A single OUTREACH question is seeded directly in `beforeAll` and shared across the full suite.

Users are fetched from the DB by email using `.env.test` credentials (no Firebase token exchange needed). A `currentTestUser` variable is swapped per-test; both `authorizationChecker` and `currentUserChecker` read from it.

`InternalApiAuth` is a global `@Middleware({ type: 'before' })` that checks the `x-internal-api-key` header on every route. The test sets `process.env.INTERNAL_API_KEY = 'e2e-manual-alloc-key'` and attaches that header to all requests via `apiPost`/`apiDelete` helpers. `authorizationChecker` still gates per-test access.

## Why OUTREACH source

| Source | Status on creation | Background pipeline | Queue on creation |
|--------|-------------------|---------------------|-------------------|
| `AGRI_EXPERT` | `open` | Immediately auto-allocates experts | Filled by background |
| `WHATSAPP` / `AJRASAKHA` | `pending` | Thread validation + duplicate check + cron allocation | Empty |
| **`OUTREACH`** | **`open`** | **Notify moderators only** | **Empty** |

OUTREACH gives a clean starting state (status `open`, empty queue) without background allocation side effects.

## Test setup

- `.env` loaded first → real Atlas DB URL
- `.env.test` loaded second (dotenv doesn't override existing vars) → test user credentials
- `process.env.NODE_ENV = 'development'` set before any module load → Atlas TLS stays enabled
- AnswerService warm-up import before `loadAppModules` → circular-import workaround

## Cleanup (afterAll)

Removes from the real DB:
- `questions` — the seeded OUTREACH question
- `question_submissions` — the bare submission row
- `notifications` — any allocation notifications created during the tests

## Test cases (10 total)

| # | Group | What | Expected |
|---|-------|------|----------|
| 1 | AUTH | No user (`currentTestUser=null`) → allocate-experts | 401 (from `authorizationChecker`) |
| 2 | AUTH | Expert tries to allocate | 400 (`UnauthorizedError` wrapped as `BadRequestError`) |
| 3 | ALLOCATE | Moderator allocates expert1 | 200 |
| 4 | ALLOCATE | DB: submission queue contains expert1's `_id` | `queue.length === 1` |
| 5 | ALLOCATE | DB: question has `firstAllocationAt` set | not null, instanceof Date |
| 6 | ALLOCATE | Moderator allocates expert2 to same question | 200, `queue.length === 2` |
| 7 | VALIDATION | Re-allocate expert1 (duplicate) | **200** (see known bug below) |
| 8 | VALIDATION | Non-existent `questionId` | **500** (see known behavior below) |
| 9 | REMOVE | Moderator removes expert at index 0 | 200 |
| 10 | REMOVE | DB: queue shrinks to 1, expert2 remains, expert1 gone | confirmed |

## Known bugs / deviations from spec

### BUG-001 — Duplicate expert guard never fires

**Location:** `QuestionService.ts` — `allocateExperts()`:
```ts
const hasExistingExpert = experts.some(expertId =>
  questionSubmission.queue.includes(expertId),
);
```
`questionSubmission.queue` holds `ObjectId` objects (as returned from MongoDB), but `expertId` is a plain `string` from the request body. `Array.includes` uses reference equality — an `ObjectId` is never `===` a string — so the guard always returns `false` and duplicates are silently allowed.

**Intended behavior:** 400 "The selected expert is already in the queue."  
**Actual behavior:** 200 (duplicate added to queue)  
**Fix:** `.queue.some(id => id.toString() === expertId)` or map the queue to strings before checking.

---

### BEHAVIOR-001 — Non-existent questionId returns 500, not 400/404

**Location:** `QuestionService.ts` — `getQuestionDataById()` calls `QuestionRepository.getById()`, which throws `InternalServerError("Failed to get Question:, More/ NotFoundError: ...")` on a miss.

The `allocateExperts` controller catch block re-throws `InternalServerError` as-is → HTTP 500.

**Intended behavior:** 400 or 404  
**Actual behavior:** 500  
**Fix:** `getQuestionDataById` (or the repository) should throw `NotFoundError` rather than `InternalServerError` for a missing document.

---

### BUG-002 — `removeExpertFromQueuebyIndex` removes by value, not by position

**Location:** `SubmissionRepository.ts` — `removeExpertFromQueuebyIndex()`:
```ts
$pull: {
  queue: new ObjectId(expertId),   // removes ALL entries matching this ObjectId
  history: { updatedBy: new ObjectId(expertId) },
}
```
The function is named "byIndex" and accepts an `index` parameter, but the actual MongoDB `$pull` removes every queue entry whose value matches `expertId` — not just the one at the given index.

**Effect in the normal case:** Harmless — each expert appears in the queue at most once, so `$pull` removes exactly one entry.

**Cascading failure with BUG-001:** After BUG-001 allows a duplicate allocation, the queue contains the same expert twice (e.g. `[expert1, expert2, expert1]`). Removing at index 0 (`$pull expert1`) removes **both** expert1 entries, leaving `[expert2]`. In the current test suite this accidentally satisfies the `queue.length === 1` assertion — it is a lucky pass, not correct behaviour.

**How this causes the remove → 500 / empty queue failure:**  
If `EXPERT_EMAIL` and `EXPERT_EMAIL_2` in `.env.test` resolve to the same DB user (or `EXPERT_EMAIL_2` is unset), BUG-001 fills the queue with three copies of the same expert: `[expert1, expert1, expert1]`. Removing index 0 then `$pull`s all three entries → queue becomes `[]`.

**Intended behavior:** remove only the entry at the given index  
**Fix:** Splice the array in application code (read queue → remove at index → `$set` the updated array) instead of relying on `$pull`.

---

### BUG-003 — `removeAllocation` controller returns HTTP 500 when `getExprtIdByIndex` yields `null`

**Location:** `QuestionController.ts` — `removeAllocation()`:
```ts
expertId = await this.questionService.getExprtIdByIndex(questionId, index);
expertDeatils = await this.userService.getUserById(expertId);   // throws if expertId is null
questionDetails = await this.questionService.getQuestionById(questionId);
```
`getExprtIdByIndex` returns `null` when the queue has no entry at `index` (queue empty or shorter than expected). `getUserById(null)` then throws an exception before `questionDetails` is ever assigned.

The controller catch block is:
```ts
} catch (err: any) {
  auditPayload = {
    ...
    context: { ...auditPayload.context, question: questionDetails.text },  // TypeError: cannot read .text of undefined
    ...
  };
  ...
  throw new BadRequestError(...);
}
```
`questionDetails.text` itself throws a `TypeError` inside the catch block. That secondary exception escapes the catch block entirely → routing-controllers' default error handler → HTTP 500, not the intended `BadRequestError`.

This is triggered by BUG-002's empty-queue scenario and is the direct cause of the observed `expected 500 to be 200` / `expected [] to have a length of 1 but got +0` failure pair.

**Intended behavior:** 400 "no expert at that index"  
**Fix:** Guard `questionDetails?.text` in the catch block, and validate that `getExprtIdByIndex` returned a non-null value before calling `getUserById`.
