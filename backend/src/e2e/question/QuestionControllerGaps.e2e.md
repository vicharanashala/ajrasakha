# Question Controller — Coverage Gap-Fill E2E Test Documentation

**File:** `src/e2e/question/QuestionControllerGaps.e2e.test.ts`

---

## What this covers

`QuestionController` is the largest controller in the codebase (83 routes). This
suite fills in most of the "genuinely testable business/analytics routes"
identified in README.md's "Missing tests" section, on top of the 24 routes already covered
by `question/`, `manual-allocation/`, `auto-allocation/`, `reviewer-queue/`,
`gatekeeper-auditor/`, `post-allocation/`, and `feedback/` — bringing `question`
to 64/83 (77%) per `pnpm run test:e2e:coverage`.

| Method | Endpoint |
|--------|----------|
| `POST` | `/api/questions/status-summary` |
| `GET` | `/api/questions/context/:contextId` |
| `GET` | `/api/questions/queue-details` |
| `GET` | `/api/questions/allocated/page` |
| `POST` | `/api/questions/detailed` |
| `GET` | `/api/questions/feedbacks` |
| `POST` | `/api/questions/reAllocateLessWorkload` |
| `GET` | `/api/questions/reallocation-preview` |
| `POST` | `/api/questions/reallocate-manual` |
| `GET` | `/api/questions/role-dashboard` |
| `GET` | `/api/questions/:questionId/submission-exists` |
| `GET` | `/api/questions/:questionId` |
| `PATCH` | `/api/questions/:questionId` |
| `GET` | `/api/questions/:questionId/feedback` |
| `GET` | `/api/questions/:questionId/chatbot` |
| `GET` | `/api/questions` (list) |
| `GET` | `/api/questions/background-status` |
| `GET` | `/api/questions/admin/closed-answer-mismatch` |
| `POST` | `/api/questions/admin/normalized-domain` |
| `POST` | `/api/questions/admin/backfill-closed-moderator` |
| `POST` | `/api/questions/check-status` |
| `POST` | `/api/questions/:questionId/check-duplicate` |
| `PATCH` | `/api/questions/:questionId/hold` |
| `GET` | `/api/questions/:questionId/generate-answer` |
| `POST` | `/api/questions/:questionId/approve-initial-answer` |
| `POST` | `/api/questions/:questionId/replace-queue-expert` |
| `POST` | `/api/questions/reAllocateSelectedQuestions` |
| `POST` | `/api/questions/reallocate-timebound` |
| `POST` | `/api/questions/reallocate-manual-queue` |
| `POST` | `/api/questions/:questionId/mark-opened` |
| `GET` | `/api/questions/download-question-report` |
| `GET` | `/api/questions/download-tat-report` |
| `GET` | `/api/questions/download-overall-report` |
| `GET` | `/api/questions/download-filtered-report` |
| `GET` | `/api/questions/download-duplicate-questions-report` |
| `POST` | `/api/questions/data/out-reach/date` |
| `PATCH` | `/api/questions/:questionId/role-assignee` |
| `DELETE` | `/api/questions/:questionId/role-assignee` |
| `GET` | `/api/questions/:questionId/feedback-timeline` |

### Deliberately NOT covered

Per the triage in README.md's "Missing tests" section:

- 12 internal/background/migration ops routes (`run-migration`,
  `migrate-firebase-users`, `background/*`) — not real API surface.
- `bulk-pae-allocate` — already documented unreachable in-process (kicks off
  worker-thread CSV processing, same as `crop`'s bulk upload).
- `acc-agent/*` (4 routes) and `generate` / `generate-by-call-context` (2) —
  real external AI-service calls needing more fixture work than this pass.
- `check-overlaps` — compares staging vs. production DBs; this environment has
  no staging DB connection configured.

---

## Findings — weaker auth than the route names suggest

- `POST /reAllocateLessWorkload`, `POST /reAllocateSelectedQuestions`, and
  `GET /:questionId/generate-answer` have **no `@Authorized()` at all** —
  reachable by anyone holding just the shared `x-internal-api-key`.
- `PATCH /:questionId`, `GET /admin/closed-answer-mismatch`,
  `POST /admin/normalized-domain`, `POST /admin/backfill-closed-moderator` use
  `@UseBefore(InternalApiAuth)` only — no user login required at all, despite
  the `admin/` path segment.
- `GET /background-status` and `GET /:id` (background job lookup) have no
  decorators at all, but are unreachable anyway — see below.
- **BUG:** `GET /:id` (controller line 2351) and `GET /background-status`
  (line 2346) are both registered *after* `GET /:questionId` (line 1125).
  routing-controllers matches routes in registration order, so
  `/:questionId`'s auth-required, ObjectId-based handler intercepts every
  single-segment `GET` first. Both intended handlers are dead code —
  confirmed below (`background-status` 401s instead of running its own
  no-auth handler).
- **BUG:** `GET /:questionId/chatbot`'s `if (!data) throw new NotFoundError(...)`
  branch is dead code — `QuestionService.getMatchedQuestion` throws a plain
  `Error('No matching message found')` itself rather than returning null, so
  the intended 404 is a 500 in practice.
- **BUG:** `POST /data/out-reach/date` has no `@Authorized()`, but
  unconditionally calls `user._id.toString()` to build an audit-log actor
  before checking the user exists — a genuinely anonymous call crashes with a
  raw `TypeError` instead of either working (as the missing decorator
  implies) or cleanly 401ing.
- `PATCH /:questionId`'s handler method is named `UpdateThreadId` — despite
  the generic path and OpenAPI summary ("Update question fields by ID"), it's
  really a WhatsApp-thread-linking endpoint; `updateQuestion(..., true)` turns
  on thread-id-specific validation, so any body without a `threadId` 500s.
- BUG-017 (documented in the main README) recurs on `queue-details`,
  `reallocate-timebound`, and `reallocate-manual-queue` — `@Authorized([roles])`
  role arrays are never actually enforced anywhere in this app.
- Routing-controllers quirk (not a bug): `@Authorized([roles])` with a
  non-empty roles array throws `AccessDeniedError` (403) for a missing user,
  not `AuthorizationRequiredError` (401) — only bare `@Authorized()` 401s on
  missing auth. Seen on `PATCH`/`DELETE /:questionId/role-assignee`.

---

## Fixtures

- A fresh `OUTREACH` question created via a real `POST /questions` call
  (`questionId`).
- A second question inserted directly with `status: 'closed'` plus a real
  finalized answer (`approvalCount: 3`, `isFinalAnswer: true`) for the
  admin-diagnostic/backfill routes (`closedQuestionId` / `answerId`).
- `gate_keeper` and `auditor` throwaway users, created directly in the DB via
  a local `makeUser(role)` helper (mirrors the pattern in
  `gatekeeper-auditor/GatekeeperAuditor.e2e.test.ts` — no `.env.test` fixture
  users exist for these roles).

---

## Cleanup

`afterAll` deletes both fixture questions, the answer, and both throwaway
users.

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/question/QuestionControllerGaps.e2e.test.ts
```

---

## Last Run

**Date:** 24-08-2026 | **Result:** ✅ all 60 passed | **Duration:** ~29s
