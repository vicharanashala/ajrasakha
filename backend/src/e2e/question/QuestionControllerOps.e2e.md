# Question Controller — Internal Ops/Background Routes — E2E Test Documentation

**File:** `src/e2e/question/QuestionControllerOps.e2e.test.ts`

---

## What this covers

The internal data-repair/ops routes deliberately excluded from
`QuestionControllerGaps.e2e.test.ts` — not because they're unsafe to test,
but because they're not real client-facing API surface. Added specifically
to close the gap between route-level coverage (which a test hitting any of
these would satisfy) and real *code* coverage — `QuestionMaintenanceService`
and `AllocationService` still had low branch coverage even after the main
gap suite existed, because these routes' internal branches were never
actually exercised.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/questions/queue-details?section=&page=` | Paginated single-section queue variant |
| `POST` | `/api/questions/reAllocateLessWorkload` | Real logged-in-user path (not just the no-auth crash) |
| `POST` | `/api/questions/background/process` | Clears a user's `assignedQuestionIds` |
| `POST` | `/api/questions/background/remove-history-entry` | |
| `POST` | `/api/questions/background/remove-queue-entry` | |
| `POST` | `/api/questions/background/add-queue-entry` | |
| `POST` | `/api/questions/background/add-history-entry` | |
| `POST` | `/api/questions/background/normalize-state` | **Global** — see Safety below |
| `POST` | `/api/questions/background/normalize-district` | **Global** — see Safety below |
| `GET` | `/api/questions/background/unknown-geo` | Read-only audit |

---

## Safety

`normalize-state` and `normalize-district` operate **globally** across ALL
questions matching the given state/district name, not scoped to one
question. Both tests here use a `RUN_TAG`-scoped fake name that cannot
possibly match any real question, so `matched`/`modified` is always `0` —
this exercises the real validation + query + response-shape code path with
zero risk to real data.

`background/process` mutates a real user's `assignedQuestionIds`, so it's
tested against a throwaway fixture user created for this run (`${RUN_TAG}
_ops_target`), never a shared `.env.test` account.

The `remove-history-entry`/`add-history-entry`/`remove-queue-entry`/
`add-queue-entry` routes are scoped to a dedicated fixture question
(`opsQuestionId`) created in `beforeAll` with a real submission doc
(`queue: [expertUser._id]`, one `in-review` history entry) — not a shared
account's real data.

---

## NOT covered here — and why

- `POST /check-overlaps`, `/run-migration`, `/migrate-firebase-users` —
  genuinely destructive/staging-DB-dependent. See `README.md`.
- `QuestionService.runAbsentScript()` / `.allocateFeedbackQuestions()` —
  these have no HTTP route (only called from `src/bootstrap/jobs/*Cron.ts`)
  and were tried as direct DI-container invocations here, then **removed**.
  Unlike `runGateKeeperAuditorQueueCron()`/`runPaeValidationQueueCron()`
  (which `gatekeeper-auditor`/`feedback` call safely, because those crons
  are scoped to their own well-defined queue), both of these operate on
  *whatever real data currently exists* across the whole shared Atlas DB,
  with no questionId/userId scoping. Running `runAbsentScript()` once
  during this file's development genuinely removed real experts from real,
  non-fixture question queues and blocked several `experttest*` accounts —
  a real incident, root-caused and repaired; see `Failed_tests.md`'s
  "Test-data debt" section for the full story. Same risk class as
  `check-overlaps`/`run-migration`, just not obvious from the function
  name — **do not add a direct-invocation test for either of these without
  re-reading that incident writeup first.**

---

## Strategy

Same in-process harness as every other suite — `loadAppModules('all')`
against the real DB, `currentTestUser` swap for auth,
`x-internal-api-key: 'e2e-question-ops-key'` on every request. See
`README.md`'s "in-process harness" section for the shared boilerplate.
