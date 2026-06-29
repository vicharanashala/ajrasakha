#!/usr/bin/env node
/**
 * Reads src/e2e/last-run.log, extracts per-suite pass/fail results, and:
 *   1. Replaces (or appends) a "## Last Run" section in each .e2e.md
 *   2. Updates the "Suites at a glance" table in README.md
 *   3. Auto-patches [XX ✓]/[XX ✗] markers in the pipeline coverage map
 *   4. Marks resolved bugs in the "Known bugs" section
 *
 * Usage:  node src/e2e/helpers/update-last-run.cjs
 */

const fs = require('fs');
const path = require('path');

const E2E_DIR = path.join(__dirname, '..');
const LOG_FILE = path.join(E2E_DIR, 'last-run.log');

// Map: relative test-file path → relative .md path (both relative to E2E_DIR)
const SUITE_MAP = {
  'ajrasakha/AjrasakhaQuestion.e2e.test.ts':                   'ajrasakha/AjrasakhaQuestion.e2e.md',
  'allocation-ordering/AllocationOrdering.e2e.test.ts':         'allocation-ordering/AllocationOrdering.e2e.md',
  'auto-allocation/AutoAllocation.e2e.test.ts':                 'auto-allocation/AutoAllocation.e2e.md',
  'chemical/ChemicalCrud.e2e.test.ts':                          'chemical/ChemicalCrud.e2e.md',
  'manual-allocation/ManualAllocation.e2e.test.ts':             'manual-allocation/ManualAllocation.e2e.md',
  'post-allocation/PostAllocation.e2e.test.ts':                 'post-allocation/PostAllocation.e2e.md',
  'question/QuestionCreate.e2e.test.ts':                        'question/QuestionCreate.e2e.md',
  'reviewer-queue/ReviewerQueue.e2e.test.ts':                   'reviewer-queue/ReviewerQueue.e2e.md',
  'whatsapp/WhatsAppQuestion.e2e.test.ts':                      'whatsapp/WhatsAppQuestion.e2e.md',
};

// Display order and descriptions for the README "Suites at a glance" table
const SUITE_META = [
  { key: 'chemical/ChemicalCrud.e2e.test.ts',              name: 'Chemical CRUD',        covers: 'Auth smoke tests, admin + moderator CRUD, role guards (expert blocked)' },
  { key: 'question/QuestionCreate.e2e.test.ts',            name: 'Question CRUD',        covers: 'Moderator create / get / update / delete / bulk-delete (OUTREACH source)' },
  { key: 'reviewer-queue/ReviewerQueue.e2e.test.ts',       name: 'Reviewer queue',       covers: '`POST /allocated` visibility: author slot, reviewer slot, exclusions, `review_level_number`' },
  { key: 'whatsapp/WhatsAppQuestion.e2e.test.ts',          name: 'WhatsApp ingestion',   covers: 'Full ingestion pipeline: auth, GDB duplicate paths, LLM filter, thread validation + retry' },
  { key: 'ajrasakha/AjrasakhaQuestion.e2e.test.ts',        name: 'AjraSakha ingestion',  covers: 'AJRASAKHA-specific fields (userId from `@CurrentUser`, notification type), representative pipeline cases' },
  { key: 'manual-allocation/ManualAllocation.e2e.test.ts', name: 'Manual allocation',    covers: '`POST /allocate-experts` + `DELETE /allocation` on an OUTREACH question' },
  { key: 'auto-allocation/AutoAllocation.e2e.test.ts',             name: 'Auto allocation',      covers: 'AGRI_EXPERT background queue, preference scoring, toggle, time-bound allocation (WHATSAPP/AJRASAKHA), capacity, reviewer, concurrent guard' },
  { key: 'allocation-ordering/AllocationOrdering.e2e.test.ts',     name: 'Allocation ordering',  covers: 'Chronological ordering + history exclusion for `reallocateTimeBoundQuestions()` (Issues #3, #5)' },
  { key: 'post-allocation/PostAllocation.e2e.test.ts',             name: 'Post-allocation',      covers: 'Full expert peer-review → moderator-approval state machine' },
];

// ─── pipeline-map auto-patch ─────────────────────────────────────────────────

// Suite code used in pipeline-map markers like [WA ✓] / [QC ✗]
const SUITE_CODES = {
  'chemical/ChemicalCrud.e2e.test.ts':              'CH',
  'question/QuestionCreate.e2e.test.ts':            'QC',
  'reviewer-queue/ReviewerQueue.e2e.test.ts':       'RQ',
  'whatsapp/WhatsAppQuestion.e2e.test.ts':          'WA',
  'ajrasakha/AjrasakhaQuestion.e2e.test.ts':        'AJ',
  'manual-allocation/ManualAllocation.e2e.test.ts': 'MA',
  'auto-allocation/AutoAllocation.e2e.test.ts':                 'AA',
  'allocation-ordering/AllocationOrdering.e2e.test.ts':         'AO',
  'post-allocation/PostAllocation.e2e.test.ts':                 'PA',
};

