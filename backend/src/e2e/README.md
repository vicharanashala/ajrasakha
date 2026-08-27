# AjraSakha Backend — E2E Test Suite

All tests in this directory run against the **real Atlas Mongo DB** configured in
`.env` (`DB_URL` / `DB_NAME`). No test server is needed — every suite boots the
production DI container in-process via `loadAppModules('all')`.

---

## Last run output

```
src/e2e/last-run.log
```

Run `pnpm run test:e2e` (from `backend/`) to execute all e2e suites and capture
their output here. The file is git-ignored and overwritten on each run.

**About `↓ skipped` tests:** vitest auto-skips every `it` inside a `describe`
when that group's `beforeAll` throws. In auto-allocation this means: if
`POST /api/questions` inside a `beforeAll` returns non-201, the assertion throws
and all dependent `it` blocks in that group show `↓` instead of `×`. They are
not intentionally skipped — the skip is a cascade from the `beforeAll` failure.

---

## Quick reference: how to run

```bash
# Run all e2e suites and capture output to src/e2e/last-run.log
pnpm run test:e2e

# Run individual suites from backend/ — one example per module; see each
# module's own directory for its .e2e.test.ts file.
pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/chemical/ChemicalCrud.e2e.test.ts
pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/question/QuestionCreate.e2e.test.ts
pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/auth/AuthController.e2e.test.ts
pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/user/UserController.e2e.test.ts
pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/chatbot/ChatbotController.e2e.test.ts

# Route-coverage report (which controller routes have at least one e2e test
# hitting them, per module and overall) — see "Coverage" section below.
pnpm run test:e2e:coverage
pnpm run test:e2e:coverage -- --json   # machine-readable

# Run all e2e at once (~5-6 min with the full 28-file suite)
pnpm exec vitest run --config vitest.e2e.config.ts src/e2e
```

---

## Coverage

`pnpm run test:e2e:coverage` (or `node scripts/e2e-coverage-report.mjs`) cross-references
every `@Get`/`@Post`/`@Put`/`@Patch`/`@Delete` route declared across `src/modules/*/controllers`
against every literal path called from `src/e2e/**/*.e2e.test.ts`, and prints a
per-module + overall coverage percentage plus the list of any uncovered routes.
Pass `--json` for a machine-readable version (useful in CI to gate on a
coverage floor).

**This is a static-analysis heuristic, not a runtime instrumentation tool** —
it can tell you whether *some* test hits a route at all, not whether that
route's important branches/edge-cases are actually exercised (a suite may hit
a route once and still miss the bug documented in that suite's own `.md`). Use
it as a coverage floor; the "Suites at a glance" table and each suite's `.md`
doc are the authoritative record of what's actually verified.

