# Test Map — Where to Update Tests When You Change Code

**Audience: the dev team.** <br/>
This is a lookup index —
you changed a route, a service function, or a feature, and want the exact
e2e test file to open, without reading the whole suite first.

This file doesn't explain _how_ the harness works or _what's_ covered in
prose form — that's `README.md` (shared setup conventions, coverage
numbers, test-user accounts) and `Failed_tests.md` (what's currently red).
This file only answers "where do I look."

## How to use this

1. **Changing a controller route?** → [By controller / route](#by-controller--route) below. Find your controller, then your route's method+path.
2. **Changing a service / business-logic file directly** (not through a controller you can name)? → [By service](#by-service-directly-not-through-a-single-route).
3. **Working on a multi-step flow** (allocation, ingestion, review, feedback) rather than one endpoint? → [By feature workflow](#by-feature-workflow-spans-multiple-controllers) — these suites cut across several controllers/services and won't show up if you only search by controller name.
4. Most rows link to a test file **and** a `.md` doc in the same folder — open the `.md` first, it has the actual scenario list; the `.test.ts` is the implementation.
5. A route/service marked **not covered** means: add a new `it()` to the file named in that row (it's the right file for that area even if empty today), following the harness conventions in `README.md`. Don't create a new suite folder unless the feature genuinely doesn't fit any existing one.

**Keeping this file honest:** when you add, move, rename, or delete a route
or a test file, update the matching row in the same PR. This file is
hand-maintained, not generated — it goes stale exactly as fast as people
stop updating it.

---

## By controller / route

Each table is every route decorator in that controller, in file order, with
the exact path string to grep for in both the controller and its test
file. Line numbers aren't included on purpose — they drift; the path
string doesn't.

### `AnswerController` — `/answers` (`src/modules/answer/controllers/AnswerController.ts`)

Primary: [`answer/AnswerControllerGaps.e2e.test.ts`](answer/AnswerControllerGaps.e2e.md) · Also exercised heavily by [`post-allocation/PostAllocation.e2e.test.ts`](post-allocation/PostAllocation.e2e.md) (the review/approval state machine lives here, not in this controller's own suite)

| Method | Path                             | Where it's tested                                                        |
| ------ | -------------------------------- | ------------------------------------------------------------------------ |
| POST   | `/`                              | AnswerControllerGaps                                                     |
| POST   | `/review`                        | post-allocation (peer-review flow)                                       |
| POST   | `/fetch-ai-answer`               | AnswerControllerGaps                                                     |
| GET    | `/submissions`                   | AnswerControllerGaps                                                     |
| GET    | `/finalizedAnswers`              | AnswerControllerGaps                                                     |
| PUT    | `/:answerId`                     | post-allocation (moderator edit-final)                                   |
| PUT    | `/`                              | post-allocation (moderator approve/finalize)                             |
| POST   | `/moderator/approve`             | post-allocation                                                          |
| POST   | `/:questionId/confirm-duplicate` | _not covered — see README "Key API endpoints" table, no real role guard_ |
| DELETE | `/:questionId/:answerId`         | post-allocation (delete non-final answer)                                |
| GET    | `/faqs/mod`                      | AnswerControllerGaps                                                     |

### `AuditTrailsController` — `/audit-trails` (`src/modules/auditTrails/controllers/AuditTrailsController.ts`)

[`auditTrails/AuditTrailsController.e2e.test.ts`](auditTrails/AuditTrailsController.e2e.md)

| Method | Path                               |
| ------ | ---------------------------------- |
| GET    | `/`                                |
| GET    | `/moderator`                       |
| GET    | `/shift-based-audit-action-counts` |
| GET    | `/question/:questionId`            |

### `AuthController` — `/auth` (`src/modules/auth/controllers/AuthController.ts`)

[`auth/AuthController.e2e.test.ts`](auth/AuthController.e2e.md) · For the _real_ (non-faked) auth-gate functions every other suite bypasses — `authorizationChecker`, `currentUserChecker`, `FlexibleAuth` — see [`auth/RealAuthGate.e2e.test.ts`](auth/RealAuthGate.e2e.md) instead.

| Method | Path                   |
| ------ | ---------------------- |
| POST   | `/signup`              |
| POST   | `/signup/google`       |
| POST   | `/admin/review-users`  |
| PATCH  | `/change-password`     |
| POST   | `/resend-verification` |
| POST   | `/forgot-password`     |
| POST   | `/login`               |
| POST   | `/sync`                |

### `ChatbotController` — `/analytics` (`src/modules/chatbot/controllers/ChatbotController.ts`)

[`chatbot/ChatbotController.e2e.test.ts`](chatbot/ChatbotController.e2e.md) — ~61 read-only analytics/dashboard routes, all covered except `/state-wise-analytics`, `/weather-concern-queries`, `/active-users-trend`, `/feedback-by-location` (real tests exist for these — a coverage-script blind spot only, see README "Missing tests"). Grep this controller file for the full route list — it's the largest single route count in the app (~60) and not worth flattening into a table here; the suite covers essentially all of it 1:1.

Routes that mutate state (not just read analytics) worth knowing by name:
`PATCH /verify-user/:userId`, `DELETE /users/:userId`, `PATCH /users/:userId`,
`POST /admin/users/:userId/change-password`, `POST /users`,
`PATCH /assign-users/:userId`, `PATCH /unassign-users/:userId`,
`POST /notify-user` — all covered in the same suite.

### `ChemicalController` — `/chemicals` (`src/modules/chemical/controllers/ChemicalController.ts`)

[`chemical/ChemicalCrud.e2e.test.ts`](chemical/ChemicalCrud.e2e.md)

| Method | Path           |
| ------ | -------------- |
| GET    | `/`            |
| GET    | `/:chemicalId` |
| POST   | `/`            |
| PUT    | `/:chemicalId` |
| DELETE | `/:chemicalId` |

### `CommentController` — `/comments` (`src/modules/comment/controllers/CommentController.ts`)

[`comment/CommentController.e2e.test.ts`](comment/CommentController.e2e.md)

| Method | Path                                     |
| ------ | ---------------------------------------- |
| GET    | `/question/:questionId/answer/:answerId` |
| POST   | `/question/:questionId/answer/:answerId` |

### `ContextController` — `/context` (`src/modules/context/controllers/ContextController.ts`)

[`context/ContextController.e2e.test.ts`](context/ContextController.e2e.md)

| Method | Path              |
| ------ | ----------------- |
| POST   | `/`               |
| POST   | `/translate`      |
| POST   | `/speech-to-text` |

### `CropController` — `/crops` (`src/modules/crop/controllers/CropController.ts`)

[`crop/CropController.e2e.test.ts`](crop/CropController.e2e.md)

| Method | Path                  |
| ------ | --------------------- |
| GET    | `/`                   |
| GET    | `/bulk-status`        |
| GET    | `/bulk-status/:jobId` |
| GET    | `/download`           |
| GET    | `/:cropId`            |
| POST   | `/`                   |
| PUT    | `/:cropId`            |

### `PublicDashboardController` — `/public-dashboard` (`src/modules/dashboard/controllers/PublicDashboardController.ts`)

[`dashboard/PublicDashboardController.e2e.test.ts`](dashboard/PublicDashboardController.e2e.md)

| Method | Path               |
| ------ | ------------------ |
| GET    | `/saturated-crops` |
| GET    | `/users`           |
| GET    | `/items`           |
| POST   | `/items`           |
| POST   | `/media`           |
| PUT    | `/items-reorder`   |
| PUT    | `/items/:id`       |
| DELETE | `/items/:id`       |

### `locationController` — `/location` (`src/modules/lgd/controllers/locationController.ts`)

[`lgd/LocationController.e2e.test.ts`](lgd/LocationController.e2e.md)

| Method | Path                               | Note                                                                                              |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| GET    | `/states`                          |                                                                                                   |
| PUT    | `/states/:stateCode/aliases`       |                                                                                                   |
| POST   | `/states`                          |                                                                                                   |
| DELETE | `/states/:stateCode`               |                                                                                                   |
| GET    | `/districts`                       |                                                                                                   |
| GET    | `/districts/all`                   | singleton-record route — see suite `.md` for the pre-clean/defensive-cleanup pattern              |
| PUT    | `/districts/:districtCode/aliases` |                                                                                                   |
| POST   | `/districts`                       |                                                                                                   |
| POST   | `/districts/all`                   | singleton, same as above                                                                          |
| DELETE | `/districts/:districtCode`         |                                                                                                   |
| GET    | `/audits`                          |                                                                                                   |
| GET    | `/blocks`                          |                                                                                                   |
| GET    | `/villages`                        |                                                                                                   |
| GET    | `/kvks`                            |                                                                                                   |
| POST   | `/kvks/sync`                       | **not covered** — real script against live reference data, see README "Deliberately out of scope" |
| GET    | `/download`                        |                                                                                                   |

### `NotificationController` — `/notifications` (`src/modules/notification/controllers/NotificationController.ts`)

[`notification/NotificationController.e2e.test.ts`](notification/NotificationController.e2e.md)

| Method | Path                 |
| ------ | -------------------- |
| POST   | `/`                  |
| GET    | `/`                  |
| GET    | `/user/:userId`      |
| POST   | `/user/:userId/send` |
| POST   | `/users/send`        |
| DELETE | `/:notificationId`   |
| PATCH  | `/:notificationId`   |
| PATCH  | `/`                  |
| POST   | `/subscriptions`     |
| POST   | `/send-notification` |

### `PerformanceController` — `/performance` (`src/modules/performance/controllers/PerformanceController.ts`)

[`performance/PerformanceController.e2e.test.ts`](performance/PerformanceController.e2e.md) — all 18 routes covered.

| Method | Path                                 |
| ------ | ------------------------------------ |
| GET    | `/dashboard`                         |
| GET    | `/overview`                          |
| GET    | `/golden-dataset`                    |
| GET    | `/contribution-trend`                |
| GET    | `/status-overview`                   |
| GET    | `/expert-performance`                |
| POST   | `/questions-analytics`               |
| GET    | `/heatMapofReviewers`                |
| GET    | `/workload`                          |
| GET    | `/level-report`                      |
| POST   | `/check-in`                          |
| POST   | `/cron-snapshot/send-report`         |
| GET    | `/shift-based-metrics`               |
| GET    | `/shift-based-trends`                |
| GET    | `/shift-based-status-distribution`   |
| GET    | `/shift-based-level-distribution`    |
| GET    | `/shift-based-top-experts`           |
| GET    | `/shift-based-top-approving-experts` |

### `FarmerController` — `/farmer` (`src/modules/plivo/controllers/FarmerController.ts`)

[`plivo/FarmerController.e2e.test.ts`](plivo/FarmerController.e2e.md)

| Method | Path        |
| ------ | ----------- |
| GET    | `/`         |
| GET    | `/:phoneNo` |
| POST   | `/`         |
| PUT    | `/:phoneNo` |
| DELETE | `/:phoneNo` |

### `PlivoController` — `/plivo` (`src/modules/plivo/controllers/PlivoController.ts`)

[`plivo/PlivoController.e2e.test.ts`](plivo/PlivoController.e2e.md)

| Method | Path             | Note                                                                                            |
| ------ | ---------------- | ----------------------------------------------------------------------------------------------- |
| POST   | `/answer`        | **not covered** — Plivo's own inbound webhook, not called by any client of this app, see README |
| GET    | `/history`       |                                                                                                 |
| POST   | `/send-message`  |                                                                                                 |
| GET    | `/analytics`     |                                                                                                 |
| GET    | `/acc-analytics` |                                                                                                 |

### `RequestController` — `/requests` (`src/modules/request/controllers/RequestController.ts`)

[`request/RequestController.e2e.test.ts`](request/RequestController.e2e.md)

| Method | Path                 |
| ------ | -------------------- |
| POST   | `/`                  |
| GET    | `/`                  |
| GET    | `/:requestId`        |
| PUT    | `/:requestId/status` |
| PUT    | `/:requestId/delete` |

### `ReRouteController` — `/reroute` (`src/modules/reroute/controllers/ReRouteController.ts`)

[`reroute/ReRouteController.e2e.test.ts`](reroute/ReRouteController.e2e.md) — auth-gate + error-path coverage, plus a real allocate → expert-reject / moderator-reject happy path.

| Method | Path                                    |
| ------ | --------------------------------------- |
| POST   | `/:questionId/allocate-reroute-experts` |
| POST   | `/allocated`                            |
| GET    | `/:questionId`                          |
| PATCH  | `/:rerouteId/:questionId`               |
| GET    | `/:answerId/history`                    |
| PATCH  | `/:questionId/:expertId/action`         |

### `UserController` — `/users` (`src/modules/user/controllers/UserController.ts`)

[`user/UserController.e2e.test.ts`](user/UserController.e2e.md) — all 30 routes covered, including gatekeeper role-guard checks.

| Method | Path                             |
| ------ | -------------------------------- |
| GET    | `/me`                            |
| GET    | `/review-level`                  |
| PUT    | `/`                              |
| GET    | `/admin/all`                     |
| GET    | `/admin/all/export`              |
| GET    | `/all`                           |
| GET    | `/moderators`                    |
| GET    | `/pae-val-experts`               |
| GET    | `/stf-moderators`                |
| PATCH  | `/`                              |
| PATCH  | `/point`                         |
| GET    | `/list`                          |
| PATCH  | `/expert`                        |
| PATCH  | `/stf`                           |
| PATCH  | `/status`                        |
| PATCH  | `/:id/role`                      |
| GET    | `/details/:email`                |
| POST   | `/:id/remove-allocations`        |
| PATCH  | `/:id/verify`                    |
| GET    | `/call-agents`                   |
| POST   | `/set-call-agents`               |
| PATCH  | `/call-agents/:id/toggle-active` |
| POST   | `/call-agents/toggle-status`     |
| POST   | `/call-agents/heartbeat`         |
| POST   | `/call-agents/available`         |
| POST   | `/verification-request`          |
| GET    | `/user-history`                  |
| PATCH  | `/training-users`                |
| GET    | `/working-hours`                 |
| GET    | `/reviewer-lifecycle`            |
| GET    | `/by-role`                       |

### `WhatsAppController` — `/whatsapp` (`src/modules/whatsapp/controllers/WhatsAppController.ts`)

[`whatsapp/WhatsAppController.e2e.test.ts`](whatsapp/WhatsAppController.e2e.md) — this controller's own routes only. For the WhatsApp _question ingestion pipeline_ (a background job, not a route on this controller), see [`whatsapp/WhatsAppQuestion.e2e.test.ts`](whatsapp/WhatsAppQuestion.e2e.md) in the feature-workflow table below.

| Method | Path                       | Note                                                                                                       |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/threads`                 |                                                                                                            |
| GET    | `/threads/:threadId/:date` | success path only smoke-tested — a real call hangs against this environment's WhatsApp backend, see README |
| POST   | `/send-message`            |                                                                                                            |
| GET    | `/inactive-users`          |                                                                                                            |
| GET    | `/unique-users`            |                                                                                                            |
| GET    | `/users`                   |                                                                                                            |

### `QuestionController` — `/questions` (`src/modules/question/controllers/QuestionController.ts`)

The largest controller (~90 routes) and the only one split across many
suite files by feature area, not one-to-one. Three suites cover its
"plain CRUD/report" surface directly:

- [`question/QuestionCreate.e2e.test.ts`](question/QuestionCreate.e2e.md) — creation, get, update, delete, bulk-delete
- [`question/QuestionControllerGaps.e2e.test.ts`](question/QuestionControllerGaps.e2e.md) — the other ~40 routes: reports/downloads, admin utilities, feedback reads, moderator actions
- [`question/QuestionControllerOps.e2e.test.ts`](question/QuestionControllerOps.e2e.md) — internal `/background/*` ops/data-repair routes

Everything allocation- or workflow-shaped lives in a dedicated suite named
after the _business flow_, not the controller — see
[By feature workflow](#by-feature-workflow-spans-multiple-controllers) below. If you're touching one of these
route groups, go there instead of the two files above:

| Route group (path prefix/pattern)                                                                                                              | Go to                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/queue-details`, `/allocated`, `/allocated/page`, `/reAllocateLessWorkload`, `/reallocation-preview`, `/reallocate-manual`, `/role-dashboard` | `reviewer-queue/`, `allocation-ordering/`                                                                                                        |
| `/:id/toggle-auto-allocate`, `/:id/allocate-experts`, `/:id/allocation` (DELETE), `/reallocate-timebound`, `/reallocate-manual-queue`          | `auto-allocation/`, `manual-allocation/`                                                                                                         |
| `/:id/role-assignee`, `/:id/role-allocation`, `/bulk-pae-allocate`, `/:id/replace-queue-expert`, `/reAllocateSelectedQuestions`                | `manual-allocation/`, `allocation-ordering/` (`bulk-pae-allocate` itself is **not covered** — worker-thread module resolution issue, see README) |
| `/:id/moderator` (PATCH/DELETE), `/:id/approve-initial-answer`, `/:id/hold`, `/:id/generate-answer`                                            | `post-allocation/`                                                                                                                               |
| `/:id/check-duplicate`, `/check-status`, `/:id/chatbot`                                                                                        | `gatekeeper-auditor/`                                                                                                                            |
| `/:id/feedback*`, `/feedback/*`, `/:id/pae-val*`, `/pae/validations/*`, `/pae-val/queue-details`                                               | `feedback/`                                                                                                                                      |
| AJRASAKHA-specific ingestion fields on `POST /`                                                                                                | `ajrasakha/`                                                                                                                                     |
| WhatsApp-specific ingestion pipeline (not a route here — background job triggered by question creation)                                        | `whatsapp/WhatsAppQuestion.e2e.test.ts`                                                                                                          |

**Not covered at all** (see README "Missing tests" for the full reasoning
per group, not repeated here): `/generate`, `/generate-by-call-context`,
`/call-summary` (real external AI calls); `/acc-agent/thread`,
`/extract`, `/update-state`, `/resume` (ACC-agent state machine);
`/check-overlaps`, `/run-migration`, `/migrate-firebase-users`
(cross-DB/staging scripts).

---

## By service (directly, not through a single route)

Use this when you're changing a service method that several routes or
crons call, and want every suite that could be affected — not just the
one route you're thinking of.

| Service                                                                                                                                                                                                                                                               | Primary controller(s)                    | Also exercised by (cross-cutting)                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AllocationService` (`question/services/AllocationService.ts`)                                                                                                                                                                                                        | `QuestionController` (allocation routes) | `auto-allocation/`, `manual-allocation/`, `allocation-ordering/`, `post-allocation/`, `reviewer-queue/` — **touch this file, check all five**                                                                                              |
| `QuestionService` + its sub-services (`AllocationService`, `DuplicateService`, `FeedbackService`, `ModeratorQueueService`, `PaeValidationService`, `QuestionAiService`, `QuestionMaintenanceService`, `QuestionReportService`, `QueueService`, `RoleAssigneeService`) | `QuestionController`                     | `question/QuestionCreate`, `question/QuestionControllerGaps`, `question/QuestionControllerOps`, `gatekeeper-auditor/`, `feedback/`, `ajrasakha/` — pick the suite matching the sub-service's feature area from the route-group table above |
| `AnswerService`                                                                                                                                                                                                                                                       | `AnswerController`                       | `post-allocation/` (review/approval state machine — most of this service's real branch coverage comes from here, not `answer/`)                                                                                                            |
| `NotificationService`                                                                                                                                                                                                                                                 | `NotificationController`                 | Called from almost every allocation/review action across `post-allocation/`, `auto-allocation/`, etc. — those suites assert notification side-effects inline rather than through `NotificationController` directly                         |
| `UserService`                                                                                                                                                                                                                                                         | `UserController`                         | `QuestionController` (allocation eligibility), `ReRouteController`, `PlivoController` (call-agent routes)                                                                                                                                  |
| `ChemicalService`                                                                                                                                                                                                                                                     | `ChemicalController`                     | —                                                                                                                                                                                                                                          |
| `CropService`                                                                                                                                                                                                                                                         | `CropController`                         | —                                                                                                                                                                                                                                          |
| `ContextService`                                                                                                                                                                                                                                                      | `ContextController`                      | —                                                                                                                                                                                                                                          |
| `RequestService`                                                                                                                                                                                                                                                      | `RequestController`                      | —                                                                                                                                                                                                                                          |
| `CommentService`                                                                                                                                                                                                                                                      | `CommentController`                      | —                                                                                                                                                                                                                                          |

---

## By feature workflow (spans multiple controllers)

These suites are organized around a **business scenario**, not a
controller. If you're changing anything allocation-, review-, or
ingestion-shaped, one of these is almost certainly the right place —
route-level grep alone will miss them.

| Suite                                                                                                 | Business flow                                                                                              | Controllers/services it exercises                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ajrasakha/AjrasakhaQuestion.e2e.test.ts`](ajrasakha/AjrasakhaQuestion.e2e.md)                       | AJRASAKHA-source question ingestion (fields specific to this source)                                       | `QuestionController` create route, ingestion pipeline                                                                                                                                                                             |
| [`whatsapp/WhatsAppQuestion.e2e.test.ts`](whatsapp/WhatsAppQuestion.e2e.md)                           | Full WhatsApp ingestion pipeline: thread validation → GDB/LLM duplicate check → open/duplicate/non_agri    | Ingestion background job, `DuplicateService`, `QuestionAiService`                                                                                                                                                                 |
| [`manual-allocation/ManualAllocation.e2e.test.ts`](manual-allocation/ManualAllocation.e2e.md)         | Allocate/remove experts on an OUTREACH (manual-source) question                                            | `AllocationService`, `RoleAssigneeService`                                                                                                                                                                                        |
| [`auto-allocation/AutoAllocation.e2e.test.ts`](auto-allocation/AutoAllocation.e2e.md)                 | Background allocation queue, preference scoring, time-bound (WHATSAPP/AJRASAKHA) allocation, capacity caps | `AllocationService` — 6 tests that depended on immediate allocation from a 3-account fixture pool are commented out (`/* ... */`) as unavoidably flaky in this environment, not deleted; see `Failed_tests.md`'s "Disabled tests" |
| [`allocation-ordering/AllocationOrdering.e2e.test.ts`](allocation-ordering/AllocationOrdering.e2e.md) | Chronological queue ordering, history exclusion rules                                                      | `AllocationService`, `QueueService`                                                                                                                                                                                               |
| [`post-allocation/PostAllocation.e2e.test.ts`](post-allocation/PostAllocation.e2e.md)                 | Expert peer-review → moderator-approval state machine (the full answer lifecycle)                          | `AnswerController`, `AnswerService`, `AllocationService`, `NotificationService`                                                                                                                                                   |
| [`reviewer-queue/ReviewerQueue.e2e.test.ts`](reviewer-queue/ReviewerQueue.e2e.md)                     | `/allocated` visibility rules: author slot vs. reviewer slot, exclusions                                   | `QuestionController` queue routes, `QueueService`                                                                                                                                                                                 |
| [`gatekeeper-auditor/GatekeeperAuditor.e2e.test.ts`](gatekeeper-auditor/GatekeeperAuditor.e2e.md)     | Push-to-auditor, finalize, duplicate handling, the gatekeeper queue cron                                   | `DuplicateService`, `ModeratorQueueService`                                                                                                                                                                                       |
| [`feedback/Feedback.e2e.test.ts`](feedback/Feedback.e2e.md)                                           | PAE_Validation / DATASET / WEB_APPLICATION feedback routing, PAE validation cron                           | `FeedbackService`, `PaeValidationService` — **2 tests currently failing, real app bug, see `Failed_tests.md`**                                                                                                                    |

---

## Before adding a test for low code coverage: check `README.md`'s ceiling table first

If you're here because `pnpm run test:e2e:code-coverage` flagged a service
as low-coverage, **check `README.md`'s "Code coverage ceiling" section
before writing a test for it.** A large fraction of remaining gaps are
dead code (nothing routes to the function), writes to the real production
Annam analytics cluster (`ChatbotRepository`'s user-management methods —
do not add a success-path test for these), or real third-party API calls
with no mock boundary in this harness (Plivo audio, LGD heatmap, AI/ACC-
agent). Adding a test for these either can't work (nothing to call) or is
actively risky (real production writes).

## Related docs

- `README.md` — harness conventions, coverage numbers, test-user accounts, secrets hygiene, code-coverage ceiling
- `Failed_tests.md` — what's red right now and why
- Each suite folder's own `.md` — the actual scenario-by-scenario record for that suite