// Each entry links a vitest test-name substring to a pipeline-map line.
//   suite       — key in SUITE_CODES / parsed suites object
//   test        — substring of the vitest test name (only consulted when suite has failures;
//                 vitest prints all tests when a suite fails, so substring lookup is reliable)
//   lineAnchor  — unique text fragment that identifies the pipeline-map line to update
//   bugOnFail   — BUG-NNN annotation appended to [XX ✗] when the test fails (null = none)
//   failNote    — short description appended after bugOnFail on failure
const PIPELINE_TESTS = [
  // ── Chemical CRUD ─────────────────────────────────────────────────────────
  { suite: 'chemical/ChemicalCrud.e2e.test.ts', test: 'returns 401 when internal API key is missing',  lineAnchor: 'GET /chemicals: missing internal-api-key → 401' },
  { suite: 'chemical/ChemicalCrud.e2e.test.ts', test: 'returns 401 when internal API key is invalid',  lineAnchor: 'GET /chemicals: invalid internal-api-key → 401' },
  { suite: 'chemical/ChemicalCrud.e2e.test.ts', test: 'returns 200 when auth is valid',               lineAnchor: 'GET /chemicals: valid auth → 200' },
  { suite: 'chemical/ChemicalCrud.e2e.test.ts', test: 'admin creates a chemical',                     lineAnchor: 'admin create / get / update / delete' },
  { suite: 'chemical/ChemicalCrud.e2e.test.ts', test: 'admin gets 404 for deleted chemical',          lineAnchor: 'admin 404 after delete' },
  { suite: 'chemical/ChemicalCrud.e2e.test.ts', test: 'expert cannot create chemical',                lineAnchor: 'expert cannot create/update/delete → 403' },
  { suite: 'chemical/ChemicalCrud.e2e.test.ts', test: 'moderator creates chemical',                   lineAnchor: 'moderator create / delete → 200' },
  { suite: 'chemical/ChemicalCrud.e2e.test.ts', test: 'moderator can update chemical',                lineAnchor: 'moderator update → 200' },

  // ── Question CRUD ──────────────────────────────────────────────────────────
  { suite: 'question/QuestionCreate.e2e.test.ts', test: 'moderator creates question successfully',      lineAnchor: 'moderator creates question → 201' },
  { suite: 'question/QuestionCreate.e2e.test.ts', test: 'moderator gets created question by id',       lineAnchor: 'moderator gets question by id → 200' },
  { suite: 'question/QuestionCreate.e2e.test.ts', test: 'moderator updates question successfully',     lineAnchor: 'moderator updates question → 200' },
  { suite: 'question/QuestionCreate.e2e.test.ts', test: 'question reflects updated values',            lineAnchor: 'question reflects updated values → 200' },
  { suite: 'question/QuestionCreate.e2e.test.ts', test: 'moderator deletes question successfully',     lineAnchor: 'moderator deletes question → 200' },
  { suite: 'question/QuestionCreate.e2e.test.ts', test: 'deleted question is no longer retrievable',  lineAnchor: 'deleted question not retrievable → 404' },
  { suite: 'question/QuestionCreate.e2e.test.ts', test: 'moderator bulk deletes questions',            lineAnchor: 'moderator bulk deletes questions → 200' },
  { suite: 'question/QuestionCreate.e2e.test.ts', test: 'bulk deleted questions are not retrievable', lineAnchor: 'bulk-deleted questions not retrievable → 404', bugOnFail: 'BUG-011', failNote: 'timeout 5000ms' },

  // ── Reviewer queue ─────────────────────────────────────────────────────────
  { suite: 'reviewer-queue/ReviewerQueue.e2e.test.ts', test: 'question appears in POST /allocated for the allocated expert',    lineAnchor: 'author (queue[0]) sees question in allocated' },
  { suite: 'reviewer-queue/ReviewerQueue.e2e.test.ts', test: 'review_level_number is "Author" for the authoring slot',          lineAnchor: 'review_level_number = "Author" for author slot' },
  { suite: 'reviewer-queue/ReviewerQueue.e2e.test.ts', test: 'answer_creation notification entity_id matches',                  lineAnchor: 'answer_creation notification matches allocated' },
  { suite: 'reviewer-queue/ReviewerQueue.e2e.test.ts', test: 'a closed question with the same expert in queue is NOT returned', lineAnchor: 'closed question NOT in allocated' },
  { suite: 'reviewer-queue/ReviewerQueue.e2e.test.ts', test: 'reviewer (expertUser2) sees the question in POST /allocated',     lineAnchor: 'reviewer (queue[1]) sees question in allocated' },
  { suite: 'reviewer-queue/ReviewerQueue.e2e.test.ts', test: 'review_level_number is 1 for the reviewer slot',                  lineAnchor: 'review_level_number = "Level 1" for reviewer' },
  { suite: 'reviewer-queue/ReviewerQueue.e2e.test.ts', test: 'completed author (expertUser1) does NOT see the question',        lineAnchor: 'completed author no longer sees question' },
  { suite: 'reviewer-queue/ReviewerQueue.e2e.test.ts', test: 'question with status="in-review"',                                lineAnchor: 'in-review question NOT in allocated for experts' },
  { suite: 'reviewer-queue/ReviewerQueue.e2e.test.ts', test: 'expert NOT in queue cannot see the question',                     lineAnchor: 'expert NOT in queue cannot see question' },

  // ── WhatsApp ingestion ─────────────────────────────────────────────────────
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'rejects ingestion without the internal API key',                                   lineAnchor: 'auth failures' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'rejects ingestion with a wrong internal API key',                                  lineAnchor: 'auth failures' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'rejects with 400 when a required detail field',                                    lineAnchor: 'invalid payload (missing field → 400)' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'rejects when the question text is empty',                                          lineAnchor: 'invalid payload (empty text → 500)' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'flags the question isTesting=true and drops it before the duplicate pipeline',     lineAnchor: 'thread: empty → isTesting' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'flags the question isTesting after exhausting',                                    lineAnchor: 'thread: not found after retries → isTesting' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'proceeds to open (not isTesting) when the thread API throws non-not-found',       lineAnchor: 'thread: API down → open' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'proceeds to open when the thread API fails on first attempt but succeeds',        lineAnchor: 'thread: transient fail → retry → open' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'marks the question as duplicate and records the reference question',              lineAnchor: 'GDB exact_match → duplicate' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'marks the question as duplicate with isExact=false',                              lineAnchor: 'GDB selected_match → duplicate' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'marks duplicate with isExact=true and references the exact_match',                lineAnchor: 'GDB both → exact wins' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'ignores the invalid exact_match and reaches open via LLM',                        lineAnchor: 'GDB invalid ObjectId → LLM fallthrough' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'marks the question as duplicate when exact_match.question_id is in {$oid}',       lineAnchor: 'GDB $oid format → duplicate' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'still opens the question when searchGdb throws',                                  lineAnchor: 'GDB throws → open' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'marks the question as non_agri when the LLM classifies it as non-agri',           lineAnchor: 'LLM non-agri → non_agri' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'opens the question and creates an unallocated submission',                        lineAnchor: 'LLM agri → open', bugOnFail: 'BUG-012', failNote: 'unexpected submission record' },
  { suite: 'whatsapp/WhatsAppQuestion.e2e.test.ts', test: 'still opens the question when the non-agri classifier throws',                    lineAnchor: 'LLM throws → open (degrade)' },

  // ── AjraSakha ingestion ────────────────────────────────────────────────────
  { suite: 'ajrasakha/AjrasakhaQuestion.e2e.test.ts', test: 'rejects ingestion when no auth header is provided',                            lineAnchor: 'auth failures' },
  { suite: 'ajrasakha/AjrasakhaQuestion.e2e.test.ts', test: 'rejects ingestion when an incorrect internal API key is provided',             lineAnchor: 'auth failures' },
  { suite: 'ajrasakha/AjrasakhaQuestion.e2e.test.ts', test: 'rejects with 400 when a required detail field',                                lineAnchor: 'invalid payload (missing field → 400)' },
  { suite: 'ajrasakha/AjrasakhaQuestion.e2e.test.ts', test: 'rejects when the question text is empty',                                      lineAnchor: 'invalid payload (empty text → 500)' },
  { suite: 'ajrasakha/AjrasakhaQuestion.e2e.test.ts', test: 'flags the question isTesting=true when threadId is empty',                     lineAnchor: 'thread: empty → isTesting' },
  { suite: 'ajrasakha/AjrasakhaQuestion.e2e.test.ts', test: 'marks the question as duplicate and records the reference',                    lineAnchor: 'GDB exact_match → duplicate' },
  { suite: 'ajrasakha/AjrasakhaQuestion.e2e.test.ts', test: 'marks the question as non_agri when the LLM classifies it as non-agri',       lineAnchor: 'LLM non-agri → non_agri' },
  { suite: 'ajrasakha/AjrasakhaQuestion.e2e.test.ts', test: 'creates an open question attributed to the authenticated user',               lineAnchor: 'LLM agri → open' },
  { suite: 'ajrasakha/AjrasakhaQuestion.e2e.test.ts', test: 'still opens the question when the non-agri classifier throws',                 lineAnchor: 'LLM throws → open (degrade)' },

  // ── Auto-allocation (AGRI_EXPERT background queue) ─────────────────────────
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'background process populates submission queue with exactly 1 expert',       lineAnchor: 'background fills queue (1 expert)' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'queue[0] is experttest1 (highest-scoring',                                  lineAnchor: 'preference scoring selects best expert' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'question has firstAllocationAt stamped after background allocation',        lineAnchor: 'firstAllocationAt stamped' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'answer_creation notification is sent to queue[0] expert',                   lineAnchor: 'answer_creation notification' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'submission queue is empty immediately after creation',                      lineAnchor: 'OUTREACH: queue empty at creation' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'queue remains empty after a brief wait',                                    lineAnchor: 'OUTREACH: queue stays empty after wait' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'OFF → ON: toggles flag to true and fills queue',                           lineAnchor: 'toggle OFF→ON fills queue' },

  // ── Auto-allocation (time-bound: WHATSAPP / AJRASAKHA) ────────────────────
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'reports at least 1 question initially allocated',                           lineAnchor: 'WHATSAPP question allocated to STF expert' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'AJRASAKHA question reports at least 1 initially allocated',                 lineAnchor: 'AJRASAKHA question allocated to STF expert' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'question has firstAllocationAt stamped',                                    lineAnchor: 'firstAllocationAt + currentExpertAllocatedAt set' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'answer_creation notification sent to the allocated expert',                 lineAnchor: 'answer_creation notification (source-specific)' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'allocated expert has special_task_force=true',                              lineAnchor: 'STF-only requirement enforced' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'if only 1 STF expert exists (now busy), new question is skipped',           lineAnchor: 'MAX_TIME_BOUND=1 capacity respected' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'busy STF expert is NOT assigned to the new question',                       lineAnchor: 'busy expert skipped for new question' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'second concurrent call returns early',                                      lineAnchor: 'concurrent guard (isReallocatingTimeBound)' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'submission queue grows from 1 to 2 experts',                                lineAnchor: 'reviewer assigned when author answered' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'peer_review notification sent to the reviewer',                             lineAnchor: 'peer_review notification sent to reviewer' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'currentExpertAllocatedAt is reset and currentExpertOpenedAt is cleared',    lineAnchor: 'currentExpertAllocatedAt reset for reviewer' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: "queue[1] is still the original reviewer",                                   lineAnchor: 'reviewer-stage question not re-processed by cron' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'second ON: no duplicate experts in queue',                                  lineAnchor: 'toggle sequential ON→OFF→ON, no duplicates' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'isAutoAllocate=false WHATSAPP question is NOT allocated',                   lineAnchor: 'isAutoAllocate=false → skipped' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'isOnHold=true WHATSAPP question is NOT allocated',                          lineAnchor: 'isOnHold=true → skipped' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'closed WHATSAPP question is NOT allocated',                                 lineAnchor: 'closed/non_agri status → skipped' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'OUTREACH source is NOT picked up by time-bound cron',                       lineAnchor: 'OUTREACH source → skipped' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'AGRI_EXPERT source is NOT picked up by time-bound cron',                    lineAnchor: 'AGRI_EXPERT source → skipped' },
  { suite: 'auto-allocation/AutoAllocation.e2e.test.ts', test: 'already-allocated WHATSAPP question (non-empty queue) is NOT re-allocated', lineAnchor: 'already-allocated question → not re-allocated' },

  // ── Allocation ordering ───────────────────────────────────────────────────
  { suite: 'allocation-ordering/AllocationOrdering.e2e.test.ts', test: 'cron reports at least 1 question allocated',                                    lineAnchor: 'older question (earlier createdAt) allocated first when STF capacity=1' },
  { suite: 'allocation-ordering/AllocationOrdering.e2e.test.ts', test: 'older question (earlier createdAt) has a non-empty queue',                      lineAnchor: 'older question (earlier createdAt) allocated first when STF capacity=1' },
  { suite: 'allocation-ordering/AllocationOrdering.e2e.test.ts', test: 'newer question is skipped — queue stays empty when only stfExperts[0] is free', lineAnchor: 'newer question skipped when only 1 STF expert is free' },
  { suite: 'allocation-ordering/AllocationOrdering.e2e.test.ts', test: 'the expert in the older question has special_task_force=true',                  lineAnchor: 'allocated expert for older question has special_task_force=true' },
  { suite: 'allocation-ordering/AllocationOrdering.e2e.test.ts', test: 'cron detects the stuck reviewer and reports at least 1 reallocated',            lineAnchor: 'expert in history NOT selected as stuck-replacement' },
  { suite: 'allocation-ordering/AllocationOrdering.e2e.test.ts', test: 'startBalanceWorkloadWorkers was called for the stuck submission',               lineAnchor: 'expert in history NOT selected as stuck-replacement' },
  { suite: 'allocation-ordering/AllocationOrdering.e2e.test.ts', test: 'replacement expert is NOT stfExperts[0] — the previous author from history',   lineAnchor: 'expert in history NOT selected as stuck-replacement' },
  { suite: 'allocation-ordering/AllocationOrdering.e2e.test.ts', test: 'replacement expert is NOT stfExperts[1] — the stuck reviewer being replaced',   lineAnchor: 'stuck expert NOT selected as their own replacement' },

  // ── Manual allocation ─────────────────────────────────────────────────────
  { suite: 'manual-allocation/ManualAllocation.e2e.test.ts', test: 'returns 401 when no user is logged in (allocate-experts)',        lineAnchor: 'auth (no user → 401, expert → 400)' },
  { suite: 'manual-allocation/ManualAllocation.e2e.test.ts', test: 'returns 400 when an expert tries to allocate',                   lineAnchor: 'auth (no user → 401, expert → 400)' },
  { suite: 'manual-allocation/ManualAllocation.e2e.test.ts', test: 'moderator allocates expert1 → 200',                              lineAnchor: 'allocate expert1 → 200, queue=[e1]' },
  { suite: 'manual-allocation/ManualAllocation.e2e.test.ts', test: 'DB: submission queue contains expert1',                          lineAnchor: 'allocate expert1 → 200, queue=[e1]' },
  { suite: 'manual-allocation/ManualAllocation.e2e.test.ts', test: 'DB: question has firstAllocationAt set',                         lineAnchor: 'firstAllocationAt set' },
  { suite: 'manual-allocation/ManualAllocation.e2e.test.ts', test: 'moderator allocates expert2 to same question',                   lineAnchor: 'allocate expert2 → queue=[e1,e2]' },
  { suite: 'manual-allocation/ManualAllocation.e2e.test.ts', test: 'duplicate expert check',                                         lineAnchor: 'duplicate guard → 200 (BUG-002 documented)' },
  { suite: 'manual-allocation/ManualAllocation.e2e.test.ts', test: 'non-existent questionId returns 500',                            lineAnchor: 'non-existent questionId → 500 (known)' },
  { suite: 'manual-allocation/ManualAllocation.e2e.test.ts', test: 'moderator removes expert at index 0',                            lineAnchor: 'remove expert by index → queue shrinks' },
  { suite: 'manual-allocation/ManualAllocation.e2e.test.ts', test: 'DB: queue shrinks to 1',                                        lineAnchor: 'remove expert by index → queue shrinks' },

  // ── Post-allocation ────────────────────────────────────────────────────────
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: '401 when no user is logged in',                                      lineAnchor: 'auth + role guards (401, 500 known)' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'moderator cannot author/review an answer',                           lineAnchor: 'auth + role guards (401, 500 known)' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'expert NOT at queue[0] cannot submit the first answer',              lineAnchor: 'auth + role guards (401, 500 known)' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'e1 (queue[0]) submits the first answer',                            lineAnchor: 'author (e1) submits first answer' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'e1 cannot submit a second answer',                                   lineAnchor: 'e1 cannot submit twice → 500 (known)' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'e2 accepts → approvalCount 1',                                      lineAnchor: 'e2 / e3 / e4 accept → approvalCount increments' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'e3 accepts → approvalCount 2',                                      lineAnchor: 'e2 / e3 / e4 accept → approvalCount increments' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'e4 accepts → 3 approvals',                                          lineAnchor: '3 acceptances → question in-review' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'expert cannot do the final approval',                               lineAnchor: 'expert cannot do final approval → 400' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'moderator approves → question closed',                              lineAnchor: 'moderator approves → question closed' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'cannot add an answer to an already-closed question',                lineAnchor: 'answer to closed question → 500 (known)' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'rejecting with an identical answer is blocked',                     lineAnchor: 'reject identical answer → 500 (known)' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'e2 rejects with a new answer',                                      lineAnchor: 'reviewer rejects with new answer → penalise' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'author (e1) was notified that the review was rejected',             lineAnchor: 'author notified of rejection' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'modifying with an identical answer is blocked',                     lineAnchor: 'modify identical answer → 500 (known)' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'e2 modifies → answer text updated in place',                        lineAnchor: 'reviewer modifies → text updated, count reset' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'author (e1) was notified that the answer was modified',             lineAnchor: 'author notified of modification' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'approve when question is still "open"',                             lineAnchor: 'approve when question still open → 400' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'approve when question has no normalised_crop',                      lineAnchor: 'approve with no normalised_crop → 400' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'moderator/approve (LLM) rejects a non AJRASAKHA/WHATSAPP',         lineAnchor: 'LLM approve non-AJRASAKHA/WA source → 400' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'moderator can edit an already-finalised answer on a closed question', lineAnchor: 'edit finalised answer on closed question → 200' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'pae_expert submits → question becomes pae_submitted',              lineAnchor: 'PAE expert → pae_submitted (peer cycle skipped)' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'moderator approves a pae_submitted question',                       lineAnchor: 'moderator approves pae_submitted → closed' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'deleting a non-final answer removes it',                            lineAnchor: 'delete non-final answer → removed' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'after 1 acceptance (approvalCount=1)',                              lineAnchor: 'approvalCount=1/2 does NOT escalate to moderator' },
  { suite: 'post-allocation/PostAllocation.e2e.test.ts', test: 'after 2 acceptances (approvalCount=2)',                             lineAnchor: 'approvalCount=1/2 does NOT escalate to moderator' },
];

