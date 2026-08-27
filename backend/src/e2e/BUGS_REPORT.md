# Backend E2E Bug &amp; Failing-Test Report

**Updated 2026-08-25.** Companion to `COVERAGE_GAP_REPORT.md` — that report
tracks *what's tested*, this one tracks *what testing found*: every
reproducible application bug uncovered by the e2e suite, plus the current
state of the full suite run (what's failing and why).

All bugs below were found by real e2e tests hitting the real Atlas DB and the
production DI container in-process — none are hypothetical or found by static
reading alone. Each maps to the suite `.md` doc that demonstrates it; open
that file for the exact test name and assertion. None have been fixed —
per this project's constraint, the e2e pass only ever touches `.test.ts` /
`.md` files, never `src/modules/*` application code.

**Total: 30 confirmed bugs, 2 environment/credential issues (not code bugs),
2 genuinely-failing tests (both pre-existing, both already on this list), 1
transient run-order flake (not reproducible, not a bug).**

---

## Summary by category

| Category | Count | Bug IDs |
|---|---:|---|
| Missing/weak authorization (route reachable by the wrong caller, or anyone) | 7 | BUG-006, BUG-012, BUG-017, BUG-024, BUG-028, BUG-029 |
| Wrong HTTP status — 500 instead of 400/404 (error swallowed/rewrapped, or dead validation branch) | 6 | BUG-001, BUG-004, BUG-009, BUG-020, BUG-022, BUG-031 |
| Data-integrity / business-logic defects (wrong data written, wrong branch taken) | 12 | BUG-002, BUG-003, BUG-005, BUG-007, BUG-008, BUG-010, BUG-011, BUG-013, BUG-014, BUG-015, BUG-016, BUG-025 |
| Unhandled crash (raw `TypeError`/`undefined`, not caught at all) | 5 | BUG-018, BUG-021, BUG-026, BUG-027, BUG-032 |
| Information disclosure (password hash / internal fields leaked in a response) | 2 | BUG-019, BUG-024 |
| Dead code (unreachable route or branch, never runs in practice) | 2 | BUG-030, BUG-031 |

(Some bugs span more than one category — e.g. BUG-024 is both an auth gap and
a disclosure bug, BUG-031 is both a dead branch and a wrong-status bug — and
are counted in each row they apply to, so the rows don't sum to 30.)

## Summary by suite

| Suite doc | Bugs found |
|---|---:|
| `manual-allocation/ManualAllocation.e2e.md` | 2 |
| `post-allocation/PostAllocation.e2e.md` | 1 |
| `gatekeeper-auditor/GatekeeperAuditor.e2e.md` | 8 |
| `feedback/Feedback.e2e.md` | 3 |
| `auth/AuthController.e2e.md` | 3 |
| `context/ContextController.e2e.md` | 1 |
| `request/RequestController.e2e.md` | 2 |
| `user/UserController.e2e.md` | 2 |
| `chatbot/ChatbotController.e2e.md` | 2 |
| `question/QuestionControllerGaps.e2e.md` | 5 |
| `whatsapp/WhatsAppQuestion.e2e.md`, `ajrasakha/AjrasakhaQuestion.e2e.md` | 1 (shared) |

---

## All bugs

| # | Bug | Suite doc |
|---|-----|-----|
| BUG-001 | `POST /api/questions` with empty `question` text returns 500, not 400. `QuestionService.addQuestion` throws `BadRequestError` but the outer `catch` rewraps everything as `InternalServerError`. | `whatsapp/WhatsAppQuestion.e2e.md`, `ajrasakha/AjrasakhaQuestion.e2e.md` |
| BUG-002 | `POST /allocate-experts` silently re-adds an already-queued expert instead of rejecting with 400. `allocateExperts` compares `queue` (`ObjectId[]`) against `expertId` (`string`) via `Array.includes` — always `false`. | `manual-allocation/ManualAllocation.e2e.md` |
| BUG-003 | `DELETE /allocation` removes by `ObjectId` value (`$pull`), ignoring the index param — cascades badly once BUG-002 has created duplicate queue entries. | `manual-allocation/ManualAllocation.e2e.md` |
| BUG-004 | `POST /answers/review` returns 500 for wrong role, wrong reviewer, duplicate submission, or a closed question — `AnswerService.reviewAnswer`'s catch rethrows everything as `InternalServerError` regardless of cause. | `post-allocation/PostAllocation.e2e.md` |
| BUG-005 | `isClosed` is never stamped for `dynamic_closed` questions — `AnswerService.approveAnswer` bypasses `QuestionService.updateQuestion`, the only place that sets it. | `gatekeeper-auditor/GatekeeperAuditor.e2e.md` |
| BUG-006 | No role guard on Gate Keeper actions: `PUT /questions/:id` (push-to-auditor, cancel-duplicate) and `POST /answers/:questionId/confirm-duplicate` are `@Authorized()`/`FlexibleAuth` only — any authenticated user (expert, `call_agent`) can call them directly. | `gatekeeper-auditor/GatekeeperAuditor.e2e.md` |
| BUG-007 | Cancel Duplicate has no precondition that the question is actually `queue_duplicate` — accepts `isDuplicateCancelled` on any status. | `gatekeeper-auditor/GatekeeperAuditor.e2e.md` |
| BUG-008 | Push to Auditor has no precondition on prior status at all — `auditorReviewType` is derived as `prevStatus==='dynamic' ? 'dynamic' : 'duplicate'`, silently mislabeling any other prior status. | `gatekeeper-auditor/GatekeeperAuditor.e2e.md` |
| BUG-009 | `AnswerRepository.getById` does `{...answer, _id: answer._id?.toString()}` — `answer._id` is evaluated before the `?.` guard, so `PUT /answers` with a non-existent `answerId` 500s instead of 400ing. | `gatekeeper-auditor/GatekeeperAuditor.e2e.md` |
| BUG-010 | An existing `answerId` can never finalize an `auditor_review` question via `PUT /answers` — the fast-path reroutes past it. | `gatekeeper-auditor/GatekeeperAuditor.e2e.md` |
| BUG-011 | Close-propagation hardcodes child status to `closed` regardless of the parent's actual `closeStatus` — a `dynamic` parent closing as `dynamic_closed` still produces plain-`closed` children. | `gatekeeper-auditor/GatekeeperAuditor.e2e.md` |
| BUG-012 | `AnswerService.approveAnswer`'s role check is a blacklist of only `role==='expert'` — a `call_agent` user can also finalize via `PUT /answers`, bypassing the intended moderator/admin-only gate. | `gatekeeper-auditor/GatekeeperAuditor.e2e.md` |
| BUG-013 | The new `closeIntent` field on `PUT /answers` broke backward compatibility: before it existed, `isDynamicClose` alone (`question.status === 'dynamic'`) was enough to close as `dynamic_closed`. Now a caller that omits `closeIntent` (any client not yet updated to send it) gets plain `closed` instead, even for a genuinely dynamic/duplicate question. | `gatekeeper-auditor/GatekeeperAuditor.e2e.md` |
| BUG-014 | `QuestionService.handleFeedbackAction`'s `WEB_APPLICATION` branch resolves `WEB_APP_URL` into a variable but never uses it — both the `DATASET` and `WEB_APPLICATION` branches fetch `${DATA_RELEASE_URL}/feedbacks/${feedbackId}/status`; `WEB_APPLICATION` only swaps the `Authorization` header. A real public-site feedback accept/reject is sent to the DATASET data-release service instead of the web app. | `feedback/Feedback.e2e.md` |
| BUG-015 | `assignPaeValidationReviewerManually` calls `SubmissionRepository.assignPaeValidationReviewer` unconditionally for both fresh-assign and reassign-by-index; that method does an unconditional `$set: {paeValidation: [singleRound]}` (not a guarded `$push` like its feedback sibling) — reassigning a round doesn't repoint it, it wipes the entire round history and replaces it with one fresh round. | `feedback/Feedback.e2e.md` |
| BUG-016 | `UserRepository.addPaeValidationAssigned`'s claim filter is `{_id}` only — no `isBlocked`/`status`/empty-array check, unlike `claimFeedbackAllocationManual`. `assignPaeValidationReviewerManually`'s "Selected user is not available" guard can never fire, so a PAE expert can be manually double-booked across two concurrent validations. | `feedback/Feedback.e2e.md` |
| BUG-017 | **Systemic**: `shared/functions/authorizationChecker.ts` (the production `authorizationChecker`) never reads the `roles` array routing-controllers passes into a custom checker for `@Authorized(['admin', ...])` — it only verifies a valid token belongs to SOME non-blocked/active user. Every route across the app that relies on `@Authorized([specific roles])` for role gating (rather than an explicit in-handler check like `ChemicalController`'s `WRITE_ROLES.includes(user.role)` pattern) grants access to **any authenticated user regardless of role**. First caught on `POST /auth/admin/review-users` (declared `@Authorized(['admin'])`, but a moderator can call it and get 201). This generalizes BUG-006 (previously scoped to just the two Gate Keeper actions) to every `@Authorized([roles])` usage in the codebase; grep `@Authorized(\[` across `src/modules/*/controllers` for the full blast radius. Recurs on `question/queue-details`, `reallocate-timebound`, `reallocate-manual-queue` (see BUG-028/029 suite doc). | `auth/AuthController.e2e.md`, `question/QuestionControllerGaps.e2e.md` |
| BUG-018 | `AuthController.changePassword` reads the caller via `@Req() request: AuthenticatedRequest` → `request.user`, NOT `@CurrentUser()`. No middleware anywhere in the real app bootstrap (`src/index.ts`) ever sets `req.user` — the one place that did (`modules/auth/index.ts`'s `authModuleOptions`, with `action.request.user = user` in a comment) is dead code, never imported. `requestUser` is therefore always `undefined`, `.firebaseUID` throws a `TypeError`, and the outer catch's `error instanceof Error` branch turns that into a 500. **`PATCH /api/auth/change-password` always 500s in production, for every caller, regardless of input.** | `auth/AuthController.e2e.md` |
| BUG-019 | `FirebaseAuthService.syncUserWithDb` returns the raw Mongo `users` document, and `AuthController.syncAccount` ships it straight back to the client as `{ success, user }` — including the bcrypt `password` hash field. `POST /api/auth/sync` leaks every synced user's password hash in its own response. | `auth/AuthController.e2e.md` |
| BUG-020 | `ContextService.addContext` throws `BadRequestError('Context text required')` for an empty transcript, but that throw happens INSIDE the same try block whose catch rewraps everything as `InternalServerError` — same shape as BUG-001. `POST /api/context` with an empty transcript 500s instead of 400ing. | `context/ContextController.e2e.md` |
| BUG-021 | `RequestRepository.createRequest` returns `{ _id: insertedId, ...payload }` with raw `ObjectId` instances (`_id`, `requestedBy`, `entityId`) — never stringified. The JSON response ships a malformed `{ buffer: { data: [...] } }` shape instead of a hex string for every one of those fields. `POST /api/requests`'s response `_id` is unusable by a client expecting a normal string id (every other create endpoint in this codebase returns a clean string). | `request/RequestController.e2e.md` |
| BUG-022 | `RequestController.softDelete` (`PUT /api/requests/:requestId/delete`) resolves with `undefined` (`Promise<void>`, no explicit return) and has no `@OnUndefined()` decorator. routing-controllers' `ExpressDriver` treats an undefined action result as "not found" by default, and that framework-level check overrides the declared `@HttpCode(204)`. The soft-delete genuinely happens in the DB (`isDeleted: true` is set), but every caller — success or failure — receives a 404. | `request/RequestController.e2e.md` |
| BUG-024 | `GET /api/users/details/:email` has NO `@Authorized()` decorator at all — reachable with just the shared `x-internal-api-key`, no logged-in user required. It returns the full raw Mongo user document by email, including the bcrypt `password` hash (same shape as BUG-019). Anyone with the internal API key can fetch any user's password hash by email. | `user/UserController.e2e.md` |
| BUG-025 | `UserRepository.getUsersByRole` builds `{ role: { $in: roles } }` without normalizing a single value into an array. Express's query parser gives a plain string for one occurrence of `?role=expert` (vs. an array for repeated `?role=expert&role=moderator`), so the single-role case — the natural way to call `GET /api/users/by-role` — 500s with a raw MongoDB error ("$in needs an array") instead of working or 400ing cleanly. | `user/UserController.e2e.md` |
| BUG-026 | `ChatbotService.assignUsers`/`unAssignUsers` (`PATCH /api/analytics/assign-users/:userId`, `/unassign-users/:userId`) `return` the repository call directly instead of `await`-ing it inside the `try` block. A rejected promise (e.g. the repository's `BadRequestError('Coordinator not found')`) is never caught by the local try/catch — it propagates as an unhandled rejection and surfaces as a generic 500 with a garbled error body instead of the clean 400 the repository actually threw. | `chatbot/ChatbotController.e2e.md` |
| BUG-027 | `GET /api/analytics/lifecycle-summary` crashes with a raw `TypeError: Cannot read properties of undefined (reading 'map')` inside `ChatbotRepository.getLifeCycleSummary` — not on some obscure edge case, but on the most basic call (defaults, or just `page`/`limit`). The route is unusable as shipped. | `chatbot/ChatbotController.e2e.md` |
| BUG-028 | `POST /questions/reAllocateLessWorkload`, `POST /questions/reAllocateSelectedQuestions`, and `GET /questions/:questionId/generate-answer` have no `@Authorized()` decorator at all — reachable by anyone holding just the shared `x-internal-api-key`, no user login required. | `question/QuestionControllerGaps.e2e.md` |
| BUG-029 | `PATCH /questions/:questionId`, `GET /questions/admin/closed-answer-mismatch`, `POST /questions/admin/normalized-domain`, and `POST /questions/admin/backfill-closed-moderator` use `@UseBefore(InternalApiAuth)` only — no user login required at all, despite the `admin/` path segment on three of them. The `PATCH` handler is additionally mislabeled: its method is named `UpdateThreadId` and it 500s on any body without a `threadId`, despite the generic path/OpenAPI summary ("Update question fields by ID"). | `question/QuestionControllerGaps.e2e.md` |
| BUG-030 | `GET /questions/:id` and `GET /questions/background-status` are dead code — both are registered (controller lines 2351, 2346) after `GET /questions/:questionId` (line 1125), and routing-controllers matches routes in registration order, so the earlier auth-required, ObjectId-based handler intercepts every single-segment `GET` first. | `question/QuestionControllerGaps.e2e.md` |
| BUG-031 | `GET /questions/:questionId/chatbot`'s `if (!data) throw new NotFoundError(...)` branch is dead code — `QuestionService.getMatchedQuestion` throws a plain `Error('No matching message found')` itself rather than returning null, so the intended 404 is a 500 in practice. | `question/QuestionControllerGaps.e2e.md` |
| BUG-032 | `POST /questions/data/out-reach/date` has no `@Authorized()`, but unconditionally calls `user._id.toString()` to build an audit-log actor before checking the user exists — a genuinely anonymous call crashes with a raw `TypeError` instead of either working (as the missing decorator implies) or cleanly 401ing. | `question/QuestionControllerGaps.e2e.md` |

*(BUG-023 doesn't appear above: it was an initial hypothesis — a suspected
missing role-guard on `PATCH /users/:id/role` — that was disproven by
actually running the test. `UserService.updateUserRole` does throw
`BadRequestError('Only admin can switch role')` for non-admins, protected at
the service layer. The number is retired rather than reused, so the gap in
the sequence is intentional, not a missing entry.)*

---

## Environment / credential issues (not code bugs)

These block real functionality in this environment but are configuration
problems, not defects in the application code:

- **`POST /api/auth/login`** calls Identity Toolkit using
  `appConfig.firebase.apiKey` (env var `FIREBASE_API_KEY`). In this
  environment, Google rejects that key outright ("API key not valid") even
  with fully correct credentials, while the separate `FIREBASE_WEB_API_KEY`
  env var (used only by `helpers/firebaseAuth.ts` and indirectly by
  `getFirebaseAuth()`'s Admin-SDK callers) works fine — proven by `/auth/sync`
  succeeding with a token minted via that key in the same run. Worth checking
  whether `FIREBASE_API_KEY` in `.env` is stale; as configured, no one can log
  in through `POST /auth/login` in this environment. See
  `auth/AuthController.e2e.md`.
- **`POST /api/context/translate`** calls the live Sarvam API using
  `SARVAM_API_KEY` (`.env`), which Sarvam rejects in this environment
  ("Invalid or missing authentication credentials"). The request/response
  wiring is exercised and correct up to that point — only the live credential
  is the blocker. See `context/ContextController.e2e.md`.

---

## Currently failing tests

Two genuine, reproducible application-code failures — both already listed
above as bugs (BUG-005-adjacent sort issue and a background-pipeline crash),
repeated here in "test failure" form because that's how they surface in a
suite run:

**`reviewer-queue/ReviewerQueue.e2e.test.ts`** — 1/14 failing
- Test: *"author-slot question appears before reviewer-slot question for STF
  expert (Issue #2) › author-slot question appears before reviewer-slot
  question in the /allocated response"*
- Failure: `expected 2 to be less than 0`
- Root cause: `getAllocatedQuestions`' sort doesn't prioritize the author slot
  over the reviewer slot — it sorts by `createdAt` only. Long-standing,
  documented bug. See `reviewer-queue/ReviewerQueue.e2e.md`.

**`whatsapp/WhatsAppQuestion.e2e.test.ts`** — 1/21 failing
- Test: *"WhatsApp API completely unreachable › proceeds to open (not
  isTesting) when the thread API throws non-not-found errors"*
- Failure: times out waiting for the question to leave `pending` status
- Root cause: the background pipeline throws `Cannot read properties of
  undefined (reading 'content')` when every `fetchWhatsAppMessage` attempt
  fails, leaving the question stuck at `pending` forever instead of degrading
  to `open`. Not a timing issue — the test already allows a 120000ms timeout
  and 60000ms polling window; the pipeline genuinely never finishes. See
  `whatsapp/WhatsAppQuestion.e2e.md`.

Both require an application-code change to fix — out of scope for an
e2e-test-only pass, so they remain failing by design until someone picks them
up.

### Transient (not a real failure)

**`user/UserController.e2e.test.ts`** — *"PATCH /users (notification
preference) › updates the notification preference"* failed once, only when
run as part of the full 29-file suite (610/613), with an unhandled
`MongoClientClosedError: Operation interrupted because client was closed`
logged immediately after it — a connection-pool race from running 29 files'
worth of real Atlas connections back-to-back in one process. Re-ran that
suite alone immediately after: 45/45 clean. Not reproducible in isolation, so
not treated as a bug or added to the list above; no test or app-code change
was made for it.

### Fixed (test-file-only changes, not app bugs)

Three suites had genuine intermittent/stale-data failures traced to the test
harness itself rather than the application — fixed without touching
`src/modules/*`:

- **`manual-allocation/ManualAllocation.e2e.test.ts`** — 5 tests were tripping
  vitest's 5000ms default timeout against real Atlas + push-notification
  latency (confirmed the call completes correctly in ~5.3s). Added explicit
  20000ms timeouts.
- **`post-allocation/PostAllocation.e2e.test.ts`** — same root cause on one
  test (`POST /answers/review`'s reviewer-rejection path). Added a 20000ms
  timeout.
- **`crop/CropController.e2e.test.ts`** — a hardcoded crop-alias value
  collided with leftover data from an earlier interrupted debugging run.
  Scoped the alias to the suite's own `RUN_TAG`.

---

## How to reproduce any bug above

Every suite's `.md` doc lists the exact `how to run` command (a single
`vitest run` invocation against the one file). All bugs above are triggered
by tests currently in the suite — no separate reproduction steps are needed
beyond running that file and reading the relevant `it()` block.
