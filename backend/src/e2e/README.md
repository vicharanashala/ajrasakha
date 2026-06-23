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

# Run individual suites from backend/
pnpm exec vitest run src/e2e/chemical/ChemicalCrud.e2e.test.ts
pnpm exec vitest run src/e2e/question/QuestionCreate.e2e.test.ts
pnpm exec vitest run src/e2e/reviewer-queue/ReviewerQueue.e2e.test.ts
pnpm exec vitest run src/e2e/whatsapp/WhatsAppQuestion.e2e.test.ts
pnpm exec vitest run src/e2e/ajrasakha/AjrasakhaQuestion.e2e.test.ts
pnpm exec vitest run src/e2e/manual-allocation/ManualAllocation.e2e.test.ts
pnpm exec vitest run src/e2e/auto-allocation/AutoAllocation.e2e.test.ts
pnpm exec vitest run src/e2e/post-allocation/PostAllocation.e2e.test.ts

# Run all e2e at once (~2 min)
pnpm exec vitest run src/e2e
```

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

| Suite | File | Tests | Last run (2026-06-23) | What it covers |
|-------|------|------:|----------------------|----------------|
| Chemical CRUD | `chemical/ChemicalCrud.e2e.test.ts` | 15 | ✅ 15/15 | Auth smoke tests, admin + moderator CRUD, role guards (expert blocked) |
| Question CRUD | `question/QuestionCreate.e2e.test.ts` | 8 | ❌ 7/8 | Moderator create / get / update / delete / bulk-delete (OUTREACH source) |
| Reviewer queue | `reviewer-queue/ReviewerQueue.e2e.test.ts` | 14 | ❌ 13/14 | `POST /allocated` visibility: author slot, reviewer slot, exclusions, `review_level_number` |
| WhatsApp ingestion | `whatsapp/WhatsAppQuestion.e2e.test.ts` | 18 | ✅ 18/18 | Full ingestion pipeline: auth, GDB duplicate paths, LLM filter, thread validation + retry |
| AjraSakha ingestion | `ajrasakha/AjrasakhaQuestion.e2e.test.ts` | 9 | ✅ 9/9 | AJRASAKHA-specific fields (userId from `@CurrentUser`, notification type), representative pipeline cases |
| Manual allocation | `manual-allocation/ManualAllocation.e2e.test.ts` | 10 | ✅ 10/10 | `POST /allocate-experts` + `DELETE /allocation` on an OUTREACH question |
| Auto allocation | `auto-allocation/AutoAllocation.e2e.test.ts` | 55 | ❌ 50/55 | AGRI_EXPERT background queue, preference scoring, toggle, time-bound allocation (WHATSAPP/AJRASAKHA), capacity, reviewer, concurrent guard |
| Post-allocation | `post-allocation/PostAllocation.e2e.test.ts` | 27 | ✅ 27/27 | Full expert peer-review → moderator-approval state machine |
| **Total** | | **156** | **149/156** | |

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

---

## Known bugs (cross-suite)

### BUG-001 — Empty question text returns 500 instead of 400

`POST /api/questions` with `question: ''` — expected 400, got 500.
`QuestionService.addQuestion` throws `BadRequestError` for empty question text but the outer
`catch` wraps it as `InternalServerError` → 500. Tests document 500 as the expected value.

### BUG-002 (manual-alloc) — Duplicate expert guard never fires

`POST /allocate-experts` with an already-queued expert — expected 400, got 200 and the
expert is added again. `allocateExperts` compares `queue` (array of `ObjectId`) with
`expertId` (string) using `Array.includes` → always false → duplicate silently allowed.

### BUG-003 (manual-alloc) — `removeExpertFromQueuebyIndex` removes by value, not index

`DELETE /allocation` — removes by `ObjectId` value via `$pull`, ignoring the index param.
Cascades badly when BUG-002 creates duplicate entries.

### BUG-004 (post-alloc) — `reviewAnswer` wraps all errors as 500

`POST /answers/review` with wrong role, wrong reviewer, duplicate submission, or closed
question — expected 4xx, got 500. `AnswerService.reviewAnswer` has a catch that rethrows
everything as `InternalServerError`.

### BUG-011 (question-crud) — Bulk-delete retrieval check times out (2026-06-19)

`Question Create E2E > bulk deleted questions are not retrievable` — test times out at 5000 ms.
The bulk delete itself returns 200, but the subsequent `GET` to confirm deletion does not
respond within the default vitest timeout. Likely a slow DB read after a multi-document delete.

### ~~BUG-012 (whatsapp) — "NOT FOUND → open" case has unexpected submission record (2026-06-19)~~ *(fixed 2026-06-23)*

`WhatsApp ingestion — question NOT FOUND (common pipeline → open)` — `expected [ …(1) ] to deeply equal []`.
When the question reaches `open` via the common pipeline (no GDB/LLM match), a `question_submissions`
document is written that the test does not expect. The assertion checks that the submissions
array is empty for a newly-opened question that hasn't been allocated yet.

---

## Production issues coverage (2026-06-19)

Ten issues were reported in production. The table below maps each to its e2e coverage
status and explains why non-covered cases are not capturable in this framework.

| # | Issue | Coverage | Suite / Group | Notes |
|---|-------|----------|---------------|-------|
| 1 | STFs not receiving author-level questions even when in queue | ✅ **New** | `reviewer-queue` G4 | Seeds STF expert in queue[0] for a WHATSAPP question; verifies STF sees it in `/allocated` at Author level |
| 2 | STFs getting reviewer-level questions before author-level | ✅ **New** | `reviewer-queue` G5 | Seeds both slots for same STF; asserts author-slot appears before reviewer-slot in `/allocated` response |
| 3 | Older questions not allocated first; newer ones jump the queue | ✅ **New** | `allocation-ordering` G1 | Seeds OLD (2 min ago) and NEW (now) WHATSAPP questions with only 1 free STF expert; asserts OLD gets the expert |
| 4 | Expert attends question but answer not in history/audit trail | ❌ **Not capturable** | — | "Attending" sets `currentExpertOpenedAt` via an undocumented client event; no API endpoint available to trigger it in the harness |
| 5 | Same question assigned to same person twice | ✅ **New** | `allocation-ordering` G2 | Seeds a question where stfExperts[0] is in history (previous author) and stfExperts[1] is stuck reviewer; asserts replacement is neither |
| 6 | One question assigned to two people simultaneously | ❌ **Not capturable** | — | Requires true HTTP-level concurrency; concurrent cron guard already covered by `auto-allocation` G9 |
| 7 | Notification received but question not visible in dashboard | ✅ **New** (+ existing) | `reviewer-queue` G4 (STF-specific) + G1 (generic) | G4 seeds answer_creation notification for STF expert and verifies consistency between notification and `/allocated` visibility |
| 8 | Training model: single moderator allocation broken | ❌ **Not capturable** | — | "Training model" is not a documented code path; relevant business logic not identified for testing |
| 9 | Timeline discrepancy: `firstAllocationAt` vs `currentExpertAllocatedAt` | ✅ **New** | `auto-allocation` G5 | Asserts both timestamps differ by < 60 s after the same cron allocation operation |
| 10 | Display of submissions during blocked period | ❌ **Not capturable** | — | No documented API or repository method for "submissions during a user's blocked window" |

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
  └─ bulk-deleted questions not retrievable → 404     [QC ✗] BUG-011: timeout 5000ms

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
  └─ author-slot appears before reviewer-slot (ord.)  [RQ ?] Issue #2 — may fail if sort is createdAt-only
  ├─ in-review question NOT in allocated for experts  [RQ ✓]
  └─ expert NOT in queue cannot see question          [RQ ✓]

WHATSAPP / AJRASAKHA ingestion
  ├─ auth failures                                    [WA ✓] [AJ ✓]
  ├─ invalid payload (missing field → 400)            [WA ✓] [AJ ✓]
  ├─ invalid payload (empty text → 500)               [WA ✓] [AJ ✓] BUG-001 documented
  ├─ thread: empty → isTesting                        [WA ✓] [AJ ✓]
  ├─ thread: not found after retries → isTesting      [WA ✓]
  ├─ thread: API down → open                          [WA ✓]
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
```