// Returns true if the test passed, false if failed, null if the suite has no log data.
// When a suite has 0 failures vitest truncates individual test lines, so we infer all pass.
// When a suite has failures vitest prints every test — substring lookup is reliable.
function resolveTestPass(suites, suiteKey, testSubstring) {
  const data = suites[suiteKey];
  if (!data) return null;
  if (data.failed === 0) return true;
  const match = data.tests.find(t => t.name.includes(testSubstring));
  return match ? match.pass : true; // not found in failing-suite output → treat as pass
}

// Updates a single [CODE ✓/✗] marker on a line, leaving adjacent markers intact.
// Annotations after the marker are preserved unless they were script-generated (BUG-NNN: note
// on a ✗ line). Manually written annotations like "BUG-001 documented" or "(known)" are kept.
function updateMarkerInLine(line, code, pass, bugOnFail, failNote) {
  const re = new RegExp(`\\[${code} ([✓✗])\\]([^\\[\\n]*)`, 'u');
  const m = re.exec(line);
  if (!m) return line;
  const oldIcon       = m[1];
  const oldAnnotation = m[2]; // text between this ] and the next [ (or end of line)

  // Script-generated fail annotations follow " BUG-NNN" or " BUG-NNN: note" and
  // don't contain "documented". Manual notes ("BUG-001 documented", "(known)") are kept.
  const isScriptBug = /^ BUG-\d+/.test(oldAnnotation) && !oldAnnotation.includes('documented');

  let newMarker;
  let annotation;
  if (pass) {
    newMarker  = `[${code} ✓]`;
    annotation = (oldIcon === '✗' && isScriptBug) ? '' : oldAnnotation;
  } else {
    newMarker  = `[${code} ✗]`;
    annotation = bugOnFail
      ? ` ${bugOnFail}${failNote ? `: ${failNote}` : ''}`
      : oldAnnotation;
  }

  const remaining = line.slice(m.index + m[0].length);
  const sep = remaining.startsWith('[') ? ' ' : '';
  return line.slice(0, m.index) + newMarker + annotation.trimEnd() + sep + remaining;
}

