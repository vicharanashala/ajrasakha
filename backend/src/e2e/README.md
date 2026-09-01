# AjraSakha Backend — E2E Test Suite

All tests in this directory run against the **real Atlas Mongo DB** configured in
`.env` (`DB_URL` / `DB_NAME`). No test server is needed — every suite boots the
production DI container in-process via `loadAppModules('all')`.

**For currently-failing tests, see `Failed_tests.md`** — what fails, why,
and how to fix it. This file covers what's tested, what's missing, and how
the suite works.

**Changing a route or service and need to know which test file to update?
See `TEST_MAP.md`** — a lookup index by controller/route, by service, and
by cross-cutting feature workflow, meant for the dev team to self-serve
test updates without depending on the testing team.

---

## How to run

```bash
# Run all e2e suites and capture output to src/e2e/last-run.log
pnpm run test:e2e

# Run one suite — see each module's own directory for its .e2e.test.ts file
pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/chemical/ChemicalCrud.e2e.test.ts

# Route-coverage report (per-module + overall, plus the uncovered-route list)
pnpm run test:e2e:coverage
pnpm run test:e2e:coverage -- --json   # machine-readable

# Real code coverage (v8) — see "Code coverage" section below
pnpm run test:e2e:code-coverage

# Run everything at once (~5-6 min)
pnpm exec vitest run --config vitest.e2e.config.ts src/e2e
```

**About `↓ skipped` tests:** vitest auto-skips every `it` inside a `describe`
whose `beforeAll` throws. That's a cascade from a setup failure, not an
intentional skip — check the `beforeAll` first if you see a block of `↓`.

**Automatic per-run failure report:** both `pnpm run test:e2e` and
`pnpm run test:e2e:code-coverage` run `scripts/e2e-failure-report.mjs`
after every run, which parses `src/e2e/last-run.log`, cross-references
every failure against `scripts/known-e2e-failures.json` (kept in sync
with `Failed_tests.md`), and does two things automatically, every time:

1. Writes `src/e2e/last-run-failures.md` — a fresh, short summary of
   exactly what failed *this run*. `last-run.log` and
   `last-run-failures.md` are both regenerated (overwritten) every run
   and gitignored — not meant to be committed.
2. Updates the **"Newly detected failures — needs triage"** section
   inside `Failed_tests.md` itself, between a pair of
   `<!-- AUTO-TRIAGE:START/END -->` markers. Anything that fails and
   doesn't match `known-e2e-failures.json` shows up there automatically —
   test name, error message, first-seen date — with no manual edit
   required, so `Failed_tests.md` can never silently drift out of sync
   with what the suite is actually doing. Everything outside those
   markers (root-cause write-ups, the flaky/disabled sections) is
   hand-written and untouched by the script — a script can explain *that*
   something is failing, not *why*, so triaging a new entry still means
   reading the code, writing up the real cause in the right section above,
   and adding a matching entry to `scripts/known-e2e-failures.json`. Once
   that's done, the entry stops appearing in the auto-managed section on
   the next run.

---

## Coverage: 274/293 routes (~93.5%)

`pnpm run test:e2e:coverage` cross-references every route decorator across
`src/modules/*/controllers` against every literal path called from
`src/e2e/**/*.e2e.test.ts`. It's a **coverage floor, not a correctness
check** — it tells you *some* test hits a route, not that the route's
important edge cases are actually exercised. The "Suites at a glance" table
below and each suite's own `.md` doc are the real record of what's verified.
For real *code* coverage (branches, not just "a request hit this route"),
see `pnpm run test:e2e:code-coverage` — a v8 report at
`coverage/e2e/html/index.html`.

17 of 18 modules sit at 83–100%. `QuestionController` (the largest single
controller) is at 72/83 (~86.7%).

---

## Missing tests — the 27 uncovered routes, and why

Every one of these was checked against its suite's actual test file before
being placed here — not just trusted from the coverage script's output.

### Already covered for real — the coverage script just can't see it (5)

Not real gaps. A real test exercises each of these; the script's
literal-path matching has a specific blind spot for how the test happens to
be written (a fake id used instead of a `${var}` template, two dynamic path
segments in a row, or a route called from inside a loop over an array of
paths instead of as a standalone string literal):

