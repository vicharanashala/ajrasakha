# Feature Name

WhatsApp Question Ingestion — End-to-End

---

# Module

```text
src/e2e/whatsapp        (test)
src/modules/question    (system under test)
```

WhatsApp questions are NOT handled by `src/modules/whatsapp` (that module is
read-only: threads / users / send-message). They enter through the **shared**
question-ingestion endpoint that every source uses.

---

# Purpose

Verify the complete backend journey of a question that arrives from WhatsApp,
end-to-end, against the **real Mongo database in `.env`** (`DB_URL` / `DB_NAME`),
with every service that lives outside the backend replaced by a dummy.

The four sources (`AJRASAKHA`, `WHATSAPP`, `AGRI_EXPERT`/bulk+single, `OUTREACH`)
share the same ingestion + processing pipeline. This suite covers `WHATSAPP`
first and stops at the **hand-off boundary** — the point where the
WhatsApp-specific flow ends (status becomes `duplicate` / `non_agri` / `open`,
submission row created, moderators notified) and the shared common pipeline
begins.

## SCOPE — what is intentionally NOT covered here

**Expert allocation is OUT of scope for this suite.** Allocation
(`reallocateTimeBoundQuestions`, cron-driven) is the COMMON path shared by every
time-bound source (WHATSAPP/AJRASAKHA). It is deliberately left for a dedicated
common-path test rather than duplicated per source. A fresh WhatsApp question is
created with `isAutoAllocate=false`; once the background pipeline drives it to
`open`, `isAutoAllocate` is flipped to `true` (commit `03c55740`, see below), but
allocation itself is NOT performed at ingestion — the submission is still created
unallocated (empty queue). The WhatsApp flow legitimately ends at the
`open`/unallocated-submission boundary; the cron later picks the question up
because `isAutoAllocate` is now `true`.

---

# Main Files

```text
src/e2e/whatsapp/WhatsAppQuestion.e2e.test.ts          # the test
src/modules/question/controllers/QuestionController.ts # POST /questions (addQuestion)
src/modules/question/services/QuestionService.ts       # addQuestion + processQuestionInBackground + reallocateTimeBoundQuestions
src/shared/functions/flexibleAuth.ts                   # internal-API-key auth used by WhatsApp
src/modules/ai/services/AiService.ts                   # the ONLY external boundary (dummied)
src/modules/question/aiservice/checkConceptDuplicate.ts# LLM non-agri classifier (mocked)
src/bootstrap/jobs/timeBoundReAllocateCron.ts          # drives allocation in prod
```

---

# Main API Endpoints

| Method | Endpoint | Purpose |
| ------ | --------------- | ------------------------------------------------- |
| POST | /api/questions | Ingest a question (all sources; WhatsApp uses `source: "WHATSAPP"` + `x-internal-api-key`) |

WhatsApp authenticates via `FlexibleAuth` (the `x-internal-api-key` header), not
a Firebase JWT. No `@CurrentUser` is present; `userId` comes from the body.

---

# Main Service Functions

| Function | Purpose |
| -------------------------------- | ----------------------------------------------------------- |
| `addQuestion` | Validates, embeds, inserts question (`pending`) + bare submission, kicks off background processing |
| `processQuestionInBackground` | Thread validation → duplicate-check pipeline → sets terminal status → notifies moderators |
| `validateTimeBoundQuestionThread`| Confirms the WhatsApp thread exists (else marks `isTesting`). Retries 3x with 3/6/12 s backoff. |
| `runDuplicateCheckPipeline` | GDB search → LLM non-agri check; decides `duplicate` / `non_agri` / `open` |
| `reallocateTimeBoundQuestions` | The common allocation path (cron-driven) for WHATSAPP/AJRASAKHA — **NOT tested in this suite (common path, parked)** |

---

# Database Collections / Tables Used

```text
questions
question_submissions
notifications
duplicate_questions
users           (read: experts/moderators for allocation + notifications)
```

---

# External Services Used (all DUMMIED in the test)

- AI embedding server — `AiService.getEmbedding` (`POST /embed`)
- WhatsApp/LangGraph thread state — `AiService.fetchWhatsAppMessage` (`GET /threads/:id/state`)
- Golden-dataset search — `AiService.searchGdb` (`POST /v1/gdb/search`)
- LLM duplicate / non-agri classifier — `checkConceptDuplicate` (OpenAI/Gemma)

The test rebinds `CORE_TYPES.AIService` to a dummy and `vi.mock`s
`checkConceptDuplicate`. Nothing leaves the process.