const PIPELINE_DIAGRAM_HEADING = '## Diagram: full pipeline coverage map';

// Patches [XX ✓]/[XX ✗] markers in the pipeline coverage map code block.
// Returns updated README content.
function applyPipelineMapPatch(content, suites) {
  // Build result map: `CODE::lineAnchor` → { pass, bugOnFail, failNote }
  // A line is ✗ if ANY mapped test for that (code, lineAnchor) pair fails.
  const results = {};
  for (const { suite, test, lineAnchor, bugOnFail = null, failNote = null } of PIPELINE_TESTS) {
    const code = SUITE_CODES[suite];
    if (!code) continue;
    const pass = resolveTestPass(suites, suite, test);
    if (pass === null) continue; // no log data — leave existing marker
    const key = `${code}::${lineAnchor}`;
    if (results[key] === undefined || (!results[key].decided && !pass)) {
      results[key] = { pass, bugOnFail, failNote, decided: !pass };
    }
  }

  const start = content.indexOf(PIPELINE_DIAGRAM_HEADING);
  if (start === -1) {
    console.warn('  ⚠  pipeline diagram section not found in README.md');
    return content;
  }
  const codeOpen  = content.indexOf('```', start);
  const codeClose = content.indexOf('```', codeOpen + 3);
  if (codeOpen === -1 || codeClose === -1) {
    console.warn('  ⚠  pipeline code block not found in README.md');
    return content;
  }

  const lines = content.slice(codeOpen + 3, codeClose).split('\n');
  let patchCount = 0;

  for (const [key, result] of Object.entries(results)) {
    const colonIdx = key.indexOf('::');
    const code       = key.slice(0, colonIdx);
    const lineAnchor = key.slice(colonIdx + 2);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(lineAnchor)) {
        const updated = updateMarkerInLine(lines[i], code, result.pass, result.bugOnFail, result.failNote);
        if (updated !== lines[i]) { lines[i] = updated; patchCount++; }
        break;
      }
    }
  }

  console.log(`  ✓  README.md pipeline map (${patchCount} marker(s) updated)`);
  return content.slice(0, codeOpen + 3) + lines.join('\n') + content.slice(codeClose);
}