- `crop GET /bulk-status/:jobId`
- `whatsapp GET /threads/:threadId/:date` *(caveat: only the auth gate is
  tested for real — the success path is skipped because a real call hangs
  indefinitely against this environment's WhatsApp backend rather than
  failing cleanly)*
- `chatbot GET /analytics/state-wise-analytics`, `/weather-concern-queries`,
  `/active-users-trend`, `/feedback-by-location`

### Deliberately out of scope (3)

| Route | Why | What it would take to close |
|---|---|---|
| `plivo POST /answer` | Plivo's own inbound-call webhook — their platform calls it directly, not a client of this app | Reverse-engineer Plivo's exact payload shape; a wrong guess would silently test nothing |
| `lgd POST /kvks/sync` | Runs a real script that upserts the *live* reference-data collection from a CSV | A disposable dataset + scoped test collection, or mock the upsert layer entirely |
| `question POST /bulk-pae-allocate` | Worker-thread CSV processing — worker threads don't resolve modules under this in-process vitest harness | A real live server, or an app-code fix to the worker's module resolution |

### `QuestionController`'s remaining 11 routes, by category

None of these are accidentally-missed business logic — each falls into a
category flagged up front as a poor fit for this kind of testing. (The
internal `/background/*` ops routes previously listed here are now covered
by `question/QuestionControllerOps.e2e.test.ts`.)

| Category | Count | Routes | Why |
|---|---:|---|---|
| Real external-AI-service calls | 3 | `/generate`, `/generate-by-call-context`, `/call-summary` | Needs dedicated mocking/fixture work beyond "accept a clean 5xx" |
| ACC-agent flow | 4 | `/acc-agent/thread`, `/extract`, `/update-state`, `/resume` | Multi-step external call-agent state machine, needs its own fixture chain |
| Cross-DB migration/comparison | 3 | `/check-overlaps`, `/run-migration`, `/migrate-firebase-users` | `check-overlaps` needs a staging DB this environment doesn't have; the other two are one-off scripts |
| Bulk CSV | 1 | `/bulk-pae-allocate` | Worker-thread module resolution doesn't work under this in-process vitest harness |

**If closing more of this is worth it:** the 7 external-AI + ACC-agent
routes are the highest-value remaining work (real business logic, just needs
fixture investment). The rest are reasonably left alone.

---

## Code coverage: 65.01% — final state, and why 80% isn't reachable this way

`pnpm run test:e2e:code-coverage` (v8) measures actual code execution — a
stricter, different signal than the ~93.5% route coverage above. Final
state as of 2026-08-31: **65.01% statements/lines** (49,726/76,491),
52.01% branches, 76.48% functions, across 664 tests (653 passing — the 11
failures are exactly the ones documented in `Failed_tests.md`, nothing
new). Started this specific push at 55.47%.

A target of 80% overall was set for this suite. This section is the
complete, audited accounting of why that isn't reachable by writing more
tests the way every other test in this suite is written, without a scope
decision — not a guess, every file below was read and traced by hand.

### The bifurcation

| | Statements | Share |
|---|---:|---:|
| Covered by real e2e tests | 49,726 | 65.0% |
| **Reachable, safe, but not yet covered** — genuine remaining test-writing opportunity | ~15,109 | 19.8% |
| **Structurally out of reach** — concentrated in 9 files, cannot close by writing more tests | 11,656 | 15.2% |

The "reachable but not yet covered" 19.8% is real, ordinary remaining
work — the kind already closed for `reroute/`, `user/` call-agent,
`auth/RealAuthGate`, and the `/filtered-questions` and
`/user-questions-data` dispatch branches on `chatbot/`. Continuing that
same style of work can still move the number up. It's the other 15.2% —
11,656 statements, concentrated in exactly 9 files — that's the actual
ceiling. Below is where it lives and why.

### Where it lives