---

# Important Business Logic

```text
- WhatsApp/Ajrasakha questions are time-bound: forced priority='high',
  status='pending', isAutoAllocate=false on ingestion. When the background
  pipeline resolves the question to status='open', isAutoAllocate is flipped to
  true (QuestionService.ts:1545 / :1551, commit 03c55740). Questions that end as
  'duplicate' / 'non_agri' / isTesting keep isAutoAllocate=false.
- Thread validation: if the WhatsApp thread can't be matched (API reachable but
  no message), the question is flagged isTesting=true and dropped.
- "Question found" = GDB exact_match/selected_match -> status='duplicate' with
  referenceQuestionId / referenceQuestion / similarityScore / isExact recorded
  (this is the link to the already-answered question).
- No GDB match -> LLM decides: non-agri -> status='non_agri'; agri -> status='open'.
- Expert allocation is NOT done at ingestion. The 2-min time-bound cron
  (reallocateTimeBoundQuestions) only picks up questions with isAutoAllocate=true.
  As of commit 03c55740, reaching status='open' auto-sets isAutoAllocate=true, so
  'open' questions become cron candidates WITHOUT a moderator manually enabling it
  (previously a moderator had to toggle it on).
- extractObjectId (QuestionService.ts:1056) accepts both plain hex strings AND
  MongoDB extended-JSON format ({$oid: "..."}).
```

---

# Possible Error Cases (all now exercised)

```text
- Missing / wrong x-internal-api-key        -> 401                              [tested]
- Empty question text                        -> 400 (BadRequestError)            [tested, KNOWN BUG: returns 500]
- Missing required detail fields             -> 400 (BadRequestError)            [tested, returns 400 via class-validator]
- Thread id missing (empty string)           -> question flagged isTesting       [tested]
- Thread id present but API says "not found" -> question flagged isTesting       [tested]
- Thread API completely unreachable          -> question proceeds to open        [tested]
- Thread API fails on first attempt only     -> question proceeds to open        [tested — retry path]
- GDB service throws                         -> pipeline degrades to status=open [tested]
- GDB exact_match has invalid ObjectId       -> falls through to LLM -> open    [tested]
- GDB selected_match has invalid ObjectId    -> falls through to LLM -> open    [tested]
- GDB exact_match uses {$oid} format         -> marks duplicate correctly        [tested]
- LLM classifier unreachable                 -> pipeline degrades to status=open [tested]
```

---

# Test Cases (18 total)

```text
AUTH
  ✓  reject ingestion without internal API key (401)
  ✓  reject ingestion with wrong internal API key (401)

INVALID PAYLOAD
  ✓  missing a required detail field (district) -> 400
       Note: comes from class-validator on QuestionDetailsDto, NOT from
       QuestionService.addQuestion's own guard — QuestionDetailsDto has
       @IsNotEmpty() on district, so validation fires before the service runs.
  ✗  empty question text -> 400   [KNOWN BUG — returns 500, see BUG-001]

DUPLICATE CHECK — FOUND paths
  ✓  FOUND: GDB exact_match -> status 'duplicate', isExact=true + reference recorded
  ✓  SIMILAR: GDB selected_match (no exact) -> status 'duplicate', isExact=false,
       referenceSource='reviewer' (second duplicate mechanism; LLM not consulted)
  ✓  PRIORITY: GDB returns both exact_match and selected_match -> exact_match wins
       (isExact=true, referenceQuestionId points to exact_match)
  ✓  INVALID ID (exact_match): GDB exact_match has non-ObjectId question_id ->
       match skipped, falls through to LLM -> status 'open'
  ✓  INVALID ID (selected_match): GDB selected_match has non-ObjectId question_id
       AND exact_match is null -> match skipped, falls through to LLM -> status 'open'
  ✓  OID FORMAT: GDB exact_match.question_id is {$oid: "..."} MongoDB extended-JSON
       format -> extractObjectId resolves it correctly -> status 'duplicate', isExact=true

DUPLICATE CHECK — NOT-FOUND paths
  ✓  NOT FOUND (agri): no GDB match + LLM says agri -> status 'open', unallocated submission
  ✓  NON-AGRI: no GDB match + LLM says non-agri -> status 'non_agri'

DEGRADATION
  ✓  LLM FAILURE: classifier throws -> pipeline degrades gracefully to status 'open'
  ✓  GDB FAILURE: searchGdb throws -> pipeline degrades gracefully to status 'open'
       (error caught by processQuestionInBackground pipelineError catch, not inside
       runDuplicateCheckPipeline which has no try/catch around the GDB call)

THREAD VALIDATION (validateTimeBoundQuestionThread)
  ✓  EMPTY threadId: immediate short-circuit (THREAD_ID_MISSING), fetchWhatsAppMessage
       never called -> isTesting=true, status stays 'pending'
  ✓  NOT-FOUND after retries: valid threadId, API throws "No matching WhatsApp message
       found" on all 4 attempts (1 initial + 3 retries with 3/6/12 s backoff) ->
       hadSuccessfulApiCall=true -> isTesting=true, status stays 'pending' (~21 s)
  ✓  API COMPLETELY DOWN: valid threadId, API throws non-"not-found" error on all
       attempts -> hadSuccessfulApiCall=false -> isValid=true (API down ≠ test question)
       -> question proceeds through pipeline to status 'open' (~21 s)
  ✓  TRANSIENT FAILURE + RETRY: first attempt throws ECONNREFUSED, retry 1 succeeds
       (hadSuccessfulApiCall=true on retry 1) -> isValid=true -> pipeline runs -> 'open'
       (~3 s — only one retry delay incurred)

NOT covered (common path, separate test): expert allocation
(reallocateTimeBoundQuestions).
```

