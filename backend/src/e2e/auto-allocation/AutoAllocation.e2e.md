# Auto Allocation — E2E Test Documentation

**File:** `src/e2e/auto-allocation/AutoAllocation.e2e.test.ts`  
**Related:** `src/e2e/manual-allocation/ManualAllocation.e2e.test.ts`

> **To preview diagrams locally:** install the VS Code extension  
> **"Markdown Preview Mermaid Support"** then press `Ctrl+Shift+V`.  
> Diagrams also render natively on GitHub.

---

## What this covers

Four allocation paths tested against the **real Atlas DB** (`.env`):

| Path | Groups | Method / Function | Description |
|------|--------|-------------------|-------------|
| AGRI_EXPERT | G1–G2 | `POST /api/questions` (source=`AGRI_EXPERT`) | Creates question → `setImmediate` kicks off background expert assignment |
| OUTREACH | G3 | `POST /api/questions` (source=`OUTREACH`) | Creates question — queue stays empty; no background allocation |
| Toggle | G4 | `PATCH /api/questions/:id/toggle-auto-allocate` | Moderator flips flag; OFF→ON calls `autoAllocateExperts` synchronously |
| Time-bound cron | G5–G10 | `questionService.reallocateTimeBoundQuestions()` | Cron (every 2 min in prod) assigns STF experts to WHATSAPP/AJRASAKHA questions |
| Reviewer-stage guard | G11 | `questionService.reallocateTimeBoundQuestions()` | Cron does not re-process a question already in the reviewer stage |
| Toggle sequential | G12 | `PATCH /api/questions/:id/toggle-auto-allocate` | ON→OFF→ON on the same question — no duplicate experts, queue preserved on OFF |

---

