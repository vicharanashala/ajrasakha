# AjraSakha Backend — E2E Test Suite

All tests in this directory run against the **real Atlas Mongo DB** configured in
`.env` (`DB_URL` / `DB_NAME`). No test server is needed — every suite boots the
production DI container in-process via `loadAppModules('all')`.

---

## Quick reference: how to run

```bash
# Run from backend/
pnpm exec vitest run src/e2e/whatsapp/WhatsAppQuestion.e2e.test.ts
pnpm exec vitest run src/e2e/ajrasakha/AjrasakhaQuestion.e2e.test.ts
pnpm exec vitest run src/e2e/manual-allocation/ManualAllocation.e2e.test.ts
pnpm exec vitest run src/e2e/auto-allocation/AutoAllocation.e2e.test.ts
pnpm exec vitest run src/e2e/post-allocation/PostAllocation.e2e.test.ts

# Run all e2e at once (slow — ~2 min due to retry tests)
pnpm exec vitest run src/e2e
```

---

## Test users (from `.env.test`)

These users **must exist in the real DB** before any suite runs. They are fetched
by email in `beforeAll` — no Firebase token exchange needed (the harness stubs
`currentUserChecker`).

| Env var | Email | Role | Used by |
|---------|-------|------|---------|
| `ADMIN_EMAIL` | `admintest1@annam.ai` | `admin` | (reserved) |
| `MODERATOR_EMAIL` | `modtest1@annam.ai` | `moderator` | all suites |
| `EXPERT_EMAIL` | `experttest1@annam.ai` | `expert` | manual-alloc, auto-alloc, post-alloc |
| `EXPERT_EMAIL_2` | `experttest2@annam.ai` | `expert` | manual-alloc, post-alloc |
| `EXPERT_EMAIL_3–8` | `experttest3–8@annam.ai` | `expert` | post-alloc |
| — | (a `pae_expert` user) | `pae_expert` | post-alloc PAE cases (self-skipped if absent) |

Password for all test users: `12345678`.

