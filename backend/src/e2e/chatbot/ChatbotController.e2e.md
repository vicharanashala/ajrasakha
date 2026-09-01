# Chatbot Controller — E2E Test Documentation

**File:** `src/e2e/chatbot/ChatbotController.e2e.test.ts`

---

## What this covers

All ~61 routes on `ChatbotController` (mounted at `/api/analytics`) — the single
largest previously-uncovered controller by route count. Almost every route is a
read-only analytics query (`@Authorized()`, no role restriction) against real
data from every other suite that ran before this one. A handful of admin/
coordinator write routes manage a **separate "chatbot user" domain**
(source-scoped: `annam`/`whatsapp`) distinct from the app's own `users`
collection — those are exercised against a deliberately fake/non-existent
target id so no real chatbot user data is touched.

Most query DTOs are fully optional with defaults (`ChatbotQueryValidators.ts`)
— calling with no query params is the common case. A few have real required
fields: `DemographicUsersQueryDto.category`/`value`,
`PlatformUsersQueryDto.platform`, `WeatherConcernQueriesQueryDto.concern`,
`download-chatbot-report`'s `startDate`/`endDate`.

---

## Findings

- **BUG-026**: `ChatbotService.assignUsers`/`unAssignUsers` (`PATCH
  /assign-users/:userId`, `/unassign-users/:userId`) `return` the repository
  call directly instead of `await`-ing it inside the `try` block. A rejected
  promise (e.g. the repository's `BadRequestError('Coordinator not found')`) is
  never caught locally — it propagates as an unhandled rejection and surfaces
  as a 500 with a garbled nested error body instead of the clean 400 the
  repository actually threw.
- **BUG-027**: `GET /lifecycle-summary` crashes with a raw `TypeError: Cannot
  read properties of undefined (reading 'map')` on the most basic call
  (defaults, or just `page`/`limit`) — not an edge case, the base case itself
  is broken.
- **Recurring BUG-001-style pattern** (catching a `NotFoundError` and
  rewrapping it as `InternalServerError`, turning a clean 404 into a 500) shows
  up again in `ChatbotService.deleteUser`, `verifyUser`, and `notifyUser` for a
  non-existent target — same root shape as BUG-001, not a new bug number.
- **`assertCoordinatorOwnDashboard`** is a REAL in-handler check on
  `coordinator-duplicate-heat-map/:userId`, `assign-users/:userId`, and
  `unassign-users/:userId`: no-ops for `role === 'admin'`, otherwise requires
  the caller's own email to match the target dashboard's profile email. BUG-017
  still applies underneath it (a moderator reaches the handler regardless of
  role), but the check's own `getUserProfile(userId)` lookup throws for a
  nonexistent target before it can reach the email-comparison branch — so a
  fake target surfaces as 500, not the clean 403 a real mismatched target would
  produce.
- **Investigated and NOT a bug**: `PATCH /users/:userId` (chatbot-user domain)
  has a REAL in-handler check ("Coordinators can only update their own linked
  farmer profile") — a moderator is genuinely blocked here (403), unlike most
  other `@Authorized(['admin', ...COORDINATOR_ROLES])` routes in this
  controller.
- **Environment issue** (not a code bug): all 6 `/dataset/*` routes require
  `DATA_RELEASE_URL`, which isn't configured in this environment — clean 500s
  with a config-missing message.

---

## Test cases (70 total)

- 2 auth-gate tests (bare `@Authorized()` → 401; roles-array → 403)
- ~35 no-param analytics GETs, one `it` each
- 2 required-param validation tests (`users-by-demographic`,
  `users-by-platform`) plus their happy paths
- BUG-027 reproduction (`lifecycle-summary`)
- `GET /filtered-questions` — 5 real dispatch-branch tests
  (`?category=`/`?state=`/`?district=`/`?crop=`/`?status=`), each passing
  `source=whatsapp` explicitly to force `ChatbotRepository`'s DB routing to
  this app's own test DB instead of its default (`source==='annam'`, which
  connects to the **real production** Annam analytics cluster —
  `ANNAM_URL_ANALYTICS`/`production.irscxiv.mongodb.net`, confirmed by
  reading `ChatbotRepository.init()`). 3 of the 8 dispatch branches
  (`closedWithInTwohours`, `period`, `manualSource`) hardcode
  `this.init('annam')` internally regardless of the caller's `source` —
  there is no way to call those three safely for real, so they stay
  untested on purpose.
- `GET /user-questions-data` — 1 real test using the shared moderator
  fixture's email with `source=whatsapp` (same DB-routing reasoning as
  above), exercising `getUserData`/`getUsersMessages`/`getAllUserMessageIds`
  for real. The deeper `getUserQuestionsData` repository query only runs
  when real linked WhatsApp message ids are found — not reached here.
- Cross-domain lookup documentation (`user-questions-data` fake-id case,
  `question-lifecycle`, `user-profile`) — a fake or app-domain id correctly
  500s with a clean not-found message from the chatbot-user domain
- `village-data`, `top-questions/:questionId`, `download-chatbot-report`
  (validation + generation-environment note)
- 6 `/dataset/*` environment-issue tests
- `coordinator-duplicate-heat-map` admin + moderator cases
- BUG-026 reproduction (`assign-users`, `unassign-users`)
- Chatbot-user domain management: `verify-user`, `DELETE /users/:userId`,
  `PATCH /users/:userId` (real ownership check), `change-password` (weak
  password rejected), `POST /users` (missing fields rejected)
- `notify-user`, `response-adherence-table/email` (no real recipient touched)

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/chatbot/ChatbotController.e2e.test.ts
```

---

## Last Run

**Date:** 24-08-2026 | **Result:** ✅ all 64 passed | **Duration:** ~40s