## Flow diagram

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 50, 'rankSpacing': 60}}}%%
flowchart TD
  classDef entry  fill:#ede9fe,stroke:#7c3aed,color:#3b0764,font-weight:bold
  classDef bg     fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
  classDef ok     fill:#d1fae5,stroke:#059669,color:#064e3b
  classDef warn   fill:#fef9c3,stroke:#d97706,color:#78350f
  classDef err    fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
  classDef decide fill:#faf5ff,stroke:#7c3aed,color:#3b0764
  classDef tb     fill:#fce7f3,stroke:#db2777,color:#831843
  classDef fail   fill:#fdba74,stroke:#ea580c,color:#7c2d12,font-weight:bold

  ROOT["Auto Allocation — 4 Paths"]:::entry

  subgraph P1["① AGRI_EXPERT  ·  G1 / G2"]
    A1["POST /api/questions
    source = 'AGRI_EXPERT'
    details: { state, district, crop, season, domain }"]:::entry
    A2["saved
    status = 'open'  ·  isAutoAllocate = true  ·  queue = []"]:::ok
    A3["setImmediate →
    processQuestionInBackground()"]:::bg
    A4["findExpertsByPreference(details)
    state +3  ·  domain +2  ·  crop +1
    sort: score DESC, workload ASC"]:::bg
    A5["updateQueue([ top1Expert ])
    DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT = 1"]:::ok
    A6["reputationScore(queue[0]) +1
    notify queue[0]  type='answer_creation'
    firstAllocationAt = now()
    BUG: notification not sent (test #4) — service bug"]:::warn
    A1 --> A2 --> A3 --> A4 --> A5 --> A6
  end

  subgraph P2["② OUTREACH  ·  G3"]
    B1["POST /api/questions
    source = 'OUTREACH'"]:::entry
    B2["saved
    status = 'open'  ·  isAutoAllocate = true  ·  queue = []"]:::ok
    B3["No background job
    processQuestionInBackground()
    only fires for AGRI_EXPERT source"]:::warn
    B4["queue stays empty
    manual allocation or toggle required"]:::warn
    B1 --> B2 --> B3 --> B4
  end

  subgraph P3["③ Toggle auto-allocate  ·  G4"]
    C1["PATCH /api/questions/:id/toggle-auto-allocate"]:::entry
    C2{"authenticated?"}:::decide
    C3["401 Unauthorized"]:::err
    C4{"isAutoAllocate
    current value?"}:::decide
    C5["autoAllocateExperts(questionId)
    synchronous
    same preference algorithm as AGRI_EXPERT"]:::bg
    C6["isAutoAllocate = true
    queue populated"]:::ok
    C7["isAutoAllocate = false
    queue unchanged"]:::warn
    C1 --> C2
    C2 -- no --> C3
    C2 -- yes --> C4
    C4 -- "false (OFF to ON)" --> C5 --> C6
    C4 -- "true (ON to OFF)" --> C7
  end

  subgraph P4["④ Time-bound cron  ·  G5 to G14"]
    D1["reallocateTimeBoundQuestions()
    prod: cron every 2 min
    test: called directly on questionService"]:::entry
    D2{"isReallocatingTimeBound?"}:::decide
    D3["return early
    'Reallocation already in progress'
    reallocated=0, skipped=0"]:::warn
    D4["Parallel fetch:
    findUnallocatedTimeBoundQuestions
    findTimeBoundQuestionsForReallocation
    findOpenedButIdleTimeBoundQuestions
    findAnsweredQuestionsNeedingReviewer"]:::tb
    D5["merge + sort by createdAt ASC
    oldest question processed first"]:::tb
    D6{"for each
    work item"}:::decide
    D1 --> D2
    D2 -- yes --> D3
    D2 -- no --> D4 --> D5 --> D6

    E1["unallocated time-bound question
    source IN WHATSAPP or AJRASAKHA
    status IN open, delayed, duplicate
    isAutoAllocate=true, isOnHold != true
    queue=[], currentExpertAllocatedAt absent"]:::entry
    E2{"free STF expert?
    special_task_force=true
    activeTimeBound < MAX_TIME_BOUND = 1"}:::decide
    E3["skipped++
    question stays unallocated"]:::err
    E4["updateQueue([ stfExpert ])
    firstAllocationAt = now()
    currentExpertAllocatedAt = now()
    reputationScore +1"]:::ok
    E5["notify stfExpert
    type='answer_creation'
    msg: 'WhatsApp' or 'Ajrasakha'"]:::ok

    F1["stuck: allocated >45 min, never opened
    currentExpertAllocatedAt ≤ 45 min ago
    currentExpertOpenedAt absent/null
    source IN WHATSAPP, AJRASAKHA
    status NOT IN closed/in-review/...
    isAutoAllocate=true, isOnHold!=true"]:::entry
    F2{"free STF expert?
    not current / history / queue
    history.length=0 → STF required
    activeTimeBound < MAX_TIME_BOUND"}:::decide
    F3["skipped++"]:::err
    F4["flatAssignments += { submissionId, expertId
    appendExpert=false, skipPenalty=false }
    stuck expert IS penalised"]:::ok
    F5["startBalanceWorkloadWorkers(flatAssignments)
    worker: swaps queue, decrements old
    workload, sends answer_creation notif
    (mocked in tests — G13)"]:::warn

    FI1["openedIdle: opened >45 min, no answer
    currentExpertOpenedAt ≤ 45 min ago (set)
    lastHistory has no answer fields
    status IN open, delayed
    isAutoAllocate=true, isOnHold!=true"]:::entry
    FI2{"free STF expert?
    same rules as stuck branch
    history.length=0 → STF required"}:::decide
    FI3["skipped++"]:::err
    FI4["flatAssignments += { submissionId, expertId
    appendExpert=false, skipPenalty=TRUE }
    idle expert NOT penalised (only freed)"]:::ok

    G1["author answered, needs reviewer
    queue.length >= 1
    history.length >= queue.length
    lastHistory.answer exists"]:::entry
    G2["assignTimeBoundReviewer(questionId)"]:::tb
    G3{"free expert for reviewer?
    not in queue or history
    activeTimeBound < MAX_TIME_BOUND
    no STF requirement"}:::decide
    G4["no reviewer found — skipped"]:::err
    G5["push reviewer into queue
    queue = [ author, reviewer ]
    append history entry, status = 'in-review'"]:::ok
    G6["reset reviewer clock
    currentExpertAllocatedAt = now()
    currentExpertOpenedAt = null"]:::ok
    G7["notify reviewer
    type = 'peer_review'"]:::ok

    D6 -- "queue empty, never allocated" --> E1
    E1 --> E2
    E2 -- no --> E3
    E2 -- yes --> E4 --> E5

    D6 -- "allocated >45 min, not opened" --> F1
    F1 --> F2
    F2 -- no --> F3
    F2 -- yes --> F4 --> F5

    D6 -- "opened >45 min, no answer" --> FI1
    FI1 --> FI2
    FI2 -- no --> FI3
    FI2 -- yes --> FI4 --> F5

    D6 -- "author answered, no reviewer" --> G1
    G1 --> G2 --> G3
    G3 -- no --> G4
    G3 -- yes --> G5 --> G6 --> G7
  end

  subgraph P5["⑤ Reviewer-stage guard  ·  G11"]
    R1["WHATSAPP question
    queue = [author, reviewer]
    history = [author answer, reviewer in-review]
    currentExpertAllocatedAt = now"]:::entry
    R2{"findUnallocated?
    queue.size > 0 → excluded"}:::decide
    R3{"findAnsweredNeeding?
    lastHistory.answer = null → excluded"}:::decide
    R4{"findStuck / findIdle?
    allocatedAt < 45 min → excluded"}:::decide
    R5["cron skips this question
    queue unchanged at [author, reviewer]"]:::ok
    R1 --> R2 --> R3 --> R4 --> R5
  end

  subgraph P6["⑥ Toggle sequential  ·  G12"]
    S1["PATCH toggle (OFF → ON)
    autoAllocateExperts()
    queue = [expert]"]:::ok
    S2["PATCH toggle (ON → OFF)
    queue preserved, flag=false"]:::warn
    S3["PATCH toggle (OFF → ON) again
    autoAllocateExperts() re-runs
    queue = [expert], no duplicates"]:::ok
    S1 --> S2 --> S3
  end

  ROOT --> A1
  ROOT --> B1
  ROOT --> C1
  ROOT --> D1
  ROOT --> R1
  ROOT --> S1
```

**Questions excluded from the unallocated time-bound query (G7 negative cases):**

| Condition | Why excluded |
|-----------|-------------|
| `isAutoAllocate=false` | filter requires `isAutoAllocate=true` |
| `isOnHold=true` | filter excludes on-hold questions |
| `status='closed'` | only `open/delayed/duplicate` eligible |
| `status='non_agri'` | only `open/delayed/duplicate` eligible |
| `source='OUTREACH'` | source must be `WHATSAPP` or `AJRASAKHA` |
| `source='AGRI_EXPERT'` | source must be `WHATSAPP` or `AJRASAKHA` |
| `queue` non-empty | filter requires `queue.size=0` |

---

## Key differences at a glance

| Dimension | AGRI_EXPERT | OUTREACH | Toggle | Time-bound cron |
|-----------|-------------|----------|--------|----------------|
| **Source** | `AGRI_EXPERT` | `OUTREACH` | Any | `WHATSAPP`, `AJRASAKHA` |
| **Trigger** | `setImmediate` at creation | — | `PATCH` endpoint | Cron every 2 min |
| **Expert selection** | `findExpertsByPreference` (score + workload) | N/A | Same as AGRI_EXPERT | `findExpertsByReputationScore` (workload only) |
| **STF required?** | No | N/A | No | YES — initial only. No for reviewer |
| **MAX active cap** | No | N/A | No | 1 per expert (`MAX_TIME_BOUND`) |
| **Queue size** | 1 | 0 | 1 | 1 initially; grows as reviewers added |
| **Async?** | Yes (`setImmediate`) — tests poll | N/A | No — synchronous | No — awaited directly |
| **Notification** | `answer_creation` | None | `answer_creation` | `answer_creation` / `peer_review` (reviewer) |

---

## Strategy

**In-process server** — `loadAppModules('all')` builds the real production DI container against
the real Atlas DB. Users are fetched from the DB by email using `.env.test` credentials.
A `currentTestUser` variable is swapped per test; both `authorizationChecker` and
`currentUserChecker` read from it.

`InternalApiAuth` is a global `@Middleware({ type: 'before' })` that checks `x-internal-api-key`
on every route. The test sets `process.env.INTERNAL_API_KEY = 'e2e-auto-alloc-key'` and attaches
that header to all requests via `apiPost`/`apiPatch` helpers.

**Polling:** AGRI_EXPERT background processing runs via `setImmediate`, so the submission queue
is populated asynchronously. Tests poll every 300 ms (up to 10 s) using `pollUntil()`.

**Toggle is synchronous:** `toggleAutoAllocate` awaits `autoAllocateExperts` directly — no polling needed.

**Time-bound is synchronous:** `reallocateTimeBoundQuestions()` is awaited directly. The cron
wrapper is gated by `if (!appConfig.isDevelopment)` and never fires when `NODE_ENV=development`.

**STF auto-promotion:** `beforeAll` checks how many experts have `special_task_force=true`. If
fewer than 3, it promotes the shortfall number of non-STF experts (lowest `reputation_score` first)
via a `$set` update so Groups 5–8 and 13–14 always have enough STF experts to run. Groups 5, 6, 8,
13, and 14 guard with `if (stfExperts.length < 2) return;` as a last-resort fallback.

---

## Test setup

- `.env` loaded first → real Atlas DB URL / DB_NAME
- `.env.test` loaded second (dotenv does NOT override existing vars) → test user credentials
- `process.env.NODE_ENV = 'development'` set before any module load → Atlas TLS stays enabled
- AnswerService warm-up import before `loadAppModules` → circular-import workaround
- AiService dummied via `container.rebindSync(CORE_TYPES.AIService)`
- `questionService = container.get(CORE_TYPES.QuestionService)` fetched in `beforeAll`
- **STF auto-promotion:** if fewer than 3 experts have `special_task_force=true`, the shortfall is
  promoted via `users.updateMany(...)` before tests run (lowest `reputation_score` first, so
  preference-scoring test #5 is not disturbed)
- **Leftover cleanup (two passes):**
  1. Closes questions with STF expert already in queue (status `open`/`delayed`) — these make `getTimeBoundActiveCountPerExpert` count them as active even before our test seeds run.
  2. Closes unallocated (`queue=[]`) WHATSAPP/AJRASAKHA questions with `isAutoAllocate=true` from previous incomplete runs — these would consume the STF expert's capacity during the cron run before our question is processed.
  Both sets are tracked in `temporarilyClosedIds` and restored to `status='open'` in `afterAll`.
- **Per-group afterAlls (G5, G6, G8, G13):** After each time-bound group's tests complete, its seeded question is set to `status='closed'`, freeing the STF expert's capacity for the next group's cron run. G13's afterAll closes the stuck question so the same STF expert is free for G14.
- STF experts fetched after promotion and cleanup:
  `users.find({ role: 'expert', isBlocked: false, special_task_force: true })`

---

## Cleanup (afterAll)

Removes from the real DB (keyed on `createdQuestionIds`):
- `questions`
- `question_submissions`
- `notifications`

Restores any questions that were temporarily closed in `beforeAll` to `status: 'open'`
(keyed on `temporarilyClosedIds`).

`reputation_score` increments are NOT reversed — acceptable in the test DB.

---

## Test cases (54 total)

### Group 1 — AGRI_EXPERT background allocation (4 tests)

| # | What | Expected |
|---|------|----------|
| 1 | Question is immediately open with `isAutoAllocate=true` | `status='open'`, `isAutoAllocate=true` |
| 2 | Background process populates queue with exactly 1 expert | `queue.length === 1` (after `pollUntil`) |
| 3 | `firstAllocationAt` stamped after background runs | `instanceof Date` |
| 4 | `answer_creation` notification sent to `queue[0]` | notif found in DB |

### Group 2 — AGRI_EXPERT preference scoring (1 test)

| # | What | Expected |
|---|------|----------|
| 5 | `queue[0]` is `experttest1` (Punjab + Crop Protection + Brinjal = 6 pts) | `queue[0] === expertUser1._id` |

### Group 3 — OUTREACH: no background allocation (3 tests)

| # | What | Expected |
|---|------|----------|
| 6 | Question open with `isAutoAllocate=true` | `status='open'`, `isAutoAllocate=true` |
| 7 | Queue empty immediately after creation | `queue.length === 0` |
| 8 | Queue still empty after 1 s wait | `queue.length === 0` |

### Group 4 — Toggle auto-allocate (3 tests)

| # | What | Expected |
|---|------|----------|
| 9 | No user → 401 | `res.status === 401` |
| 10 | OFF→ON: flag flips, queue filled synchronously | `200`, `isAutoAllocate=true`, `queue.length >= 1` |
| 11 | ON→OFF: flag flips, queue untouched | `200`, `isAutoAllocate=false`, queue unchanged |

### Group 5 — WHATSAPP time-bound initial allocation (7 tests)

*`beforeAll` auto-promotes experts to STF so this normally runs. Self-skips only if promotion itself finds no eligible experts.*

| # | What | Expected |
|---|------|----------|
| 12 | `reallocateTimeBoundQuestions()` reports `reallocated >= 1` | ✓ |
| 13 | Queue has exactly 1 expert | `queue.length === 1` |
| 14 | Allocated expert has `special_task_force=true` | STF requirement enforced |
| 15 | `question.firstAllocationAt` stamped | `instanceof Date` |
| 16 | `submission.currentExpertAllocatedAt` set | `instanceof Date` |
| 17 | `answer_creation` notification sent to allocated expert | notif found |
| 55 | `firstAllocationAt` and `currentExpertAllocatedAt` differ by < 60 s (Issue #9) | `deltaMs < 60_000` |

### Group 6 — AJRASAKHA time-bound initial allocation (4 tests)

*Same pipeline as WHATSAPP — different source label. Self-skips only if STF promotion fails.*

| # | What | Expected |
|---|------|----------|
| 18 | `reallocateTimeBoundQuestions()` reports `reallocated >= 1` | ✓ |
| 19 | Queue has 1 STF expert | `queue.length === 1`, `expert.special_task_force === true` |
| 20 | Notification message mentions "Ajrasakha" | `notif.message` matches `/ajrasakha/i` |
| 21 | `firstAllocationAt` stamped | `instanceof Date` |

### Group 7 — Negative cases: questions NOT picked up (7 tests)

| # | Seed condition | Expected |
|---|---------------|----------|
| 22 | `isAutoAllocate=false` WHATSAPP | queue stays empty |
| 23 | `isOnHold=true` WHATSAPP | queue stays empty |
| 24 | `status='closed'` WHATSAPP | queue stays empty |
| 25 | `status='non_agri'` WHATSAPP | queue stays empty |
| 26 | `source='OUTREACH'` | queue stays empty |
| 27 | `source='AGRI_EXPERT'` | queue stays empty |
| 28 | Already allocated (non-empty queue) | queue unchanged at 1 expert |

### Group 8 — MAX_TIME_BOUND=1 capacity enforcement (3 tests)

*Self-skips only if STF promotion fails. Tests #30 and #31 are mutually exclusive on `stfExperts.length`.*

| # | What | Expected |
|---|------|----------|
| 29 | Busy STF expert NOT assigned to the new question | `queue[0] ≠ busyExpert._id` |
| 30 | Only 1 STF expert (now busy) → new question skipped | `queue=[]`, `skipped >= 1` |
| 31 | 2+ STF experts → new question goes to a different free one | `queue=[differentExpert]` |

### Group 11 — Reviewer-stage question not re-processed by cron (3 tests)

*Guards against the cron resetting or extending the queue when a reviewer is already mid-review.*

| # | What | Expected |
|---|------|----------|
| 39 | Queue still has exactly 2 members after cron run | `queue.length === 2` |
| 40 | `queue[0]` is still the original author | unchanged |
| 41 | `queue[1]` is still the original reviewer — no third expert added | unchanged |

### Group 12 — Toggle sequential ON → OFF → ON same question (3 tests)

*Documents toggle semantics and guards against unbounded queue growth on repeated flips.*

| # | What | Expected |
|---|------|----------|
| 42 | OFF→ON: `isAutoAllocate=true`, queue populated with 1 expert | `queue.length >= 1` |
| 43 | ON→OFF: `isAutoAllocate=false`, queue length preserved (not cleared) | queue same length as after ON |
| 44 | Second OFF→ON: no duplicate expert IDs in queue | all IDs unique |

### Group 13 — Stuck question (>45 min, never opened) (5 tests)

*`startBalanceWorkloadWorkers` is mocked — verifies detection + expert selection, not worker DB writes. Self-skips if fewer than 2 STF experts.*

| # | What | Expected |
|---|------|----------|
| 45 | `reallocateTimeBoundQuestions()` reports `reallocated >= 1` | stuck question detected |
| 46 | `startBalanceWorkloadWorkers` was called | worker path triggered |
| 47 | Worker assignment for our submission has `appendExpert=false` | replacement (not append) |
| 48 | `skipPenalty` is falsy — stuck expert IS penalised | `skipPenalty === false` |
| 49 | Replacement expert is STF and not the stuck expert | `special_task_force=true`, different ID |

### Group 14 — Opened-but-idle question (>45 min, no answer) (5 tests)

*Same worker mock as G13. Key difference: `skipPenalty=true` — idle expert is freed but not penalised. Self-skips if fewer than 2 STF experts.*

| # | What | Expected |
|---|------|----------|
| 50 | `reallocateTimeBoundQuestions()` reports `reallocated >= 1` | idle question detected |
| 51 | `startBalanceWorkloadWorkers` was called | worker path triggered |
| 52 | Worker assignment for our submission has `appendExpert=false` | replacement (not append) |
| 53 | `skipPenalty=true` — idle expert NOT penalised | `skipPenalty === true` |
| 54 | Replacement expert is different from the idle expert | different ID |

### Group 9 — Concurrent run guard (1 test)

| # | What | Expected |
|---|------|----------|
| 32 | Second call (before first `await`) returns early | `message === 'Reallocation already in progress'`, `reallocated=0`, `skipped=0` |

### Group 10 — Reviewer assignment (6 tests)

| # | What | Expected |
|---|------|----------|
| 33 | `reallocateTimeBoundQuestions()` reports `reallocated >= 1` | ✓ |
| 34 | Queue grows from 1 to 2 | `queue.length === 2` |
| 35 | Reviewer is a different expert from the author | `queue[1] ≠ expertUser1._id` |
| 36 | History has new `in-review` entry for reviewer | `history.length === 2`, `history[1].status === 'in-review'` |
| 37 | `peer_review` notification sent to reviewer | notif found in DB |
| 38 | `currentExpertAllocatedAt` reset, `currentExpertOpenedAt` cleared to `null` | both updated |

---

## Critical constraints

### STF-only for initial time-bound allocation

```ts
for (const expert of allExperts) {
  if (expert?.special_task_force !== true) continue;  // ← STF ONLY
```

If no STF expert has capacity, the question is **skipped indefinitely**. Likely root cause of
WHATSAPP/AJRASAKHA questions not getting allocated in production.

### MAX_TIME_BOUND = 1

Each expert holds at most 1 active time-bound question. "Active" = in queue with no answer yet,
or in queue with `history[n].status === 'in-review'`.

### Reviewer has no STF requirement

`assignTimeBoundReviewer` selects any free expert — not STF-gated.

### Concurrent guard fires synchronously

`isReallocatingTimeBound = true` is set **before** the first `await`, so a second call fired
immediately always sees it as `true`.

### Cron does not run in development

`timeBoundReAllocateCron.ts` is gated by `if (!appConfig.isDevelopment)` — never fires in tests.

### Stuck/idle branches spawn worker threads (mocked in tests)

`startBalanceWorkloadWorkers()` normally targets `build/workers/balanceWorkload.worker.js`
and spawns Node Worker threads for parallel DB writes. In tests, this module is replaced by
a `vi.mock()` that returns `{ processed: 1, failedWorkers: 0 }` immediately, so no Worker
thread is spawned. G13 (stuck) and G14 (idle) verify that `reallocateTimeBoundQuestions()`
correctly **detects** the question, **selects** the replacement expert (STF-gated, capacity-aware),
and **builds** the right `flatAssignments` entry (correct `skipPenalty` flag). The worker's
actual DB queue-swap and penalty writes are not re-exercised here.

---

## Known assumption: preference test (#5)

Asserts `experttest1` is allocated for `state=Punjab, domain=Crop Protection, crop=Brinjal`
(6-point score). Non-deterministic if another expert also scores 6 points — shuffle within tiers.

---

---

## Last Test Run Results

**Pre-fix run (2026-06-15):** 33 passed, 11 failed.  
**Fixes applied (2026-06-16):**
- Added `afterAll` inside G5, G6, G8 to close their seeded questions after each group's tests complete, freeing the STF expert before the next group's cron run.
- Extended `beforeAll` cleanup to also close pre-existing unallocated WHATSAPP/AJRASAKHA questions (not just ones with STF experts already in queue).
- Reordered G9/G10 to appear before G11/G12 in the source file (cosmetic; matches the documented group order).
- Converted `ChemicalCrud.e2e.test.ts` and `QuestionCreate.e2e.test.ts` from the old external-server (`localhost:4000` + Firebase) pattern to the standard in-process harness.
- Fixed group ordering in `PostAllocation.e2e.test.ts` (Group 7 before Group 8).

**Actual result (2026-06-16):** 36 passed, 8 failed. G5–G12 fixes worked as intended.
G1–G3 regressed due to a new bug in `addQuestion` (unrelated to this fix).

| # | Group | Test | Pre-fix (2026-06-15) | Actual (2026-06-16) |
|---|-------|------|----------------------|---------------------|
| 1 | G1 | question is immediately open with `isAutoAllocate=true` | ✅ | ❌ addQuestion returns 400 |
| 2 | G1 | background populates queue with exactly 1 expert | ✅ | ❌ cascade from #1 |
| 3 | G1 | `firstAllocationAt` stamped after background allocation | ✅ | ❌ cascade from #1 |
| 4 | G1 | `answer_creation` notification sent to queue[0] | ❌ service bug | ❌ cascade from #1 (also service bug) |
| 5 | G2 | `queue[0]` is `experttest1` (preference scoring) | ✅ | ❌ addQuestion returns 400 |
| 6-8 | G3 | OUTREACH: queue empty at creation and after wait | ✅ | ❌ addQuestion returns 400 for OUTREACH too |
| 9-11 | G4 | Toggle auto-allocate (3 tests) | ✅ | ✅ |
| 12 | G5 | WHATSAPP time-bound: reports ≥1 allocated | ✅ | ✅ |
| 13-17 | G5 | WHATSAPP time-bound: queue/timestamps/notification (5 tests) | ❌ STF capacity exhausted | ✅ G5 afterAll frees expert |
| 18-21 | G6 | AJRASAKHA time-bound (4 tests) | ❌ STF capacity exhausted | ✅ |
| 22-28 | G7 | Negative cases: questions NOT picked up | ✅ | ✅ |
| 29-30 | G8 | Capacity: busy expert skipped / single-expert skip | ✅ | ✅ |
| 31 | G8 | 2+ STF experts → new question to different free expert | ❌ capacity issue | ✅ G6 afterAll frees expert |
| 32 | G9 | Concurrent guard | ✅ | ✅ |
| 33-38 | G10 | Reviewer assignment path | ✅ | ✅ |
| 39-41 | G11 | Reviewer-stage question not re-processed | ✅ | ✅ |
| 42-44 | G12 | Toggle sequential ON→OFF→ON | ✅ | ✅ |

**G1–G3:** Expected 201 from `POST /api/questions`, got 400 (`"Cannot read properties of undefined (reading 'data')"`) for all sources (AGRI_EXPERT and OUTREACH). Same failure as WhatsApp, Ajrasakha, and QuestionCreate suites. G4–G12 seed questions directly into the DB and are unaffected.

---

## Known Service Bug (not a test bug)

### AGRI_EXPERT `answer_creation` notification not sent (test #4)

Path: `A5 → A6`. `firstAllocationAt` IS stamped (test #3 passes) and queue IS populated (test #2 passes), but the `answer_creation` notification is not created in the DB.

Root cause: `processQuestionInBackground` allocates the expert and stamps timestamps, but the notification write (`NotificationService.addNotification` or similar) is either silently throwing or the notification type/userId lookup is failing. This is a bug in the service, not in the test harness.

---

## How to run

```bash
# From backend/  (~25 s against the real Atlas DB in .env)
pnpm exec vitest run src/e2e/auto-allocation/AutoAllocation.e2e.test.ts
```

---

## Last Run

**Date:** 2026-06-25 &nbsp;|&nbsp; **Result:** ✅ all 55 passed &nbsp;|&nbsp; **Duration:** 15.2 s

> ⚠ Vitest only printed 7 of 55 test lines (passing suites are truncated in the output).

| # | Test | Result | Failure reason |
|---|------|:------:|----------------|
| 1 | Auto allocation — AGRI_EXPERT question: background allocates one expert > question is i... | ✅ | — |
| 2 | Auto allocation — OUTREACH question: queue stays empty at creation > queue remains empt... | ✅ | — |
| 3 | Auto allocation — toggle-auto-allocate endpoint > OFF → ON: toggles flag to true and fi... | ✅ | — |
| 4 | Auto allocation — toggle-auto-allocate endpoint > ON → OFF: toggles flag to false and l... | ✅ | — |
| 5 | Toggle auto-allocate — sequential ON → OFF → ON same question leaves no duplicate exper... | ✅ | — |
| 6 | Toggle auto-allocate — sequential ON → OFF → ON same question leaves no duplicate exper... | ✅ | — |
| 7 | Toggle auto-allocate — sequential ON → OFF → ON same question leaves no duplicate exper... | ✅ | — |