**`experttest1` must have preferences** matching `state=Punjab`,
`domain=Crop Protection`, `crop=Brinjal` in the DB for the auto-allocation
preference-scoring test (#5) to be deterministic.

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

Fix: drain the notification before returning or in `afterAll`.

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

## Suites at a glance

| Suite | File | Tests | Time | What it covers |
|-------|------|------:|-----:|----------------|
| WhatsApp ingestion | `whatsapp/WhatsAppQuestion.e2e.test.ts` | 18 | ~59 s | Full ingestion pipeline: auth, GDB duplicate paths, LLM filter, thread validation + retry logic, degradation |
| AjraSakha ingestion | `ajrasakha/AjrasakhaQuestion.e2e.test.ts` | 9 | ~7 s | AJRASAKHA-specific fields (userId from `@CurrentUser`, notification type), representative pipeline cases |
| Manual allocation | `manual-allocation/ManualAllocation.e2e.test.ts` | 10 | ~5 s | `POST /allocate-experts` + `DELETE /allocation` on an OUTREACH question |
| Auto allocation | `auto-allocation/AutoAllocation.e2e.test.ts` | 38 | ~25 s | AGRI_EXPERT background queue, preference scoring, toggle-auto-allocate, time-bound allocation for WHATSAPP/AJRASAKHA (initial, capacity, reviewer, negative cases, concurrent guard) |
| Post-allocation | `post-allocation/PostAllocation.e2e.test.ts` | 24 | ~19 s | Full expert→peer-review→moderator-approval state machine |

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

`QuestionService.addQuestion` throws `BadRequestError` for empty question text, but
the outer `catch` wraps ALL errors as `InternalServerError` → controller returns
500. Affects `POST /api/questions`. Tests document 500 as the expected value.

**Fix:** In `addQuestion`'s outer catch, re-throw `HttpError` instances directly
instead of wrapping them.

### BUG-002 (manual-alloc) — Duplicate expert guard never fires

`allocateExperts` compares `queue` (array of `ObjectId`) with `expertId` (string)
using `Array.includes` → always false → duplicate silently allowed.

**Fix:** `.queue.some(id => id.toString() === expertId)`

### BUG-003 (manual-alloc) — `removeExpertFromQueuebyIndex` removes by value, not index

Uses `$pull` by `ObjectId` value. Name says "byIndex" but index param is ignored.
Cascades badly when BUG-002 creates duplicate entries.

### BUG-004 (post-alloc) — `reviewAnswer` wraps all errors as 500

`AnswerService.reviewAnswer` has a try/catch around its entire body that rethrows
everything as `InternalServerError`. Wrong role, wrong reviewer, duplicate
submission, closed question — all return 500 instead of 4xx.

---

## WIP — what is currently being written

### Single allocation for WHATSAPP and AJRASAKHA sources

**Gap:** The WhatsApp and AjraSakha ingestion suites stop at the ingestion
boundary (question reaches `open`, submission queue is empty). They explicitly
defer expert allocation to the cron (`reallocateTimeBoundQuestions`). The manual
allocation suite covers `POST /allocate-experts` and `DELETE /allocation` but
seeds an OUTREACH question — it does not test that those endpoints work correctly
against a `WHATSAPP` or `AJRASAKHA` question.

**What needs to be written:** a new suite (or describe blocks extending manual
allocation) that:

1. Ingests a WHATSAPP question via `POST /api/questions` → waits for `open`
2. Ingests an AJRASAKHA question via `POST /api/questions` → waits for `open`
3. Moderator calls `POST /api/questions/:id/allocate-experts` for each
4. Asserts 200, submission queue contains the expert, `firstAllocationAt` is set

**File to create:** `src/e2e/single-allocation/SingleAllocation.e2e.test.ts`

**Harness notes:**
- Needs `dummyAi` + `checkConceptDuplicate` vi.mock (same as WhatsApp/AjraSakha
  suites) because ingestion hits the full pipeline
- `currentTestUser` must be swappable: moderator for allocation calls, but
  `null`/internal-key for ingestion (WhatsApp uses internal key, AjraSakha uses
  `@CurrentUser`)
- Wait for `open` using `waitForQuestion` before calling `allocate-experts`
- Drain 'open' question notifications before `afterAll` (same teardown race as WA/AJ)
- AjraSakha ingestion sets `userId` from `@CurrentUser` — set `currentTestUser`
  to `moderatorUser` before submitting the AjraSakha payload
- Tag all created docs with `RUN_TAG = E2E_SA_${Date.now()}`

**Status:** `[x] done` — added as Groups 5–10 in `auto-allocation/AutoAllocation.e2e.test.ts`

---

## Diagram: full pipeline coverage map

```
WHATSAPP / AJRASAKHA ingestion
  ├─ auth failures                          [WA ✓] [AJ ✓]
  ├─ invalid payload (missing field → 400)  [WA ✓] [AJ ✓]
  ├─ invalid payload (empty text → 500 bug) [WA ✓] [AJ ✓]
  ├─ thread: empty → isTesting              [WA ✓] [AJ ✓]
  ├─ thread: not found after retries        [WA ✓]
  ├─ thread: API down → open               [WA ✓]
  ├─ thread: transient fail → retry → open  [WA ✓]
  ├─ GDB exact_match → duplicate            [WA ✓] [AJ ✓]
  ├─ GDB selected_match → duplicate         [WA ✓]
  ├─ GDB both → exact wins                  [WA ✓]
  ├─ GDB invalid ObjectId → LLM fallthrough [WA ✓]
  ├─ GDB $oid format → duplicate            [WA ✓]
  ├─ GDB throws → open                      [WA ✓]
  ├─ LLM non-agri → non_agri               [WA ✓] [AJ ✓]
  ├─ LLM agri → open                        [WA ✓] [AJ ✓]
  ├─ LLM throws → open (degrade)            [WA ✓] [AJ ✓]
  └─ open → single expert allocated         [ ] WIP ← next to write

AGRI_EXPERT auto-allocation
  ├─ background fills queue (1 expert)      [AA ✓]
  ├─ preference scoring selects best expert [AA ✓]
  ├─ firstAllocationAt stamped              [AA ✓]
  ├─ answer_creation notification           [AA ✓]
  └─ toggle OFF→ON fills queue              [AA ✓]

WHATSAPP / AJRASAKHA time-bound allocation (reallocateTimeBoundQuestions)
  ├─ WHATSAPP question allocated to STF expert  [AA ✓]
  ├─ AJRASAKHA question allocated to STF expert [AA ✓]
  ├─ firstAllocationAt + currentExpertAllocatedAt set [AA ✓]
  ├─ answer_creation notification (source-specific message) [AA ✓]
  ├─ STF-only requirement enforced              [AA ✓]
  ├─ MAX_TIME_BOUND=1 capacity respected        [AA ✓]
  ├─ busy expert skipped for new question       [AA ✓]
  ├─ concurrent guard (isReallocatingTimeBound) [AA ✓]
  ├─ reviewer assigned when author answered     [AA ✓]
  ├─ peer_review notification sent to reviewer  [AA ✓]
  ├─ currentExpertAllocatedAt reset for reviewer[AA ✓]
  ├─ isAutoAllocate=false → skipped             [AA ✓]
  ├─ isOnHold=true → skipped                    [AA ✓]
  ├─ closed/non_agri status → skipped           [AA ✓]
  ├─ OUTREACH source → skipped                  [AA ✓]
  ├─ AGRI_EXPERT source → skipped               [AA ✓]
  └─ already-allocated question → not re-allocated [AA ✓]

Manual allocation (OUTREACH source)
  ├─ auth (no user → 401, expert → 400)     [MA ✓]
  ├─ allocate expert1 → 200, queue=[e1]     [MA ✓]
  ├─ firstAllocationAt set                  [MA ✓]
  ├─ allocate expert2 → queue=[e1,e2]       [MA ✓]
  ├─ duplicate guard bug (200 not 400)       [MA ✓ documented]
  ├─ non-existent questionId → 500          [MA ✓ documented]
  └─ remove expert by index → queue shrinks [MA ✓]

Post-allocation review workflow
  ├─ auth + role guards                     [PA ✓]
  ├─ author submits → in-review → peer cycle[PA ✓]
  ├─ 3 acceptances → in-review              [PA ✓]
  ├─ moderator closes → closed              [PA ✓]
  ├─ reject / modify cycles                 [PA ✓]
  ├─ PAE expert → pae_submitted → closed    [PA ✓]
  └─ delete non-final answer                [PA ✓]
```
