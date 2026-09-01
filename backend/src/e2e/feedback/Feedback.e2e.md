# Feedback Workflow — E2E Test Documentation

**File:** `src/e2e/feedback/Feedback.e2e.test.ts`

**Introduced:** 2026-08-19, as a new suite covering a mechanism that had zero prior e2e coverage.

## What this covers

A CLOSED question can receive feedback from three independent sources, tracked per-source on
`question.feedbacks[]` (`{source, status}`):

| Source | Origin | How it opens |
|--------|--------|---------------|
| `PAE_Validation` | Internal — a real `pae_expert`-role user | Every close path stamps `paeValidation:'pending'`. `runPaeValidationQueueCron` assigns pending questions to available `pae_expert` users. `POST /pae/validations/process` with `status:'feedback'` creates a `feedbacks` collection doc + opens the question's `PAE_Validation` entry. |
| `DATASET` | External — the chat-app's downstream data-release service ("chat app" in the user's framing) | `PATCH /questions/feedbacks/question/:questionId` (`InternalApiAuth`) with `{source:'DATASET'}`. Dummied here by calling that internal webhook directly, since the chat app itself is out of this backend's scope. |
| `WEB_APPLICATION` | External — the public web app ("general public site") | Same webhook, `{source:'WEB_APPLICATION'}`. Also dummied. |