---

# How To Run

```bash
# Uses the DB in .env. Run from backend/.
pnpm exec vitest run src/e2e/whatsapp/WhatsAppQuestion.e2e.test.ts
```

Notes:
- The suite forces `NODE_ENV=development` at the top so the Atlas (`mongodb+srv`)
  client keeps TLS enabled (`MongoDatabase` disables TLS when `NODE_ENV=test`).
- Background processing runs via `setImmediate`, so tests SUBMIT then POLL the
  `questions` collection for the terminal status.
- All documents created during a run are deleted in `afterAll` (tracked by a
  per-run `RUN_TAG`).

---

# Last Test Run Results

**Date:** 2026-06-11  
**Vitest version:** 3.2.4  
**Total:** 18 tests — **17 passed, 1 failed**  
**Duration:** ~59 s (dominated by the two 21-s retry tests + one 3-s transient-retry test)

| # | Test | Result | Time |
|---|------|--------|------|
| 1 | AUTH: no internal API key → 401 | ✅ pass | 39 ms |
| 2 | AUTH: wrong internal API key → 401 | ✅ pass | 5 ms |
| 3 | PAYLOAD: missing district field → 400 | ✅ pass | 27 ms |
| 4 | FOUND: GDB exact_match → duplicate, isExact=true | ✅ pass | 1422 ms |
| 5 | SIMILAR: GDB selected_match → duplicate, isExact=false | ✅ pass | 234 ms |
| 6 | NOT FOUND (agri): → open, unallocated submission (isAutoAllocate=true) | ✅ pass | 1510 ms |
| 7 | NON-AGRI: LLM says non-agri → non_agri | ✅ pass | 231 ms |
| 8 | THREAD INVALID: empty threadId → isTesting=true, pending | ✅ pass | 229 ms |
| 9 | LLM FAILURE: classifier throws → open (graceful degrade) | ✅ pass | 232 ms |
| 10 | THREAD NOT-FOUND: API says "not found" on all retries → isTesting | ✅ pass | 21871 ms |
| 11 | THREAD DOWN: API completely unreachable → open | ✅ pass | 21809 ms |
| 12 | GDB FAILURE: searchGdb throws → open (graceful degrade) | ✅ pass | 242 ms |
| 13 | RETRY SUCCEEDS: first attempt ECONNREFUSED, retry succeeds → open | ✅ pass | 3404 ms |
| 14 | INVALID exact_match ID: non-ObjectId → skipped, LLM → open | ✅ pass | 249 ms |
| 15 | INVALID selected_match ID: non-ObjectId → skipped, LLM → open | ✅ pass | 1052 ms |
| 16 | OID FORMAT: exact_match.question_id as {$oid} → duplicate, isExact=true | ✅ pass | 254 ms |
| 17 | PRIORITY: both exact+selected match → exact_match wins | ✅ pass | 241 ms |
| 18 | PAYLOAD: empty question text → 400 | ❌ **FAIL** (returns 500) | 53 ms |

---

# Anything Risky / Important?