// Bugs whose tests pass by accepting wrong behavior (no reliable pipeline-map signal).
// Never auto-mark these as fixed — they require a human to decide.
const BUG_EXEMPT = new Set(['BUG-003', 'BUG-004']);

// Marks bugs in "## Known bugs" as fixed when they no longer appear
// in any [XX ✗] marker AND are not mentioned anywhere in the pipeline map
// (bugs mentioned on ✓ lines are documented behaviors, not regressions).
function applyKnownBugsPatch(content, date) {
  // Collect BUG-NNN appearing in active failure markers
  const activeBugs = new Set();
  for (const m of content.matchAll(/\[[A-Z]+ ✗\] (BUG-\d+)/gu)) activeBugs.add(m[1]);

  // Collect BUG-NNN mentioned anywhere inside the pipeline code block
  const diagStart  = content.indexOf(PIPELINE_DIAGRAM_HEADING);
  const codeOpen   = diagStart !== -1 ? content.indexOf('```', diagStart) : -1;
  const codeClose  = codeOpen  !== -1 ? content.indexOf('```', codeOpen + 3) : -1;
  const mapBlock   = codeOpen !== -1 ? content.slice(codeOpen, codeClose) : '';
  const mentionedInMap = new Set();
  for (const m of mapBlock.matchAll(/BUG-\d+/g)) mentionedInMap.add(m[0]);

  const knownStart = content.indexOf('## Known bugs');
  const diagHeadStart = content.indexOf('## Diagram:', knownStart !== -1 ? knownStart : 0);
  if (knownStart === -1) return content;

  const before   = content.slice(0, knownStart);
  const section  = content.slice(knownStart, diagHeadStart !== -1 ? diagHeadStart : undefined);
  const after    = diagHeadStart !== -1 ? content.slice(diagHeadStart) : '';

  let patched    = section;
  let fixedCount = 0;

  // Match bug headings that haven't already been struck through
  for (const m of section.matchAll(/^(### )((?!~~)(BUG-\d+)[^\n]+)/gmu)) {
    const bugNum = m[3];
    if (!activeBugs.has(bugNum) && !mentionedInMap.has(bugNum) && !BUG_EXEMPT.has(bugNum)) {
      patched = patched.replace(m[0], `${m[1]}~~${m[2]}~~ *(fixed ${date})*`);
      fixedCount++;
    }
  }

  if (fixedCount > 0) {
    console.log(`  ✓  README.md known bugs (${fixedCount} marked fixed)`);
    return before + patched + after;
  }
  return content;
}

// ─── regex ────────────────────────────────────────────────────────────────────

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// Suite result-block headers
// " ❯ src/e2e/ajrasakha/AjrasakhaQuestion.e2e.test.ts (9 tests | 5 failed) 20151ms"
const SUITE_FAIL_RE = /^ ❯ src\/e2e\/(\S+) \((\d+) tests?(?: \| (\d+) failed)?\) (\d+)ms$/;
// " ✓ src/e2e/chemical/ChemicalCrud.e2e.test.ts (15 tests) 7776ms"
const SUITE_PASS_RE = /^ ✓ src\/e2e\/(\S+) \((\d+) tests?\) (\d+)ms$/;

// Individual test lines inside a result block
//   "   ✓ Some test name  316ms"
const TEST_PASS_RE = /^   ✓ (.+?) {1,3}(\d+)ms$/;
//   "   × Some failing test 841ms"
const TEST_FAIL_RE = /^   × (.+?) (\d+)ms$/;
//   "     → expected 400 to be 201"
const REASON_RE    = /^     → (.+)$/;

// ─── parse ────────────────────────────────────────────────────────────────────

function parseLog(raw) {
  const lines = stripAnsi(raw).split('\n');
  const suites = {}; // key: relative test path

  let current = null; // current suite entry

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Suite with failures
    let m = SUITE_FAIL_RE.exec(line);
    if (m) {
      current = {
        total:    parseInt(m[2], 10),
        failed:   m[3] ? parseInt(m[3], 10) : 0,
        duration: parseInt(m[4], 10),
        tests:    [],
      };
      suites[m[1]] = current;
      continue;
    }

    // Suite all-passing
    m = SUITE_PASS_RE.exec(line);
    if (m) {
      current = {
        total:    parseInt(m[2], 10),
        failed:   0,
        duration: parseInt(m[3], 10),
        tests:    [],
      };
      suites[m[1]] = current;
      continue;
    }

    if (!current) continue;

    // Passing test
    m = TEST_PASS_RE.exec(line);
    if (m) {
      current.tests.push({ name: m[1].trim(), pass: true, ms: parseInt(m[2], 10), reason: null });
      continue;
    }

    // Failing test — peek at the next line for the inline reason
    m = TEST_FAIL_RE.exec(line);
    if (m) {
      const entry = { name: m[1].trim(), pass: false, ms: parseInt(m[2], 10), reason: null };
      if (i + 1 < lines.length) {
        const nr = REASON_RE.exec(lines[i + 1]);
        if (nr) { entry.reason = nr[1].trim(); i++; }
      }
      current.tests.push(entry);
    }
    // Lines that match neither pattern (stdout, blank, etc.) are silently skipped
  }

  return suites;
}

// ─── format ───────────────────────────────────────────────────────────────────

function fmtDuration(ms) {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)} min`;
  if (ms >= 1000)  return `${(ms / 1000).toFixed(1)} s`;
  return `${ms} ms`;
}

function buildSection(data, date) {
  const { total, failed, duration, tests } = data;
  const passed = total - failed;

  const badge   = failed > 0 ? '❌' : '✅';
  const summary = failed > 0
    ? `${badge} ${failed} failed / ${passed} passed`
    : `${badge} all ${total} passed`;

  const note = tests.length < total
    ? `\n> ⚠ Vitest only printed ${tests.length} of ${total} test lines (passing suites are truncated in the output).\n`
    : '';

  const rows = tests.map((t, i) => {
    const icon   = t.pass ? '✅' : '❌';
    // Truncate very long test names so the table stays readable
    const name   = t.name.length > 90 ? `${t.name.slice(0, 87)}...` : t.name;
    const reason = t.reason ? t.reason.replace(/\|/g, '\\|') : '—';
    return `| ${i + 1} | ${name} | ${icon} | ${reason} |`;
  });

  return [
    `## Last Run`,
    ``,
    `**Date:** ${date} &nbsp;|&nbsp; **Result:** ${summary} &nbsp;|&nbsp; **Duration:** ${fmtDuration(duration)}`,
    note,
    `| # | Test | Result | Failure reason |`,
    `|---|------|:------:|----------------|`,
    ...rows,
  ].join('\n');
}

