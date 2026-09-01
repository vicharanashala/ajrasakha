# Comment Controller — E2E Test Documentation

**File:** `src/e2e/comment/CommentController.e2e.test.ts`

---

## What this covers

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/comments/question/:questionId/answer/:answerId` | Paginated comment list |
| `POST` | `/api/comments/question/:questionId/answer/:answerId` | Add a comment |

---

## Strategy

Standard in-process harness. A real OUTREACH question is created via
`POST /api/questions` (immediately `open`, no ingestion pipeline). An answer doc is
inserted directly into the `answers` collection rather than driving the full
allocate → submit → review pipeline just to get one row — that pipeline isn't what
this suite is testing.

---

## Findings

- **BUG-009** (already documented in `README.md`, first surfaced by the
  Gatekeeper/Auditor suite): `AnswerRepository.getById` evaluates
  `answer._id?.toString()` where `answer` itself is `null` for a missing id — the
  `?.` guard doesn't help because the null-check needed is on `answer`, not
  `answer._id`. `CommentService.addComment` calls `getById` right after inserting the
  comment (to find the author to notify), so commenting on a non-existent `answerId`
  500s — **even though the comment row is already committed** by that point. This
  suite reproduces that same bug through a second code path.

---

## Test cases (6 total)

| # | Test | Expected |
|---|------|----------|
| 1 | No authenticated user | 401 |
| 2 | Empty comment list before any comment exists | 200, `total: 0` |
| 3 | Empty comment body | 400 |
| 4 | Adds a comment | 201, `true` |
| 5 | New comment visible via GET, `total` incremented | 200 |
| 6 | **BUG-009** reproduced via comment on non-existent answer | 500 (comment still persisted) |

---

## Cleanup

`afterAll` deletes the fixture question, the fixture answer, and every comment id
tracked in `createdCommentIds` (including the orphaned one from test #6, if it was
actually persisted).

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/comment/CommentController.e2e.test.ts
```

---

## Last Run

**Date:** 24-08-2026 | **Result:** ✅ all 6 passed | **Duration:** ~23s