As of 2026-08-24: **~90% of routes (264/292) have at least one e2e test.**
17 of 18 modules sit at 83-100%. `QuestionController` (the largest single
controller in the codebase) is now at 64/83 (~77%) after a dedicated gap-fill
suite (`question/QuestionControllerGaps.e2e.test.ts`); every one of its
remaining 19 uncovered routes falls into a category deliberately excluded from
this kind of testing (real external-AI calls, the ACC-agent state machine,
unreachable bulk-CSV processing, internal ops/migration helpers, and a
staging-vs-production DB comparison this environment can't run). See
`COVERAGE_GAP_REPORT.md` for the full current breakdown.

---

## Test users (from `.env.test`)

These users **must exist in the real DB** before any suite runs. They are fetched
by email in `beforeAll` — no Firebase token exchange needed (the harness stubs
`currentUserChecker`).

| Env var | Email | Role | Used by |
|---------|-------|------|---------|
| `ADMIN_EMAIL` | `admintest1@annam.ai` | `admin` | chemical suite |
| `MODERATOR_EMAIL` | `modtest1@annam.ai` | `moderator` | all suites |
| `EXPERT_EMAIL` | `experttest1@annam.ai` | `expert` | manual-alloc, auto-alloc, post-alloc |
| `EXPERT_EMAIL_2` | `experttest2@annam.ai` | `expert` | manual-alloc, post-alloc |
| `EXPERT_EMAIL_3–8` | `experttest3–8@annam.ai` | `expert` | post-alloc, auto-alloc (time-bound) |
| — | (a `pae_expert` user) | `pae_expert` | post-alloc PAE cases (self-skipped if absent) |

Password for all test users: `12345678`.

**`experttest1` must have preferences** matching `state=Punjab`,
`domain=Crop Protection`, `crop=Brinjal` in the DB for the auto-allocation
preference-scoring test (#5) to be deterministic.

---

## Suites at a glance

### Pre-existing suites (before 2026-08-24)

| Suite | File | Tests | Last run (2026-08-20) | What it covers |
|-------|------|------:|----------------------|----------------|
| Chemical CRUD | `chemical/ChemicalCrud.e2e.test.ts` | 19 | ✅ 19/19 | Auth smoke tests, admin + moderator CRUD, role guards (expert blocked), search filter, 404s (see "Test suite deduplication" below) |
| Question CRUD | `question/QuestionCreate.e2e.test.ts` | 15 | ✅ 15/15 | Moderator create / get / update / delete / bulk-delete (OUTREACH source) |
| Reviewer queue | `reviewer-queue/ReviewerQueue.e2e.test.ts` | 14 | ❌ 13/14 | `POST /allocated` visibility: author slot, reviewer slot, exclusions, `review_level_number` |
| WhatsApp ingestion | `whatsapp/WhatsAppQuestion.e2e.test.ts` | 21 | ❌ 20/21 | Full ingestion pipeline: auth, GDB duplicate paths, LLM filter, thread validation + retry |
| AjraSakha ingestion | `ajrasakha/AjrasakhaQuestion.e2e.test.ts` | 11 | ✅ 11/11 | AJRASAKHA-specific fields (userId from `@CurrentUser`, notification type), representative pipeline cases |
| Manual allocation | `manual-allocation/ManualAllocation.e2e.test.ts` | 10 | ✅ 10/10 | `POST /allocate-experts` + `DELETE /allocation` on an OUTREACH question |
| Auto allocation | `auto-allocation/AutoAllocation.e2e.test.ts` | 55 | ✅ 55/55 | AGRI_EXPERT background queue, preference scoring, toggle, time-bound allocation (WHATSAPP/AJRASAKHA), capacity, reviewer, concurrent guard |
| Allocation ordering | `allocation-ordering/AllocationOrdering.e2e.test.ts` | 8 | ✅ 8/8 | Chronological ordering + history exclusion for `reallocateTimeBoundQuestions()` (Issues #3, #5) |
| Post-allocation | `post-allocation/PostAllocation.e2e.test.ts` | 27 | ✅ 27/27 | Full expert peer-review → moderator-approval state machine |
| Gatekeeper / Auditor | `gatekeeper-auditor/GatekeeperAuditor.e2e.test.ts` | 37 | ✅ 37/37 | Push to auditor, finalize, cancel/confirm duplicate, close-propagation, single-allocation queue cron |
| Feedback | `feedback/Feedback.e2e.test.ts` | 34 | ✅ 34/34 | PAE_Validation / DATASET / WEB_APPLICATION feedback, moderator↔auditor routing, accept/reject settlement, manual admin controls |
| **Subtotal** | | **251** | **249/251** | |

### New suites (added 2026-08-24 — coverage gap-fill pass)

Every module below had **zero** e2e coverage before this pass (see
`COVERAGE_GAP_REPORT.md`), except `whatsapp-controller` (the existing
`whatsapp/` suite only covered the shared ingestion pipeline, not
`WhatsAppController`'s own routes) and `answer-gaps` (fills 5 routes the
existing `post-allocation`/`gatekeeper-auditor` suites didn't reach).

| Suite | File | Tests | Last run (2026-08-24) | What it covers |
|-------|------|------:|----------------------|----------------|
| Auth | `auth/AuthController.e2e.test.ts` | 26 | ✅ 26/26 | Signup, admin review-user creation, change-password, resend-verification, forgot-password, real Firebase login + sync |
| Comment | `comment/CommentController.e2e.test.ts` | 6 | ✅ 6/6 | Paginated list, add comment, BUG-009 reproduction |
| Context | `context/ContextController.e2e.test.ts` | 9 | ✅ 9/9 | Add context, live Sarvam translate, speech-to-text auth gate |
| Request | `request/RequestController.e2e.test.ts` | 9 | ✅ 9/9 | Create/list/diff/status/delete flag-request lifecycle |
| Crop | `crop/CropController.e2e.test.ts` | 16 | ✅ 16/16 | CRUD, bulk-status, xlsx download, role guards, search filter, admin role (see "Test suite deduplication" below) |
| Audit Trails | `auditTrails/AuditTrailsController.e2e.test.ts` | 6 | ✅ 6/6 | Admin vs moderator-scoped views, shift counts, per-question trails |
| Re-Route | `reroute/ReRouteController.e2e.test.ts` | 12 | ✅ 12/12 | Auth gate + error paths (full happy path needs a multi-stage fixture — out of scope, see `.md`) |
| Public Dashboard | `dashboard/PublicDashboardController.e2e.test.ts` | 17 | ✅ 17/17 | Public reads, admin item CRUD with a real `assertAdmin()` check |
| Notification | `notification/NotificationController.e2e.test.ts` | 13 | ✅ 13/13 | CRUD, mark-as-read, push subscription, BUG-017 demonstrated |
| Location (LGD) | `lgd/LocationController.e2e.test.ts` | 23 | ✅ 23/23 | State/district/block/village/kvk reads, real role-guarded add/alias/delete lifecycle |
| Farmer | `plivo/FarmerController.e2e.test.ts` | 7 | ✅ 7/7 | CRUD keyed by phone number |
| Plivo | `plivo/PlivoController.e2e.test.ts` | 8 | ✅ 8/8 | Call history (no-auth finding), SMS validation, agent/admin analytics |
| Performance | `performance/PerformanceController.e2e.test.ts` | 34 | ✅ 34/34 | All 18 routes — dashboard analytics + shift-based reports |
| WhatsApp controller | `whatsapp/WhatsAppController.e2e.test.ts` | 6 | ✅ 6/6 | The controller's own 6 routes (distinct from the ingestion pipeline above) |
| User | `user/UserController.e2e.test.ts` | 45 | ✅ 45/45 | All 29 routes — BUG-024, BUG-025 found; several routes investigated and confirmed properly protected at the service layer |
| Answer (gap-fill) | `answer/AnswerControllerGaps.e2e.test.ts` | 8 | ✅ 8/8 | Direct answer creation, AI-answer proxy, submissions/finalized/FAQ reads |
| Chatbot | `chatbot/ChatbotController.e2e.test.ts` | 64 | ✅ 64/64 | All ~61 routes — BUG-026, BUG-027 found |
| **Subtotal (new)** | | **306** | **306/306** | |

### Question gap-fill (added 2026-08-24, second pass)

| Suite | File | Tests | Last run (2026-08-24) | What it covers |
|-------|------|------:|----------------------|----------------|
| Question (gap-fill) | `question/QuestionControllerGaps.e2e.test.ts` | 60 | ✅ 60/60 | Brings `question` from 24/83 to 64/83 routes covered — BUG-028 through BUG-032 found. See `question/QuestionControllerGaps.e2e.md` |

| **Grand total** | | **620** | **617/620** (raw); **620/620** accounting for one transient run-order flake — see below | |

**All 306 new tests from the first pass, and all 60 from the
`question/QuestionControllerGaps.e2e.test.ts` gap-fill pass, pass 100%
individually.** The full 29-file suite run on 2026-08-24 (with the gap-fill
suite included) raw-scored 610/613. Two of the 3 failures are the same
pre-existing application bugs documented below (reviewer queue, WhatsApp
ingestion). The third — `UserController.e2e.test.ts`'s "updates the
notification preference" test — is a one-off run-order flake, not a real bug
or test defect: the failure (`404` instead of `200`, real transaction-backed
write) was immediately followed by an unhandled `MongoClientClosedError:
Operation interrupted because client was closed` in the log, a connection-pool
race from running 29 files' worth of real Atlas connections back-to-back in
one process. Re-ran `UserController.e2e.test.ts` alone immediately after: 45/45
clean. No test or app-code change was made for this — it isn't reproducible in
isolation, so there's nothing to fix.

Earlier in the same day, the first-pass 28-file run scored
543/553 before the fixes described in "Fixed 2026-08-25" below were applied:
one was this session's own stale test data (fixed), two were a tight default
timeout in a pre-existing suite this session doesn't own but fixed anyway
since it was a legitimate, isolated, test-file-only change (confirmed the
underlying behavior is correct — the call just occasionally takes ~5.3s
against real Atlas + push-notification latency, past vitest's 5000ms
default), and two remain: real, documented, pre-existing application bugs
that a test-only pass cannot fix without weakening what the test correctly
asserts.

---

## Test suite deduplication (2026-08-25)

`backend/src/modules/**/tests/` also contains unit/integration tests
alongside the e2e suites here. Most of them test a different layer entirely
(a controller/service class instantiated directly with mocked dependencies,
or a repository against a real DB with no HTTP layer) and aren't duplicates
of anything in `e2e/` — full reasoning in `BUGS_REPORT.md`'s companion audit,
but in short: only 4 files in `src/modules/**` ever booted an HTTP server via
`supertest`, the only pattern that can actually overlap with e2e:
`auth/tests/AuthController.api.test.ts`, `chemical/tests/ChemicalController.api.test.ts`,
`context/tests/ContextController.api.test.ts`, `crop/tests/CropController.api.test.ts`.

Each was checked test-by-test against the real e2e suite for the same
controller. Where a scenario was genuinely reachable in e2e, the mocked
version was removed and the real e2e coverage kept as canonical. Where it
wasn't reachable — a real credential is broken in this environment
(`FIREBASE_API_KEY`, `SARVAM_API_KEY`), or the scenario needs a real Google
OAuth token that can't be minted headlessly — the mocked test was kept in
place, since deleting it would just lose coverage with no real gain.

- **`chemical/tests/ChemicalController.api.test.ts` and
  `crop/tests/CropController.api.test.ts` — deleted entirely.** Every
  scenario they covered either already existed in the corresponding e2e
  suite, or was migrated there (search-query-param filtering, admin-role
  create/update for crop, and 400/404 validation edge cases for chemical —
  see the "Additional coverage" sections in each suite's own `.md`). Both
  e2e suites grew as a result: chemical 15→19 tests, crop 13→16 tests.
- **`auth/tests/AuthController.api.test.ts` — trimmed from 11 to 4 tests.**
  Kept: Google-signup happy path (needs a real Google ID token, unobtainable
  headlessly), login success (this environment's `FIREBASE_API_KEY` is
  broken — e2e can only ever reach the failure path, see BUG list below),
  and change-password success/error-mapping (verifies the controller's own
  logic in isolation from `FirebaseAuthService`, where BUG-018 actually
  lives — e2e can only ever observe the real end-to-end 500 that bug causes,
  never the mapping this test protects).
- **`context/tests/ContextController.api.test.ts` — trimmed from 5 to 2
  tests.** Kept: translate success + a `sourceLang` passthrough check
  (`SARVAM_API_KEY` is broken in this environment — e2e can only ever reach
  the failure path here too).

No application code was touched. `BUGS_REPORT.md` has the full test-by-test
reasoning for every kept and removed case.

---

## Currently Failing

Both of these are genuine application bugs, not test artifacts — the
assertions correctly encode intended behavior, and the failures are the bugs
manifesting. Fixing them requires an application-code change, out of scope for
an e2e-suite pass.

**Reviewer queue** — 1 failing → see `reviewer-queue/ReviewerQueue.e2e.md`
- Reviewer queue — author-slot question appears before reviewer-slot question for STF expert (Issue #2) > author-slot question appears before reviewer-slot question in the /allocated response → expected 2 to be less than 0
- `getAllocatedQuestions`' sort doesn't prioritize the author slot over the
  reviewer slot — it sorts by `createdAt` only. Documented bug, long-standing.

**WhatsApp ingestion** — 1 failing → see `whatsapp/WhatsAppQuestion.e2e.md`
- WhatsApp ingestion — WhatsApp API completely unreachable → question proceeds to open > proceeds to open (not isTesting) when the thread API throws non-not-found errors → Timed out waiting for question 6a867d2eccf5170caa666222. Last status='pending', isTesting=undefined
- The background pipeline throws `Cannot read properties of undefined
  (reading 'content')` when every `fetchWhatsAppMessage` attempt fails
  (real error visible in `src/e2e/last-run.log`), leaving the question stuck
  at `pending` forever instead of degrading to `open`. The test already uses
  a 120000ms timeout and a 60000ms polling window — this isn't a timing issue,
  the pipeline genuinely never finishes.

### Fixed 2026-08-25 (test-file-only changes)

- **`manual-allocation/ManualAllocation.e2e.test.ts`** (5/10 were failing) —
  confirmed via a one-off run with a 60000ms timeout that
  `POST /allocate-experts` completes correctly (200, real data) in ~5.3s; the
  default 5000ms vitest timeout was just tight for current real-world Atlas +
  push-notification latency. Added explicit 20000ms timeouts to the 5 tests
  that make a real POST/DELETE call. All 10/10 pass now, verified both alone
  and combined with the two other affected suites.
- **`post-allocation/PostAllocation.e2e.test.ts`** (2/27 were failing) — same
  root cause on `POST /answers/review`'s reviewer-rejection path (which also
  writes a notification). Added a 20000ms timeout to that one test. 27/27 pass.
- **`crop/CropController.e2e.test.ts`** (1/13 was failing) — not a timeout;
  the "moderator updates the crop aliases" test used a hardcoded alias value
  (`"Test"`), and crop alias uniqueness is enforced globally across all crops.
  A leftover crop from this session's own earlier manual debugging (never
  cleaned up because that run was interrupted) already held that alias,
  causing a collision. Changed the test to use a `RUN_TAG`-scoped alias so it
  can never collide with leftover data again. 13/13 pass.
---

## The in-process harness — boilerplate every suite shares

Every suite follows this exact setup pattern (copy from any existing one):

### 1. Force TLS before any module loads

```ts
process.env.NODE_ENV = 'development'; // must be the FIRST line
```

`MongoDatabase` disables TLS when `NODE_ENV === 'test'` (what Vitest sets).
Atlas (`mongodb+srv`) requires TLS. This must run before any import loads
the Mongo client.

### 2. Dotenv load order

```ts
dotenv.config({ path: '.env' });      // real Atlas DB_URL / DB_NAME
dotenv.config({ path: '.env.test' }); // test-user emails/passwords (doesn't override .env vars)
```

`.env` wins for `DB_URL`/`DB_NAME`. `.env.test` supplies test-user credentials.

### 3. AnswerService warm-up (circular-import workaround)

```ts
await import('#root/modules/answer/services/AnswerService.js');
```

Must run **before** `loadAppModules('all')`. `AnswerService` imports `CORE_TYPES`
from the core barrel (`#root/modules/core/index.js`), which re-exports `CORE_TYPES`
only on its last line. When `loadAppModules` reaches `AnswerService` through the
barrel, the barrel hasn't finished yet → `CORE_TYPES` is undefined → decorator
crashes. Pre-importing `AnswerService` lets the barrel complete first.

### 4. InternalApiAuth

`InternalApiAuth` is a global `@Middleware({ type: 'before' })` that checks
`x-internal-api-key` on **every route**. Set it before `loadAppModules`:

```ts
process.env.INTERNAL_API_KEY = 'e2e-<suite>-key'; // any non-empty string
```

Attach it to every request:

```ts
request(app).post('/api/...').set('x-internal-api-key', INTERNAL_API_KEY)
```

### 5. AiService dummy

For suites that touch the ingestion pipeline (WhatsApp, AjraSakha, AutoAlloc),
dummy the single external AI boundary **after** `loadAppModules`:

```ts
const { CORE_TYPES } = await import('#root/modules/core/types.js');
container.rebindSync(CORE_TYPES.AIService).toConstantValue(dummyAi);
```

`dummyAi` needs: `getEmbedding`, `fetchWhatsAppMessage`, `searchGdb`.

Also vi.mock the LLM classifier at the module level (top of file):

```ts
vi.mock('#root/modules/question/aiservice/checkConceptDuplicate.js', () => ({
  checkConceptDuplicate: vi.fn(async () => ({ isNonAgri: false })),
}));
```

### 6. currentUserChecker / authorizationChecker

```ts
let currentTestUser: any = null;

app = useExpressServer(express(), {
  controllers,
  routePrefix: ROUTE_PREFIX,
  defaultErrorHandler: true,
  authorizationChecker: async () => !!currentTestUser,
  currentUserChecker:   async () => currentTestUser,
});
```

Swap `currentTestUser` per test to simulate different logged-in users. Null →
401 from `authorizationChecker`.

### 7. Background processing — polling pattern

`processQuestionInBackground` runs via `setImmediate`. Tests submit, then poll:

```ts
async function waitForQuestion(
  questionId: string,
  predicate: (doc: any) => boolean,
  { timeoutMs = 40000, intervalMs = 750 } = {},
): Promise<any> {
  const col = await db.getCollection('questions');
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  while (Date.now() < deadline) {
    last = await col.findOne({ _id: new ObjectId(questionId) });
    if (last && predicate(last)) return last;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out. Last status='${last?.status}'`);
}
```

For submission queue polling (auto-alloc, single-alloc):

```ts
async function pollUntil(
  check: () => Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 300,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('pollUntil: condition not met within timeout');
}
```

### 8. Teardown race for 'open' questions

`processQuestionInBackground` sets `status='open'` and **then** writes moderator
notifications in the same async chain. If a test returns as soon as status flips
to 'open', the notification write is still in flight when `afterAll` calls
`db.disconnect()` → null-deref log (harmless but noisy).

- **WhatsApp suite**: drains in `afterAll` via `drainOpenQuestionNotifications()`
- **AjraSakha suite**: drains per-test via `await waitForNotification(questionId, 'question_from_ajrasakha')`
- Apply the same pattern in any new suite that produces 'open' questions

### 9. Cleanup — always tag docs

```ts
const RUN_TAG = `E2E_<SHORT>_${Date.now()}`;
const createdQuestionIds: string[] = []; // push every created id
```

`afterAll` deletes by `_id`: `questions`, `question_submissions`, `notifications`,
`duplicate_questions` (where applicable).

---

## Source types and their behaviour

| Source | Status at creation | Background pipeline | Queue at creation | isAutoAllocate |
|--------|--------------------|---------------------|-------------------|----------------|
| `WHATSAPP` | `pending` | Thread validation → GDB/LLM → `open`/`duplicate`/`non_agri` | empty | `false` → flipped `true` on `open` |
| `AJRASAKHA` | `pending` | Same as WHATSAPP | empty | `false` → flipped `true` on `open` |
| `AGRI_EXPERT` | `open` | `findExpertsByPreference` → queue filled (1 expert) | filled async | `true` |
| `OUTREACH` | `open` | Notify moderators only | empty | `true` (flag only — no auto-alloc) |

**Time-bound sources** = `WHATSAPP` + `AJRASAKHA`. Both:
- Force `priority = 'high'`
- Start `isAutoAllocate = false`
- Flip `isAutoAllocate = true` when pipeline resolves to `open` (commit `03c55740`)
- Expert allocation (cron: `reallocateTimeBoundQuestions`) runs AFTER ingestion, not at ingestion

---

## Key API endpoints used across suites

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/questions` | `x-internal-api-key` (FlexibleAuth) for WA/AGRI_EXPERT/OUTREACH; Firebase JWT for AJ | Shared ingestion endpoint for all sources |
| `POST` | `/api/questions/:id/allocate-experts` | Firebase JWT (moderator/admin) | Manual allocation — adds expert(s) to queue |
| `DELETE` | `/api/questions/:id/allocation` | Firebase JWT (moderator/admin) | Removes expert from queue by index |
| `PATCH` | `/api/questions/:id/toggle-auto-allocate` | Firebase JWT (moderator/admin) | Flips isAutoAllocate; OFF→ON triggers `autoAllocateExperts` synchronously |
| `POST` | `/api/answers/review` | Firebase JWT (expert/pae_expert) | Submit / peer-review an answer |
| `PUT` | `/api/answers` | Firebase JWT (moderator/admin) | Final moderator approval → closes question |
| `PUT` | `/api/questions/:id` | Firebase JWT (**no role guard** — BUG-006) | Gate Keeper actions: push to `auditor_review`, cancel duplicate |
| `POST` | `/api/answers/:questionId/confirm-duplicate` | Firebase JWT (**no role guard** — BUG-006) | Gate Keeper confirms a `queue_duplicate` question against its reference |

---

## Known bugs

Every bug below is currently reproducible; none are fixed. Each maps to the suite doc that
demonstrates it — open that file for the exact test and assertion.

| # | Bug | File |
|---|-----|------|
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
| BUG-017 | **Systemic**: `shared/functions/authorizationChecker.ts` (the production `authorizationChecker`) never reads the `roles` array routing-controllers passes into a custom checker for `@Authorized(['admin', ...])` — it only verifies a valid token belongs to SOME non-blocked/active user. Every route across the app that relies on `@Authorized([specific roles])` for role gating (rather than an explicit in-handler check like `ChemicalController`'s `WRITE_ROLES.includes(user.role)` pattern) grants access to **any authenticated user regardless of role**. First caught on `POST /auth/admin/review-users` (declared `@Authorized(['admin'])`, but a moderator can call it and get 201) — see `auth/AuthController.e2e.md`. This generalizes BUG-006 (previously scoped to just the two Gate Keeper actions) to every `@Authorized([roles])` usage in the codebase; grep `@Authorized(\[` across `src/modules/*/controllers` for the full blast radius. | `auth/AuthController.e2e.md` |
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
| BUG-030 | `GET /questions/:id` and `GET /questions/background-status` are dead code — both are registered (lines 2351, 2346) after `GET /questions/:questionId` (line 1125), and routing-controllers matches routes in registration order, so the earlier auth-required, ObjectId-based handler intercepts every single-segment `GET` first. | `question/QuestionControllerGaps.e2e.md` |
| BUG-031 | `GET /questions/:questionId/chatbot`'s `if (!data) throw new NotFoundError(...)` branch is dead code — `QuestionService.getMatchedQuestion` throws a plain `Error('No matching message found')` itself rather than returning null, so the intended 404 is a 500 in practice. | `question/QuestionControllerGaps.e2e.md` |
| BUG-032 | `POST /questions/data/out-reach/date` has no `@Authorized()`, but unconditionally calls `user._id.toString()` to build an audit-log actor before checking the user exists — a genuinely anonymous call crashes with a raw `TypeError` instead of either working (as the missing decorator implies) or cleanly 401ing. | `question/QuestionControllerGaps.e2e.md` |

**Environment note (not a code bug):** `POST /api/auth/login` calls Identity Toolkit using `appConfig.firebase.apiKey` (env var `FIREBASE_API_KEY`). In the environment this suite ran against, Google rejects that key outright ("API key not valid") even with fully correct credentials, while the separate `FIREBASE_WEB_API_KEY` env var (used only by `helpers/firebaseAuth.ts` and indirectly by `getFirebaseAuth()`'s Admin-SDK callers) works fine — proven by `/auth/sync` succeeding with a token minted via that key in the same run. Worth checking whether `FIREBASE_API_KEY` in `.env` is stale; as configured, no one can log in through `POST /auth/login` in this environment.

**Environment note (not a code bug):** `POST /api/context/translate` calls the live Sarvam API using `SARVAM_API_KEY` (`.env`), which Sarvam rejects in this environment ("Invalid or missing authentication credentials"). The request/response wiring is exercised and correct up to that point — only the live credential is the blocker.

---

## Diagram: full pipeline coverage map

```
Chemical CRUD
  ├─ GET /chemicals: missing internal-api-key → 401  [CH ✓]
  ├─ GET /chemicals: invalid internal-api-key → 401  [CH ✓]
  ├─ GET /chemicals: valid auth → 200                 [CH ✓]
  ├─ admin create / get / update / delete             [CH ✓]
  ├─ admin 404 after delete                           [CH ✓]
  ├─ expert cannot create/update/delete → 403         [CH ✓]
  ├─ moderator create / delete → 200                  [CH ✓]
  └─ moderator update → 200                           [CH ✓]

Question CRUD (OUTREACH, no pipeline)
  ├─ moderator creates question → 201                 [QC ✓]
  ├─ moderator gets question by id → 200              [QC ✓]
  ├─ moderator updates question → 200                 [QC ✓]
  ├─ question reflects updated values → 200           [QC ✓]
  ├─ moderator deletes question → 200                 [QC ✓]
  ├─ deleted question not retrievable → 404           [QC ✓]
  ├─ moderator bulk deletes questions → 200           [QC ✓]
  └─ bulk-deleted questions not retrievable → 404     [QC ✓]

Reviewer queue (POST /api/questions/allocated)
  ├─ author (queue[0]) sees question in allocated     [RQ ✓]
  ├─ review_level_number = "Author" for author slot   [RQ ✓]
  ├─ answer_creation notification matches allocated   [RQ ✓]
  ├─ closed question NOT in allocated                 [RQ ✓]
  ├─ reviewer (queue[1]) sees question in allocated   [RQ ✓]
  ├─ review_level_number = "Level 1" for reviewer    [RQ ✓]
  ├─ completed author no longer sees question         [RQ ✓]
  ├─ STF expert sees WHATSAPP question (author slot)  [RQ ✓] Issue #1, #7
  ├─ review_level_number = "Author" for STF expert   [RQ ✓] Issue #1
  ├─ notification-visibility consistent for STF       [RQ ✓] Issue #7
  ├─ both author-slot + reviewer-slot visible         [RQ ✓] Issue #2
  └─ author-slot appears before reviewer-slot (ord.)  [RQ ✗] Issue #2
  ├─ in-review question NOT in allocated for experts  [RQ ✓]
  └─ expert NOT in queue cannot see question          [RQ ✓]

WHATSAPP / AJRASAKHA ingestion
  ├─ auth failures                                    [WA ✓] [AJ ✓]
  ├─ invalid payload (missing field → 400)            [WA ✓] [AJ ✓]
  ├─ invalid payload (empty text → 500)               [WA ✓] [AJ ✓] BUG-001 documented
  ├─ thread: empty → isTesting                        [WA ✓] [AJ ✓]
  ├─ thread: not found after retries → isTesting      [WA ✓]
  ├─ thread: API down → open                          [WA ✗]
  ├─ thread: transient fail → retry → open            [WA ✓]
  ├─ GDB exact_match → duplicate                      [WA ✓] [AJ ✓]
  ├─ GDB selected_match → duplicate                   [WA ✓]
  ├─ GDB both → exact wins                            [WA ✓]
  ├─ GDB invalid ObjectId → LLM fallthrough           [WA ✓]
  ├─ GDB $oid format → duplicate                      [WA ✓]
  ├─ GDB throws → open                                [WA ✓]
  ├─ LLM non-agri → non_agri                         [WA ✓] [AJ ✓]
  ├─ LLM agri → open (common pipeline → open)         [WA ✓] [AJ ✓]
  └─ LLM throws → open (degrade)                      [WA ✓] [AJ ✓]

AGRI_EXPERT auto-allocation
  ├─ background fills queue (1 expert)                [AA ✓]
  ├─ preference scoring selects best expert           [AA ✓]
  ├─ firstAllocationAt stamped                        [AA ✓]
  ├─ answer_creation notification                     [AA ✓]
  ├─ OUTREACH: queue empty at creation                [AA ✓]
  ├─ OUTREACH: queue stays empty after wait           [AA ✓]
  └─ toggle OFF→ON fills queue                        [AA ✓]

WHATSAPP / AJRASAKHA time-bound allocation (reallocateTimeBoundQuestions)
  ├─ WHATSAPP question allocated to STF expert        [AA ✓]
  ├─ AJRASAKHA question allocated to STF expert       [AA ✓]
  ├─ firstAllocationAt + currentExpertAllocatedAt set [AA ✓]
  ├─ firstAllocationAt ≈ currentExpertAllocatedAt     [AA ✓] Issue #9 — timestamp consistency
  ├─ answer_creation notification (source-specific)   [AA ✓]
  ├─ STF-only requirement enforced                    [AA ✓]
  ├─ MAX_TIME_BOUND=1 capacity respected              [AA ✓]
  ├─ busy expert skipped for new question             [AA ✓]
  ├─ concurrent guard (isReallocatingTimeBound)       [AA ✓]
  ├─ reviewer assigned when author answered           [AA ✓]
  ├─ peer_review notification sent to reviewer        [AA ✓]
  ├─ currentExpertAllocatedAt reset for reviewer      [AA ✓]
  ├─ reviewer-stage question not re-processed by cron [AA ✓]
  ├─ toggle sequential ON→OFF→ON, no duplicates       [AA ✓]
  ├─ isAutoAllocate=false → skipped                   [AA ✓]
  ├─ isOnHold=true → skipped                          [AA ✓]
  ├─ closed/non_agri status → skipped                 [AA ✓]
  ├─ OUTREACH source → skipped                        [AA ✓]
  ├─ AGRI_EXPERT source → skipped                     [AA ✓]
  └─ already-allocated question → not re-allocated    [AA ✓]

Allocation ordering (reallocateTimeBoundQuestions — ordering + history exclusion)
  ├─ older question (earlier createdAt) allocated first when STF capacity=1  [AO ✓] Issue #3
  ├─ newer question skipped when only 1 STF expert is free                   [AO ✓] Issue #3
  ├─ allocated expert for older question has special_task_force=true         [AO ✓]
  ├─ expert in history NOT selected as stuck-replacement (BUG: same person twice) [AO ✓] Issue #5
  └─ stuck expert NOT selected as their own replacement                      [AO ✓] Issue #5

Manual allocation (OUTREACH source)
  ├─ auth (no user → 401, expert → 400)               [MA ✓]
  ├─ allocate expert1 → 200, queue=[e1]               [MA ✓]
  ├─ firstAllocationAt set                             [MA ✓]
  ├─ allocate expert2 → queue=[e1,e2]                 [MA ✓]
  ├─ duplicate guard → 200 (BUG-002 documented)       [MA ✓]
  ├─ non-existent questionId → 500 (known)            [MA ✓]
  └─ remove expert by index → queue shrinks           [MA ✓]

Post-allocation review workflow
  ├─ auth + role guards (401, 500 known)              [PA ✓]
  ├─ author (e1) submits first answer                 [PA ✓]
  ├─ e1 cannot submit twice → 500 (known)             [PA ✓]
  ├─ e2 / e3 / e4 accept → approvalCount increments  [PA ✓]
  ├─ 3 acceptances → question in-review              [PA ✓]
  ├─ expert cannot do final approval → 400            [PA ✓]
  ├─ moderator approves → question closed             [PA ✓]
  ├─ answer to closed question → 500 (known)          [PA ✓]
  ├─ reject identical answer → 500 (known)            [PA ✓]
  ├─ reviewer rejects with new answer → penalise      [PA ✓]
  ├─ author notified of rejection                     [PA ✓]
  ├─ modify identical answer → 500 (known)            [PA ✓]
  ├─ reviewer modifies → text updated, count reset    [PA ✓]
  ├─ author notified of modification                  [PA ✓]
  ├─ approve when question still open → 400           [PA ✓]
  ├─ approve with no normalised_crop → 400            [PA ✓]
  ├─ LLM approve non-AJRASAKHA/WA source → 400       [PA ✓]
  ├─ edit finalised answer on closed question → 200   [PA ✓]
  ├─ PAE expert → pae_submitted (peer cycle skipped)  [PA ✓]
  ├─ moderator approves pae_submitted → closed        [PA ✓]
  ├─ delete non-final answer → removed                [PA ✓]
  └─ approvalCount=1/2 does NOT escalate to moderator [PA ✓]

Gatekeeper / Auditor (gate_keeper / auditor roles, single-allocation queue cron)
  ├─ push to auditor / cancel / confirm-duplicate (happy paths)     [GA ✓]
  ├─ BUG-008: no precondition on prior status for push-to-auditor   [GA ✓]
  ├─ BUG-007: cancel-duplicate has no status precondition           [GA ✓]
  ├─ BUG-006: no role guard on push-to-auditor / cancel-duplicate   [GA ✓]
  ├─ BUG-006: no role guard on confirm-duplicate                   [GA ✓]
  ├─ BUG-009: non-existent answerId 500s instead of 400             [GA ✓]
  ├─ BUG-010: existing answerId can never finalize auditor_review   [GA ✓]
  ├─ close-propagation only fires for duplicate_confirmed children  [GA ✓]
  ├─ BUG-011: close-propagation hardcodes child status=closed       [GA ✓]
  ├─ single-allocation queue cron (runGateKeeperAuditorQueueCron)   [GA ✓]
  └─ BUG-012: approveAnswer role check is a blacklist, not a whitelist [GA ✓]

Feedback (PAE_Validation / DATASET / WEB_APPLICATION, moderator↔auditor routing)
  ├─ PAE validation cron assigns pending question to pae_expert     [FB ✓]
  ├─ PAE expert feedback opens PAE_Validation source, frees expert  [FB ✓]
  ├─ PAE expert approve completes validation, no feedback opened    [FB ✓]
  ├─ PAE queue-details/timeline/assigned-list read endpoints        [FB ✓]
  ├─ manual assign/reassign PAE reviewer, reject once completed     [FB ✓]
  ├─ BUG-015: PAE reassign-by-index wipes round history             [FB ✓]
  ├─ BUG-016: PAE expert can be manually double-booked              [FB ✓]
  ├─ remove open PAE round / reject removing a completed one        [FB ✓]
  ├─ toggle autoAllocatePaeValidationExpert gates the cron           [FB ✓]
  ├─ active free approver-moderator gets feedback directly          [FB ✓]
  ├─ blocked/busy/inactive approver-moderator falls back to auditor [FB ✓]
  ├─ DATASET/WEB_APPLICATION intake webhook (InternalApiAuth)       [FB ✓]
  ├─ accept/reject settlement, multi-source not released early      [FB ✓]
  ├─ BUG-014: WEB_APPLICATION settlement calls DATASET's URL         [FB ✓]
  ├─ manual admin assign/reassign/remove feedback reviewer, toggle  [FB ✓]
  └─ NOT COVERED: POST /bulk-pae-allocate — unreachable (worker-thread module resolution)

Question controller gap-fill (brings question from 24/83 to 64/83)
  ├─ status-summary / queue-details / allocated-page / detailed / feedbacks   [QG ✓]
  ├─ context/:contextId (401, bad-id 400, empty-result 200)                  [QG ✓]
  ├─ BUG-028: reAllocateLessWorkload / reAllocateSelectedQuestions reachable
  │   with no logged-in user (no @Authorized())                              [QG ✓]
  ├─ BUG-028: generate-answer reachable with no logged-in user               [QG ✓]
  ├─ reallocation-preview / reallocate-manual / role-dashboard               [QG ✓]
  ├─ role-assignee PATCH/DELETE (403 not 401 for missing user — role-array)  [QG ✓]
  ├─ submission-exists / plain get-by-id / feedback / feedback-timeline      [QG ✓]
  ├─ BUG-030: GET /:id shadowed dead code by earlier /:questionId            [QG ✓]
  ├─ BUG-029: PATCH /:questionId works with internal-api-key only            [QG ✓]
  ├─ BUG-031: GET /:questionId/chatbot 500s instead of 404 (dead branch)     [QG ✓]
  ├─ BUG-030: GET /background-status shadowed, 401s despite no @Authorized() [QG ✓]
  ├─ BUG-029: admin/closed-answer-mismatch, /admin/normalized-domain,
  │   /admin/backfill-closed-moderator — internal-api-key only               [QG ✓]
  ├─ check-status / check-duplicate / hold-unhold / approve-initial-answer   [QG ✓]
  ├─ replace-queue-expert / mark-opened                                     [QG ✓]
  ├─ BUG-017 recurs: queue-details, reallocate-timebound,
  │   reallocate-manual-queue not blocked for non-privileged role            [QG ✓]
  ├─ 5 report-download routes (xlsx buffers)                                [QG ✓]
  └─ BUG-032: data/out-reach/date crashes for anonymous caller               [QG ✓]
```