**Routing** (`QuestionService.runModeratorQueueCron`'s "feedback pass", ~`QuestionService.ts:7245`):
an open feedback is a time-bound item competing for the moderator's single slot. Target = the
final answer's `approvedBy` moderator IF active, non-blocked, role=`moderator`, and not already
holding a feedback; **else** an available auditor (`role='auditor'`, no time-bound item, no
existing feedback) — this is the "moderator busy → auditor" fallback.

**Settlement** (`POST /:questionId/:feedbackId/feedback-action` → `handleFeedbackAction`): for
`PAE_Validation` it updates the local `feedbacks` collection doc directly. For
`DATASET`/`WEB_APPLICATION` it calls OUT to an external service and only closes the source
locally once that response reports `pendingFeedbackCount <= 0`. A question is released from
feedback (reviewer's `feedbacksAssigned` cleared, review round finished) only once **every** open
source is closed — a question can have all 3 sources open at once.

**Manual admin controls**: `assignFeedbackReviewerManually` / `removeFeedbackReviewer` (one-at-a-
time claim rules mirroring the cron) and the `autoAllocateFeedback` toggle
(`PATCH /:questionId/role-allocation {role:'feedback'}`).

**PAE Validation queue/reviewer management** (Group 1b — a sibling system to the feedback-source
above, and the only OTHER e2e-untested surface of the `pae_expert` role besides the answer-
authoring skip-review flow already covered by `PostAllocation.e2e.test.ts`): the `paeValidation`
status field (`pending`/`in-progress`/`completed`) and its own `GET /pae-val/queue-details`,
`GET /:questionId/pae-validation-timeline`, `POST`/`DELETE /:questionId/pae-val-reviewer` (manual
assign/reassign/remove), `GET /pae/validations/assigned` (a PAE expert's own dashboard), and the
`autoAllocatePaeValidationExpert` toggle (`role:'pae_validator'`). This is a **separate** object
from the `PAE_Validation` feedback *source* above — a question always goes through `paeValidation`
first (every close path stamps it `'pending'`), and only reaching `status:'feedback'` on
`POST /pae/validations/process` additionally opens the feedback source.

**Not covered here:**
- The paginated feedback DISPLAY endpoint (`GET /:questionId/feedbacks`, merging local PAE
  feedbacks with the external data-release service's DATASET/WEB_APPLICATION feedback content) and
  the chatbot-side feedback analytics/report endpoints (`ChatbotService.getFeedbackUsers`,
  `getFeedbackByLocation`, dataset listings) — those are read/reporting surfaces layered on top of
  this mechanism, not part of the routing/settlement logic itself.
- PAE expert domain/state preference MATCHING (`isQuestionMatchForPaeExpert`) — exercised only
  incidentally (fixtures carry no preference, so match-anything).
- **`POST /bulk-pae-allocate`** (`QuestionService.bulkAllocatePaeExperts` — the real mechanism that
  puts a `pae_expert` into a draft question's answer-authoring queue in the first place, upstream
  of `PostAllocation.e2e.test.ts`'s PAE describe block, which seeds the queue directly instead).
  Confirmed **unreachable in this harness**: it hands off to a `worker_threads` worker
  (`paeAllocation.worker.ts`) via a hardcoded `path.join(__dirname, 'paeAllocation.worker.js')` —
  under vitest/ts-node `__dirname` resolves to the TS source directory, which has no compiled
  `.js` file (only `pnpm run build`'s `build/` output does). Verified directly: calling
  `startPaeAllocationWorker` produces `❌ Worker error: Cannot find module
  '.../src/workers/paeAllocation.worker.js'` and the job status flips to `'failed'` — the exact
  same failure mode already observed for `balanceWorkload.worker.js` when running the full e2e
  suite in this harness. Parked as a known, environment-level gap (same category as the OUTREACH
  duplicate-detection engine), not attempted here.

## Flow diagram

> **To preview this diagram locally:** install the VS Code extension
> **"Markdown Preview Mermaid Support"** then press `Ctrl+Shift+V`.
> Diagrams also render natively on GitHub.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 50, 'rankSpacing': 60}}}%%
flowchart TD
  classDef entry  fill:#ede9fe,stroke:#7c3aed,color:#3b0764,font-weight:bold
  classDef ok     fill:#d1fae5,stroke:#059669,color:#064e3b
  classDef warn   fill:#fef9c3,stroke:#d97706,color:#78350f
  classDef err    fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
  classDef decide fill:#faf5ff,stroke:#7c3aed,color:#3b0764
  classDef fail   fill:#fdba74,stroke:#ea580c,color:#7c2d12,font-weight:bold

  START["Question is CLOSED
  (any close path stamps paeValidation:'pending')"]:::entry

  subgraph PAE["PAE_Validation - internal"]
    P1["runPaeValidationQueueCron assigns to
    an available pae_expert (domain/state match)"]:::ok
    P2{"POST /pae/validations/process
    status?"}:::decide
    P3["approve -> paeValidation 'completed',
    expert freed"]:::ok
    P4["feedback -> feedbacks doc created,
    question.feedbacks[PAE_Validation]=open,
    autoAllocateFeedback=true,
    expert STILL freed (docstring says
    otherwise) - FINDING-009"]:::warn
    START --> P1 --> P2
    P2 -- approve --> P3
    P2 -- feedback --> P4
  end

  subgraph PAEMGMT["PAE Validation queue &amp; reviewer management (Group 1b)"]
    M1["Read: GET /pae-val/queue-details,
    GET /:id/pae-validation-timeline,
    GET /pae/validations/assigned"]:::ok
    M2["POST /:id/pae-val-reviewer
    manual assign / reassign by index"]:::ok
    M3["BUG-015: reassign-by-index calls
    assignPaeValidationReviewer, which
    unconditionally $set-overwrites the
    WHOLE paeValidation array instead of
    a guarded $push -> destroys round
    history instead of repointing"]:::fail
    M4["BUG-016: addPaeValidationAssigned's
    claim filter is {_id} only - no
    isBlocked/status/empty-array check -
    'not available' error can never fire,
    a PAE expert can be double-booked"]:::fail
    M5["DELETE /:id/pae-val-reviewer -
    open round only, completed rejected"]:::ok
    M6["toggle autoAllocatePaeValidationExpert
    (role='pae_validator') gates the cron"]:::ok
    P1 -.-> M1
    M2 -.-> M3
    M2 -.-> M4
  end

  subgraph EXT["DATASET (chat app, dummied) / WEB_APPLICATION (public site, dummied)"]
    E1["External service PATCHes
    /questions/feedbacks/question/:id
    {source} - InternalApiAuth"]:::entry
    E2["addOrUpdateFeedbackStatus:
    opens/reopens that source's entry,
    autoAllocateFeedback=true,
    recentFeedback=now (idempotent)"]:::ok
    START -.-> E1 --> E2
  end

  subgraph ROUTE["Routing - runModeratorQueueCron feedback pass"]
    R1{"final answer's approvedBy:
    active, non-blocked MODERATOR,
    no existing feedback?"}:::decide
    R2["assign to approver-moderator"]:::ok
    R3["fall back to an available AUDITOR
    (no time-bound item, no feedback)"]:::warn
    P4 --> R1
    E2 --> R1
    R1 -- yes --> R2
    R1 -- "no (blocked/busy/inactive)" --> R3
  end

  subgraph SETTLE["Settlement - POST /:qId/:feedbackId/feedback-action"]
    S1{"source?"}:::decide
    S2["PAE_Validation: update local
    feedbacks doc directly"]:::ok
    S3["DATASET/WEB_APPLICATION: fetch
    external service (mocked in tests)"]:::ok
    S4["BUG-014: WEB_APPLICATION branch
    resolves WEB_APP_URL but never uses it -
    both sources call DATA_RELEASE_URL,
    only the auth header differs"]:::fail
    S5{"pendingFeedbackCount<=0
    (DATASET/WEB_APPLICATION only)?"}:::decide
    S6["close ONLY this source's entry"]:::ok
    S7{"every source now closed?"}:::decide
    S8["finish review round,
    free the reviewer"]:::ok
    S9["round stays open -
    other source(s) still pending"]:::warn
    R2 --> S1
    R3 --> S1
    S1 -- PAE_Validation --> S2 --> S7
    S1 -- "DATASET/WEB_APPLICATION" --> S3
    S3 -.-> S4
    S3 --> S5
    S5 -- yes --> S6 --> S7
    S5 -- no --> S9
    S7 -- yes --> S8
    S7 -- no --> S9
  end

  subgraph ADMIN["Manual admin controls"]
    A1["assign/reassign feedback reviewer
    by userId (+index for reassign)"]:::ok
    A2["remove an OPEN round by index -
    completed rounds cannot be removed"]:::ok
    A3["toggle autoAllocateFeedback
    (role='feedback')"]:::ok
  end
```

## Strategy

Same in-process harness as `PostAllocation.e2e.test.ts` / `GatekeeperAuditor.e2e.test.ts`: real
Atlas DB from `.env`, `NODE_ENV='development'` (TLS), production DI container, `currentTestUser`
swapped per request (no Firebase), global `InternalApiAuth` via `x-internal-api-key`. `AiService`
is dummied for safety. Roles used here (`pae_expert`/`moderator`/`auditor`/`admin`/`expert`) have
no fixed `.env.test` fixtures beyond the moderator/admin already reused by other suites, so fresh
`RUN_TAG`-tagged users are inserted directly (`gatekeeper-auditor`'s `makeUser` pattern) — this
also gives full control over `isBlocked`/`status`/`feedbacksAssigned` for the routing-fallback
tests, and guarantees a deterministic pool member since the shared DB may hold other real/leftover
moderators and auditors.

The PAE validation cron (`runPaeValidationQueueCron`) sorts pending questions by `createdAt`
ascending and assigns to whichever available `pae_expert` it iterates to first — the identity of
the actual assignee is read back from the DB after the cron runs, not assumed, and the seeded
question's `createdAt` is stamped to the Unix epoch so it is guaranteed the global oldest match
regardless of any other pending PAE validations that may exist in the shared DB.

`handleFeedbackAction`'s outbound call to the external data-release/web-app service isn't behind
an injectable seam (unlike `AiService`), so it's mocked directly via `vi.spyOn(global, 'fetch')`,
scoped per-test with `mockResolvedValueOnce`.

## Findings

### FINDING-009 (documentation-only mismatch, not a functional bug) — `processPaeValidation`'s docstring is stale

Both the service method's own comment (`QuestionService.ts:11186-11188`) and the controller
endpoint's `@OpenAPI` description (`QuestionController.ts:3602-3604`) say a `status:'feedback'`
decision leaves the question "assigned to the PAE expert for further work". The actual
implementation calls `removePaeValidationAssigned` in **both** the `'approve'` and `'feedback'`
branches — the PAE expert is freed either way. The only real difference `'feedback'` makes is that
it additionally opens a `PAE_Validation` feedback entry that later routes to a moderator/auditor.
Pinned in Group 1's `[FINDING-009]` test.

### BUG-014 — `WEB_APPLICATION` feedback settlement is sent to the DATASET service, not the web app

`handleFeedbackAction` (`QuestionService.ts:9945-9995`) resolves `WEB_APP_Url =
process.env.WEB_APP_URL` but never references that variable. Both the `DATASET` and
`WEB_APPLICATION` branches call `fetch(`${dataReleaseUrl}/feedbacks/${feedbackId}/status`, ...)`
— identical URL — and only the `Authorization` header differs (`authKey` vs `webAuthKey`). Any
real public-site (`WEB_APPLICATION`) accept/reject is therefore sent to the chat-app's
data-release service instead of the intended web app backend. Pinned in Group 4's `[BUG-014]`
test, which asserts the actual (buggy) URL so the suite documents current behavior rather than
silently passing on a wrong assumption. Not fixed here — QA-only role.

### BUG-015 — manually reassigning a PAE validation round wipes its round history instead of repointing it

`assignPaeValidationReviewerManually` (`QuestionService.ts:10965`) calls
`SubmissionRepository.assignPaeValidationReviewer` unconditionally for **both** a fresh assignment
and an index-targeted reassignment. That repository method (`SubmissionRepository.ts:5065-5090`)
does `$set: {paeValidation: [singleElementArray]}` matched only on `questionId` — an unconditional
overwrite, not a guarded `$push` like its feedback sibling (`assignFeedbackReviewer`, which pushes
only when no round is currently open). So a reassignment doesn't repoint the targeted round — it
**deletes every other round in the array** (including completed ones) and replaces the whole thing
with one fresh round for the new reviewer. As a side effect, the "This question already has an
open pae validation review" guard error can never trigger either, since the underlying update
always succeeds. Pinned in Group 1b's `[BUG-015]` test: seeds a completed round + an open round,
reassigns the open one by index, and shows the completed round vanished entirely.

### BUG-016 — a PAE expert can be manually double-booked; the "not available" guard never fires

`UserRepository.addPaeValidationAssigned` (`UserRepository.ts:3021-3052`), used as the "claim" step
in `assignPaeValidationReviewerManually`, matches only `{_id: new ObjectId(paeExpertId)}` — no
`isBlocked`, `status`, or "`paeValidationAssigned` empty" condition, unlike its feedback sibling
`claimFeedbackAllocationManual`. The service method's own `if (!claimed) throw new
BadRequestError('Selected user is not available (already holds a pae validation, or is
inactive/blocked).')` branch is therefore dead code — the claim always succeeds. An admin can
manually assign a PAE expert who is already mid-validation on a different question to a second one,
bypassing the one-at-a-time invariant the cron (`findAvailablePaeExperts`) otherwise enforces.
Pinned in Group 1b's `[BUG-016]` test.

## Test cases (34 total, all passing)

| # | Group | What | Expected |
|---|-------|------|----------|
| 1 | PAE_Validation | `runPaeValidationQueueCron` assigns an ancient pending question | question `paeValidation='in-progress'`, submission gets a `paeValidation[]` entry, expert's `paeValidationAssigned` contains the question |
| 2 | PAE_Validation | `[FINDING-009]` PAE expert submits `status='feedback'` | `feedbacks` doc created (`type:'PAE_VALIDATION'`, `status:'open'`), `question.feedbacks[PAE_Validation]` open, `autoAllocateFeedback=true`, `paeValidation='completed'`, expert freed despite the docstring |
| 3 | PAE_Validation | PAE expert submits `status='approve'` | `paeValidation='completed'`, no `feedbacks` doc, no feedback source opened, round's `paeFinishedAt` set, expert freed |
| 4 | PAE queue/reviewer mgmt | `GET /pae-val/queue-details` (non-expert) + `GET /pae/validations/assigned` (PAE expert) | 200, expected `PaeValidationQueueDetails`/paginated-assigned shapes |
| 5 | PAE queue/reviewer mgmt | expert calls `/pae-val/queue-details` | 403 |
| 6 | PAE queue/reviewer mgmt | `GET /:id/pae-validation-timeline` after cron assignment | `hasOpenRound=true`, `reviews[0].paeStatus='in-progress'` |
| 7 | PAE queue/reviewer mgmt | admin manually assigns a PAE reviewer to a pending, unassigned question | round opened, `paeValidation='in-progress'`, expert's `paeValidationAssigned` updated |
| 8 | PAE queue/reviewer mgmt | assign a reviewer once `paeValidation='completed'` | 400 "This question has already completed PAE validation." |
| 9 | PAE queue/reviewer mgmt | `[BUG-015]` reassign an open round by index (2 rounds seeded: 1 completed, 1 open) | expected: 2 rounds, only index 1 repointed; actual: 1 round total — completed round destroyed |
| 10 | PAE queue/reviewer mgmt | `[BUG-016]` manually assign a PAE expert already holding one validation | expected: 400 "not available"; actual: 200 — expert now holds 2 concurrent `paeValidationAssigned` entries |
| 11 | PAE queue/reviewer mgmt | admin removes an open round | round removed, `paeValidation` reset to `'pending'`, reviewer released |
| 12 | PAE queue/reviewer mgmt | remove a COMPLETED round | 400 "A completed pae validation review cannot be removed." |
| 13 | PAE queue/reviewer mgmt | toggle `autoAllocatePaeValidationExpert` OFF then ON (`role='pae_validator'`) | OFF: `runPaeValidationQueueCron` skips the question; ON: cron picks it up |
| 14 | Routing | active, free approver-moderator | gets the feedback assigned directly (`feedbackReviews[0].reviewerId === approver`) |
| 15 | Routing | `isBlocked=true` approver-moderator | falls back to an available auditor |
| 16 | Routing | approver-moderator already holding another feedback (`feedbacksAssigned` non-empty) | falls back to an available auditor |
| 17 | Routing | approver-moderator `status='in-active'` | falls back to an available auditor |
| 18 | DATASET/WEB_APPLICATION | missing/invalid `x-internal-api-key` on the intake webhook | 401 |
| 19 | DATASET/WEB_APPLICATION | `PATCH /feedbacks/question/:id {source:'DATASET'}` (simulated chat-app feedback) | opens the source, `autoAllocateFeedback=true`, `recentFeedback` stamped, routes to approver-moderator via the cron |
| 20 | DATASET/WEB_APPLICATION | same webhook with `{source:'WEB_APPLICATION'}` (simulated public-site feedback) | opens the source the same way |
| 21 | DATASET/WEB_APPLICATION | re-notifying an already-open DATASET source | idempotent — reopens the same entry, never duplicates it |
| 22 | Settlement | PAE_Validation accept (single source) | local `feedbacks` doc → `status:'accept'`, question source entry `closed`, review round `finishedAt` set, reviewer freed |
| 23 | Settlement | DATASET accept, external service reports `pendingFeedbackCount:0` | source closed, round finished, `fetch` called with `DATA_RELEASE_URL` + `Bearer REVIEW_SYSTEM_AUTH_KEY` |
| 24 | Settlement | DATASET reject, external service reports `pendingFeedbackCount:3` | source stays `open`, round stays open, reviewer still assigned |
| 25 | Settlement | `[BUG-014]` WEB_APPLICATION accept | `fetch` called with `DATA_RELEASE_URL` (not `WEB_APP_URL`) + `Bearer WEB_WEBHOOK_API_KEY` |
| 26 | Settlement | question with `PAE_Validation` AND `DATASET` both open | closing one alone leaves the round open (other source still open); closing both finishes the round and frees the reviewer |
| 27 | Manual admin (feedback) | assign a reviewer to a waiting (unassigned) feedback | round opened, reviewer's `feedbacksAssigned` updated |
| 28 | Manual admin (feedback) | reassign an open round to a different reviewer by index | round repointed, old reviewer released |
| 29 | Manual admin (feedback) | assign a reviewer once the feedback is already fully closed | 400 "This feedback is already closed." |
| 30 | Manual admin (feedback) | remove an open round | round removed, reviewer released |
| 31 | Manual admin (feedback) | remove a COMPLETED round | 400 "A completed feedback review cannot be removed." |
| 32 | Manual admin (feedback) | toggle `autoAllocateFeedback` OFF then ON (`role='feedback'`) | OFF: cron's auto-only pass skips the question; ON: cron picks it up |
| 33 | Read endpoints | `GET /feedback/queue-details` + `/feedback/reviewers` for a non-expert | 200, expected `FeedbackQueueDetails` shape (`waitingAuto`, `assigned`, ...) |
| 34 | Read endpoints | expert calls `/feedback/queue-details` | 403 |

## Coverage notes

- **Three feedback sources, one routing/settlement mechanism**: `PAE_Validation` is the only
  source with a real internal producer (a genuine `pae_expert` user going through the actual
  cron + submission endpoint); `DATASET`/`WEB_APPLICATION` are external in origin per the
  application's own design (an external data-release / web-app service is the source of truth for
  the feedback content), so per the explicit scoping decision for this suite they're exercised by
  calling the internal intake webhook directly rather than standing up a fake external app.
- **"Moderator busy → auditor" fallback** is tested via three independent unavailability reasons
  (`isBlocked`, existing `feedbacksAssigned`, `status:'in-active'`) rather than one representative
  case, since each is a distinct branch of the `approverEligible` check in
  `QuestionService.ts:7309-7315`.
- **Settlement mocking**: `handleFeedbackAction`'s outbound `fetch` for DATASET/WEB_APPLICATION
  isn't behind an injectable seam, so it's mocked per-test via `vi.spyOn(global, 'fetch')` rather
  than a DI container rebind (the pattern every other suite uses for `AiService`) — this was an
  explicit scoping decision (see session log) given the codebase has no existing precedent for
  raw `fetch` mocking.
- **Not exhaustively covering** the paginated feedback DISPLAY endpoint or chatbot-side feedback
  analytics — those are read/reporting surfaces, not part of the routing/settlement mechanism this
  suite exists to verify (see "What this covers" above).
- **Group 1b (PAE Validation queue/reviewer management) was added after a follow-up survey** of
  every `pae_expert`-related route in the codebase, prompted by the question "does any suite cover
  all PAE routes?". Answer at the time: no — besides this suite's `PAE_Validation` feedback-source
  tests and `PostAllocation.e2e.test.ts`'s answer-authoring skip-review tests, the `paeValidation`
  queue/reviewer/toggle system (7 endpoints) had zero coverage. Extended here rather than as a new
  file, since it's structurally the same object Group 1 already drives (same harness, same
  `makeUser('pae_expert')`/`seedClosedQuestion` fixtures) — matches this repo's convention of
  splitting suites by workflow stage, not by role.
- **`POST /bulk-pae-allocate`** — the actual entry point that assigns a `pae_expert` into a
  question's answer-authoring queue — was investigated but confirmed unreachable in this harness
  (worker-thread module resolution; see "What this covers" above) and is not attempted here.

---

## Last Run

**Date:** 20-08-2026 &nbsp;|&nbsp; **Result:** ✅ all 34 passed &nbsp;|&nbsp; **Duration:** 1.2 min

> ⚠ Vitest only printed 33 of 34 test lines (passing suites are truncated in the output).

| # | Test | Result | Failure reason |
|---|------|:------:|----------------|
| 1 | Feedback — Group 1: PAE_Validation (internal) > runPaeValidationQueueCron assigns an an... | ✅ | — |
| 2 | Feedback — Group 1: PAE_Validation (internal) > [FINDING-009] PAE expert submitting sta... | ✅ | — |
| 3 | Feedback — Group 1: PAE_Validation (internal) > PAE expert submitting status=approve co... | ✅ | — |
| 4 | Feedback — Group 1b: PAE Validation queue & reviewer management > GET /pae-val/queue-de... | ✅ | — |
| 5 | Feedback — Group 1b: PAE Validation queue & reviewer management > an expert is forbidde... | ✅ | — |
| 6 | Feedback — Group 1b: PAE Validation queue & reviewer management > GET /:questionId/pae-... | ✅ | — |
| 7 | Feedback — Group 1b: PAE Validation queue & reviewer management > admin manually assign... | ✅ | — |
| 8 | Feedback — Group 1b: PAE Validation queue & reviewer management > assigning a reviewer ... | ✅ | — |
| 9 | Feedback — Group 1b: PAE Validation queue & reviewer management > [BUG-015] reassigning... | ✅ | — |
| 10 | Feedback — Group 1b: PAE Validation queue & reviewer management > [BUG-016] a PAE exper... | ✅ | — |
| 11 | Feedback — Group 1b: PAE Validation queue & reviewer management > admin removes an open... | ✅ | — |
| 12 | Feedback — Group 1b: PAE Validation queue & reviewer management > removing a COMPLETED ... | ✅ | — |
| 13 | Feedback — Group 1b: PAE Validation queue & reviewer management > toggling autoAllocate... | ✅ | — |
| 14 | Feedback — Group 2: routing (runModeratorQueueCron feedback pass) > an active, free app... | ✅ | — |
| 15 | Feedback — Group 2: routing (runModeratorQueueCron feedback pass) > a BLOCKED approver-... | ✅ | — |
| 16 | Feedback — Group 2: routing (runModeratorQueueCron feedback pass) > an approver-moderat... | ✅ | — |
| 17 | Feedback — Group 2: routing (runModeratorQueueCron feedback pass) > an INACTIVE approve... | ✅ | — |
| 18 | Feedback — Group 3: DATASET / WEB_APPLICATION intake webhook > rejects the internal fee... | ✅ | — |
| 19 | Feedback — Group 3: DATASET / WEB_APPLICATION intake webhook > DATASET webhook (simulat... | ✅ | — |
| 20 | Feedback — Group 3: DATASET / WEB_APPLICATION intake webhook > WEB_APPLICATION webhook ... | ✅ | — |
| 21 | Feedback — Group 3: DATASET / WEB_APPLICATION intake webhook > re-notifying an already-... | ✅ | — |
| 22 | Feedback — Group 4: accept/reject settlement > PAE_Validation accept closes the source,... | ✅ | — |
| 23 | Feedback — Group 4: accept/reject settlement > DATASET accept (external service reports... | ✅ | — |
| 24 | Feedback — Group 4: accept/reject settlement > DATASET reject with pendingFeedbackCount... | ✅ | — |
| 25 | Feedback — Group 4: accept/reject settlement > [BUG-014] WEB_APPLICATION accept still c... | ✅ | — |
| 26 | Feedback — Group 4: accept/reject settlement > a question with PAE_Validation AND DATAS... | ✅ | — |
| 27 | Feedback — Group 5: manual admin controls > admin manually assigns a feedback reviewer ... | ✅ | — |
| 28 | Feedback — Group 5: manual admin controls > admin reassigns an already-open round to a ... | ✅ | — |
| 29 | Feedback — Group 5: manual admin controls > assigning a reviewer is rejected once the f... | ✅ | — |
| 30 | Feedback — Group 5: manual admin controls > admin removes an open feedback-review round... | ✅ | — |
| 31 | Feedback — Group 5: manual admin controls > removing a COMPLETED round is rejected | ✅ | — |
| 32 | Feedback — Group 5: manual admin controls > toggling autoAllocateFeedback OFF then ON (... | ✅ | — |
| 33 | Feedback — Group 6: feedback-tab read endpoints > GET /feedback/queue-details and /feed... | ✅ | — |