| File | Uncovered / Total | % dead |
|---|---:|---:|
| [`ChatbotRepository.ts`](../shared/database/providers/mongo/repositories/ChatbotRepository.ts) | 7,642 / 19,139 | 60% |
| [`ChatbotService.ts`](../modules/chatbot/services/ChatbotService.ts) | 1,680 / 3,753 | 55% |
| [`CheckOverlapsService.ts`](../modules/question/services/CheckOverlapsService.ts) | 695 / 722 | 96% |
| [`PlivoService.ts`](../modules/plivo/services/PlivoService.ts) | 340 / 409 | 83% |
| [`AiService.ts`](../modules/ai/services/AiService.ts) | 306 / 397 | 77% |
| [`QuestionAiService.ts`](../modules/question/services/QuestionAiService.ts) | 306 / 343 | 89% |
| [`CallDetailsRepository.ts`](../shared/database/providers/mongo/repositories/CallDetailsRepository.ts) | 261 / 407 | 64% |
| [`AccAgentService.ts`](../modules/acc-agent/services/AccAgentService.ts) | 216 / 242 | 89% |
| [`WhatsAppService.ts`](../modules/whatsapp/services/WhatsAppService.ts) | 210 / 281 | 75% |
| **Total** | **11,656** | |

### Why — the 5 causes, each verified by reading the code

**1. Dead code — nothing routes to it, so nothing can call it in a test**
- [`AgentAssignmentService.ts`](../modules/plivo/services/AgentAssignmentService.ts) (whole file, 113 statements) — bound in the DI container, but `UserService` reimplements the same agent-assignment logic inline instead of calling it. Zero callers anywhere. Excluded from coverage measurement entirely (see `vitest.e2e.config.ts`).
- [`ReviewRepository.ts`](../shared/database/providers/mongo/repositories/ReviewRepository.ts)'s 4 read methods — zero callers anywhere in `src/modules`.
- [`DuplicateQuestionRepository.ts`](../shared/database/providers/mongo/repositories/DuplicateQuestionRepository.ts)'s `addDuplicate`/`findDuplicatesByMatchedId` — the only caller, `DuplicateService.checkDuplicateQuestion`, never passes the `fromOutReach` flag needed to reach the branch that calls them.
- `ChatbotRepository.ts`/`ChatbotService.ts` — ~1,584 lines with no controller call site at all: `getDailyAnalyticsForWhatsApp`/`getWeeklyAnalyticsForWhatsApp`/`getMonthlyAnalyticsForWhatsApp` (1,215 lines alone), `getWhatsAppTopFaqs`, `getWhatsAppDuplicateQuestions`, `getWhatsAppDuplicateQuestionsCount`, `getWeeklyAvgSessionDuration`, `getDailyQueryCounts`/`getWeeklyQueryCounts`/`getMonthlyQueryCounts`, `getUserConversationIds`, `getUserEmailByConversationId`, `getHierarchyUserIds`.
- Fix: a deletion pass, verified safe by the same repo-wide grep method used here. Not a test-writing task — deleting application code is a separate decision from adding test coverage, so this dead code is left in place, just flagged.

**2. Real writes to the production Annam analytics cluster**
- `ChatbotRepository.updateUser`/`addUser`/`changeUserPassword`/`findMatchingReviewSystemUser`/`deleteReviewSystemUser`/`rollbackPasswordSync` (~440 lines) — these inject `AnnamDatabase` directly, bound to `ANNAM_URL_ANALYTICS`, which points at `production.irscxiv.mongodb.net` (confirmed by reading `.env`).
- A real "success" test here would create or modify real production data. `chatbot/ChatbotController.e2e.test.ts` deliberately only tests the validation/auth-block paths on these routes — verified intentional, not an oversight.
- Fix: none available without a staging Annam cluster.

**3. Real reads from the same production cluster, with no safe way around it**
- `ChatbotRepository.getQuestionsClosedWithinTwoHours`/`getQueriesByPeriod`/`getQuestionByManualSource`/`getCoordinatorKpiSummary` (~1,042 lines) call a private `init('annam')` with a **hardcoded literal** — unlike their sibling functions (`getQuestionsByCrop`, `getQuestionsByStatus`, `getQuestionFromState`, `getQuestionFromDistrict`, `getQueryCategoryQuestions` — all covered by passing `source=whatsapp` through `GET /filtered-questions`), these four ignore whatever `source` the caller passes and always route to the production cluster.
- Fix: change the hardcoded `'annam'` to the passed-in `source` parameter in `ChatbotRepository.ts` — a one-line-per-function application code change, not a test change, so left alone here.