// ─── README patches ───────────────────────────────────────────────────────────

const README_SUITES_HEADING = '## Suites at a glance';

function buildReadmeTable(suites, date) {
  let totalTests  = 0;
  let totalPassed = 0;

  const rows = SUITE_META.map(({ key, name, covers }) => {
    const mdRel = SUITE_MAP[key];
    const data  = suites[key];
    if (!data) return `| ${name} | \`${mdRel.replace(/\.md$/, '.test.ts')}\` | — | — | ${covers} |`;

    const passed = data.total - data.failed;
    const badge  = data.failed === 0 ? `✅ ${data.total}/${data.total}` : `❌ ${passed}/${data.total}`;
    totalTests  += data.total;
    totalPassed += passed;
    return `| ${name} | \`${mdRel.replace(/\.md$/, '.test.ts')}\` | ${data.total} | ${badge} | ${covers} |`;
  });

  rows.push(`| **Total** | | **${totalTests}** | **${totalPassed}/${totalTests}** | |`);

  return [
    README_SUITES_HEADING,
    '',
    `| Suite | File | Tests | Last run (${date}) | What it covers |`,
    `|-------|------|------:|----------------------|----------------|`,
    ...rows,
  ].join('\n');
}

function patchReadme(suites, date) {
  const readmePath = path.join(E2E_DIR, 'README.md');
  if (!fs.existsSync(readmePath)) {
    console.warn('  ⚠  README.md not found');
    return;
  }

  let content = fs.readFileSync(readmePath, 'utf8');

  // 1. "Suites at a glance" table
  const start = content.indexOf(README_SUITES_HEADING);
  if (start === -1) {
    console.warn(`  ⚠  README.md: "${README_SUITES_HEADING}" not found`);
  } else {
    const boundary = content.indexOf('\n---', start);
    if (boundary === -1) {
      console.warn('  ⚠  README.md: closing --- not found after Suites table');
    } else {
      content = content.slice(0, start) + buildReadmeTable(suites, date) + '\n' + content.slice(boundary);
      console.log('  ✓  README.md (Suites at a glance)');
    }
  }

  // 2. Pipeline coverage map markers
  content = applyPipelineMapPatch(content, suites);

  // 3. Known bugs — mark resolved entries
  content = applyKnownBugsPatch(content, date);

  fs.writeFileSync(readmePath, content, 'utf8');
}