```text
- Runs against the REAL .env database. Test docs are tagged and cleaned up.
  The 'open' path writes moderator notifications (cleaned up by questionId).
  Allocation is NOT triggered, so no expert/reputation state is mutated.
- The repo has a latent circular-import bug: AnswerService imports CORE_TYPES
  from the core barrel (#root/modules/core/index.js) instead of core/types.js.
  Under vitest this leaves CORE_TYPES undefined, so the test warms up the module
  graph by importing AnswerService BEFORE loadAppModules('all'). Fixing the
  import in AnswerService would remove the need for the warm-up.
- TEARDOWN RACE (handled): processQuestionInBackground sets status='open' and
  THEN writes moderator notifications in the same setImmediate chain. Open-path
  tests assert as soon as status flips to 'open' and return, leaving that write
  in flight. When afterAll then called db.disconnect(), the late write hit a
  null DB handle and logged (swallowed) "Cannot read properties of null
  (reading 'collection')" — harmless to assertions but noisy. afterAll now calls
  drainOpenQuestionNotifications() (waits for each 'open' question's notification
  BEFORE the deletes/disconnect), so teardown is deterministic. The Ajrasakha
  suite handles the same race per-test via waitForNotification(). Root cause of
  the null deref is in MongoDatabase: after disconnect() nulls this.database, a
  re-connect() returns the cached connectingPromise WITHOUT repopulating
  this.database, so getCollection() dereferences null. Not fixed here (infra
  change out of scope; only reachable when disconnect races in-flight work,
  which production never does).
```

---

# Behavior Changes

## CHG-001 — open questions now auto-enable `isAutoAllocate` (2026-06-12)

**Commit:** `03c55740` — "Added auto allocation on for open questions" (mamatha12-reddy).

**What changed:** In `processQuestionInBackground`, both `open`-transition paths
(`QuestionService.ts:1545` success path and `:1551` pipeline-error path) now write
`{ status: 'open', isAutoAllocate: true }` instead of just `{ status: 'open' }`.

**Effect:** Time-bound (WHATSAPP/AJRASAKHA) questions are still inserted with
`isAutoAllocate=false`, but as soon as the pipeline resolves them to `open`, the
flag flips to `true`. They therefore become candidates for the
`reallocateTimeBoundQuestions` cron immediately, without a moderator manually
toggling auto-allocate. Questions that terminate as `duplicate` / `non_agri` /
`isTesting` keep `isAutoAllocate=false`.

**Test impact:** Test #6 (NOT FOUND agri → open) previously asserted
`isAutoAllocate=false` and started failing (`expected true to be false`,
`WhatsAppQuestion.e2e.test.ts:461`) after this commit. The assertion was updated to
`true`. The matching Ajrasakha open-path assertion
(`AjrasakhaQuestion.e2e.test.ts:342`) was updated the same way. This was a
deliberate product change, not a regression — no code fix is needed.

---

# Known Bugs (found during testing)

## BUG-001 — empty question text returns 500 instead of 400 (partially fixed)

**Status:** Partially fixed as of 2026-06-11.

**Affected tests:**
- ❌ "invalid payload (empty question text)" — `question: ''` → expected 400, **still returns 500**
- ✅ "invalid payload (missing required detail field)" — missing `district` → **now returns 400** (fixed)

**Root cause (empty question text — still broken):**

`QuestionService.addQuestion` (QuestionService.ts:1165) throws `BadRequestError('Question is required')` for an empty question. But the method's outer `catch` block (line 1322) catches ALL errors indiscriminately and rethrows them as `InternalServerError`:

```typescript
// QuestionService.ts:1322-1331
} catch (error) {
  console.error(error);
  // ...
  throw new InternalServerError(`Failed to add question: ${error}`);
}
```

The controller (QuestionController.ts:332-354) catches service errors and re-throws them, but when it sees an `InternalServerError` it re-throws it as `InternalServerError` again (line 350), resulting in a 500 response instead of 400.

**Fix:** In the outer `catch` of `addQuestion`, check whether the caught error is already a `BadRequestError` (or `HttpError` with `httpCode < 500`) and re-throw it directly rather than wrapping it in `InternalServerError`.

**Why the "missing district" test was fixed:** `QuestionDetailsDto` has `@IsNotEmpty()` (or equivalent) validation on `district`. When `district` is missing, `routing-controllers`' class-validator fires BEFORE the service is called, returning 400 directly without ever entering `addQuestion`. The service's faulty outer catch is never reached.

**Note:** The comment in the test file for the "missing district" case is now outdated — it says "this 400 does NOT come from class-validator". It now DOES come from class-validator on `QuestionDetailsDto`. The comment should be updated if/when BUG-001 is fully fixed.