**4. Real third-party API calls, no mock boundary in this harness**
- `PlivoService`'s call/audio-streaming internals (`transcribeAudio`, `sendAudio`, `saveCallDetails`, `initializeStreams`, etc.) — needs a live Plivo call.
- `CallDetailsRepository` — same live-call dependency.
- `WhatsAppService`/`ChatbotService`'s LGD-heatmap calls (`getHeatMapLgdDistricts`/`Blocks`/`Villages`) — real calls to `process.env.LGD_STATES_API_URL` and siblings.
- `QuestionAiService`/`AiService`/`AccAgentService` — real LLM/ACC-agent calls (`/generate`, `/generate-by-call-context`, `/call-summary`, `/acc-agent/*` — already listed as out of scope in "Missing tests" above, same root cause).
- Fix: dedicated HTTP-mocking infrastructure (nock/msw) — a philosophy change for a suite that's deliberately "real e2e against real services" everywhere else. A scope decision, not a gap to quietly patch.

**5. Environment-config blocked**
- [`CheckOverlapsService.ts`](../modules/question/services/CheckOverlapsService.ts) (695 of 722 lines) — `check-overlaps` needs a staging DB this environment doesn't have (already listed in "Missing tests" above).
- `/dataset/*` routes and `ChatbotService.generateChatbotAnalyticsPdfReport` + its table-drawing helpers — `DATA_RELEASE_URL` isn't configured in this environment; already documented per-route in `chatbot/ChatbotController.e2e.md`.
- Fix: configure the missing env vars against a real or staging endpoint.

### Net effect

Every one of the 5 causes needs a decision or resource this suite doesn't
have on its own: delete confirmed-dead application code, get a staging
Annam cluster, fix a hardcoded DB-routing parameter, build HTTP-mocking
infrastructure, or configure missing env vars. None of them are closed by
writing more tests in the existing style — that style has already been
pushed as far as it safely goes, closing the genuinely reachable, safe
gap that existed before this coverage push.

---

## Test users (from `.env.test`)

These users **must exist in the real DB** before any suite runs — fetched by
email in `beforeAll`, no Firebase token exchange needed.

| Env var | Role | Used by |
|---------|------|---------|
| `ADMIN_EMAIL` | `admin` | chemical suite |
| `MODERATOR_EMAIL` | `moderator` | all suites |
| `EXPERT_EMAIL`, `EXPERT_EMAIL_2` | `expert` | manual-alloc, auto-alloc, post-alloc |
| `EXPERT_EMAIL_3`–`8` | `expert` | post-alloc, auto-alloc (time-bound) |
| — (a `pae_expert` user) | `pae_expert` | post-alloc PAE cases (self-skipped if absent) |

Password for all test users comes from `.env.test` (`ADMIN_PASSWORD`,
`MODERATOR_PASSWORD`, `EXPERT_PASSWORD*`) — never hardcoded, see below.

**`experttest1` must have preferences** matching `state=Punjab`,
`domain=Crop Protection`, `crop=Brinjal` for the auto-allocation
preference-scoring test to be deterministic.

---

## Secrets hygiene (standing rule)

**Every real credential — passwords, API keys, tokens, webhook secrets —
comes from `process.env`, sourced from `.env`/`.env.test` (both gitignored,
never committed). Never hardcode a real secret's value in a `.test.ts` file.**

Fine to hardcode (not real secrets): `INTERNAL_API_KEY` values like
`'e2e-<suite>-key'` (the test sets this itself, so the app is just checking
a value the test made up — no outside access granted); throwaway passwords
for fixture accounts a test creates and deletes in the same run; and
deliberately-wrong values used to test a failure path (e.g. a fake wrong
password to assert a 401).

Never hardcode: `ADMIN_PASSWORD`/`MODERATOR_PASSWORD`/`EXPERT_PASSWORD*`,
`FIREBASE_API_KEY`/`FIREBASE_WEB_API_KEY`, `SARVAM_API_KEY`,
`DATA_RELEASE_URL`/`REVIEW_SYSTEM_AUTH_KEY`, `WEB_APP_URL`/
`WEB_WEBHOOK_API_KEY`, or any real DB connection string. Every reference to
these across `src/e2e/**` goes through `process.env.<NAME>` — check this
whenever a new suite touches a real external credential.