// ─── patch md ─────────────────────────────────────────────────────────────────

const SECTION_HEADING = '## Last Run';

function patchMd(mdPath, section) {
  if (!fs.existsSync(mdPath)) {
    console.warn(`  ⚠  not found: ${mdPath}`);
    return;
  }

  let content = fs.readFileSync(mdPath, 'utf8');
  const idx   = content.indexOf(SECTION_HEADING);

  if (idx !== -1) {
    // Replace everything from the heading to the end of the file
    content = content.slice(0, idx).trimEnd() + '\n\n' + section + '\n';
  } else {
    // Append after a horizontal rule
    content = content.trimEnd() + '\n\n---\n\n' + section + '\n';
  }

  fs.writeFileSync(mdPath, content, 'utf8');
  console.log(`  ✓  ${path.relative(E2E_DIR, mdPath)}`);
}

// ─── main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error(`Error: ${LOG_FILE} not found`);
    process.exit(1);
  }

  const raw    = fs.readFileSync(LOG_FILE, 'utf8');
  const suites = parseLog(raw);
  const date   = new Date().toISOString().slice(0, 10);

  console.log(`Parsed ${Object.keys(suites).length} suite(s) from last-run.log\n`);

  for (const [testPath, mdRel] of Object.entries(SUITE_MAP)) {
    const data = suites[testPath];
    if (!data) {
      console.warn(`  ⚠  no log data for: ${testPath}`);
      continue;
    }

    const label = data.failed > 0
      ? `${data.failed}/${data.total} failed`
      : `all ${data.total} passed`;
    process.stdout.write(`${testPath}  (${label})  → `);

    const section = buildSection(data, date);
    patchMd(path.join(E2E_DIR, mdRel), section);
  }

  console.log('\nUpdating README.md…');
  patchReadme(suites, date);

  console.log('\nDone.');
}

main();