---

## Suites at a glance

| Suite | Tests | What it covers |
|---|---:|---|
| `chemical/ChemicalCrud.e2e.test.ts` | 19 | Auth smoke tests, admin/moderator CRUD, role guards, search filter, 404s |
| `question/QuestionCreate.e2e.test.ts` | 15 | Moderator create/get/update/delete/bulk-delete (OUTREACH) |
| `reviewer-queue/ReviewerQueue.e2e.test.ts` | 14 | `/allocated` visibility: author/reviewer slot, exclusions — 1 failing, see `Failed_tests.md` |
| `whatsapp/WhatsAppQuestion.e2e.test.ts` | 21 | Full ingestion pipeline — 1 failing, see `Failed_tests.md` |
| `ajrasakha/AjrasakhaQuestion.e2e.test.ts` | 11 | AJRASAKHA-specific ingestion fields |
| `manual-allocation/ManualAllocation.e2e.test.ts` | 10 | Allocate/remove experts on an OUTREACH question |
| `auto-allocation/AutoAllocation.e2e.test.ts` | 47 | Background queue, preference scoring, time-bound allocation, capacity |
| `allocation-ordering/AllocationOrdering.e2e.test.ts` | 8 | Chronological ordering + history exclusion |
| `post-allocation/PostAllocation.e2e.test.ts` | 27 | Expert peer-review → moderator-approval state machine |
| `gatekeeper-auditor/GatekeeperAuditor.e2e.test.ts` | 37 | Push to auditor, finalize, duplicate handling, queue cron |
| `feedback/Feedback.e2e.test.ts` | 34 | PAE_Validation/DATASET/WEB_APPLICATION routing — 2 failing, see `Failed_tests.md` |
| `auth/AuthController.e2e.test.ts` | 26 | Signup, admin review-users, change-password, real Firebase login+sync |
| `auth/RealAuthGate.e2e.test.ts` | 7 | Real (non-faked) `authorizationChecker`/`currentUserChecker`/`FlexibleAuth` — every other suite fakes these |
| `comment/CommentController.e2e.test.ts` | 6 | Paginated list, add comment |
| `context/ContextController.e2e.test.ts` | 9 | Add context, live Sarvam translate, speech-to-text auth gate |
| `request/RequestController.e2e.test.ts` | 9 | Create/list/diff/status/delete flag-request lifecycle |
| `crop/CropController.e2e.test.ts` | 16 | CRUD, bulk-status, xlsx download, role guards, search filter |
| `auditTrails/AuditTrailsController.e2e.test.ts` | 6 | Admin vs. moderator-scoped views, shift counts |
| `reroute/ReRouteController.e2e.test.ts` | 15 | Auth gate + error paths, plus a real allocate → expert-reject / moderator-reject happy path |
| `dashboard/PublicDashboardController.e2e.test.ts` | 17 | Public reads, admin item CRUD |
| `notification/NotificationController.e2e.test.ts` | 13 | CRUD, mark-as-read, push subscription |
| `lgd/LocationController.e2e.test.ts` | 26 | State/district/block/village/kvk reads, role-guarded lifecycle, `districts/all` singleton |
| `plivo/FarmerController.e2e.test.ts` | 7 | CRUD keyed by phone number |
| `plivo/PlivoController.e2e.test.ts` | 8 | Call history, SMS validation, agent/admin analytics |
| `performance/PerformanceController.e2e.test.ts` | 34 | All 18 routes — dashboard analytics + shift-based reports |
| `whatsapp/WhatsAppController.e2e.test.ts` | 6 | The controller's own routes (distinct from the ingestion pipeline) |
| `user/UserController.e2e.test.ts` | 57 | All 30 routes incl. `admin/all/export`, gate-keeper user-management access, real call_agent online/offline/heartbeat happy path |
| `answer/AnswerControllerGaps.e2e.test.ts` | 8 | Direct answer creation, AI-answer proxy, submissions/FAQ reads |
| `chatbot/ChatbotController.e2e.test.ts` | 70 | All ~61 routes, incl. real `/filtered-questions` dispatch branches and `/user-questions-data` |
| `question/QuestionControllerGaps.e2e.test.ts` | 61 | 40 additional `QuestionController` routes |
| `question/QuestionControllerOps.e2e.test.ts` | 12 | Internal `/background/*` ops routes, `queue-details?section=`, `reAllocateLessWorkload` real path |
| **Total** | **656** | **4 tests fail for real, reproducible application reasons — see `Failed_tests.md`; a handful more fail only under full-suite load and aren't reproducible alone (see "Flaky" there)** |

4 tests fail for real, reproducible reasons; a handful more fail only under
full-suite load and aren't reproducible alone — **all detail, root cause, and
fix suggestions are in `Failed_tests.md`**, not duplicated here.

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
from the core barrel, which re-exports `CORE_TYPES` only on its last line. When
`loadAppModules` reaches `AnswerService` through the barrel, the barrel hasn't
finished yet → `CORE_TYPES` is undefined → decorator crashes. Pre-importing
`AnswerService` lets the barrel complete first.

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
401 from `authorizationChecker` (unless the route uses `@Authorized([roles])`
with a non-empty array — routing-controllers 403s those instead, a quirk
that shows up throughout these suites).

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

### 8. Teardown race for 'open' questions

`processQuestionInBackground` sets `status='open'` and **then** writes moderator
notifications in the same async chain. If a test returns as soon as status flips
to 'open', the notification write is still in flight when `afterAll` calls
`db.disconnect()` → a harmless-but-noisy null-deref log. WhatsApp/AjraSakha
suites drain pending notifications in `afterAll`/per-test — apply the same
pattern in any new suite that produces 'open' questions.

### 9. Cleanup — always tag docs

```ts
const RUN_TAG = `E2E_<SHORT>_${Date.now()}`;
const createdQuestionIds: string[] = []; // push every created id
```

`afterAll` deletes by `_id`. For a route that manages a real *singleton*
record instead of a disposable fixture (like `lgd POST /districts/all`), be
defensive instead: pre-clean before creating (in case a prior interrupted
run left it behind), and always delete what you created — see that suite's
`.md` for the pattern.

---

## Source types and their behaviour

| Source | Status at creation | Background pipeline | Queue at creation | isAutoAllocate |
|--------|--------------------|---------------------|-------------------|----------------|
| `WHATSAPP` | `pending` | Thread validation → GDB/LLM → `open`/`duplicate`/`non_agri` | empty | `false` → flipped `true` on `open` |
| `AJRASAKHA` | `pending` | Same as WHATSAPP | empty | `false` → flipped `true` on `open` |
| `AGRI_EXPERT` | `open` | `findExpertsByPreference` → queue filled (1 expert) | filled async | `true` |
| `OUTREACH` | `open` | Notify moderators only | empty | `true` (flag only) |

**Time-bound sources** = `WHATSAPP` + `AJRASAKHA`. Both force `priority = 'high'`,
start `isAutoAllocate = false`, flip it `true` once the pipeline resolves to
`open`, and get expert allocation via a separate cron that runs *after*
ingestion, not at ingestion time.

---

## Key API endpoints used across suites

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/questions` | `x-internal-api-key` for WA/AGRI_EXPERT/OUTREACH; Firebase JWT for AJ |
| `POST` | `/api/questions/:id/allocate-experts` | Firebase JWT (moderator/admin) |
| `DELETE` | `/api/questions/:id/allocation` | Firebase JWT (moderator/admin) |
| `PATCH` | `/api/questions/:id/toggle-auto-allocate` | Firebase JWT (moderator/admin) |
| `POST` | `/api/answers/review` | Firebase JWT (expert/pae_expert) |
| `PUT` | `/api/answers` | Firebase JWT (moderator/admin) |
| `PUT` | `/api/questions/:id` | Firebase JWT (**no real role guard** — any authenticated role can call this, not just moderator/admin) |
| `POST` | `/api/answers/:questionId/confirm-duplicate` | Firebase JWT (**no real role guard** — same issue, not covered in the e2e suite, see `TEST_MAP.md`) |
