# Failed Tests

What currently fails when you run the full e2e suite, why, and how to fix
it. 3 tests fail for real, reproducible application reasons. 2 more only
fail under full-suite load and aren't reproducible alone — those aren't
real bugs.

---

## Real failures (3) — need an application-code fix

### `reviewer-queue/ReviewerQueue.e2e.test.ts` — 1/14 failing

- **Test:** *"author-slot question appears before reviewer-slot question for
  STF expert (Issue #2)"*
- **What fails:** `expected 2 to be less than 0` — the author-slot question
  shows up *after* the reviewer-slot one, not before.
- **Reason:** `getAllocatedQuestions`' sort only orders by `createdAt` — it
  doesn't prioritize the author slot the way the product intends.
- **Fix:** Add a secondary sort key that ranks the author slot ahead of the
  reviewer slot regardless of `createdAt`.

### `whatsapp/WhatsAppQuestion.e2e.test.ts` — 1/21 failing

- **Test:** *"WhatsApp API completely unreachable › proceeds to open (not
  isTesting) when the thread API throws non-not-found errors"*
- **What fails:** times out waiting for the question to leave `pending`
  status (120s timeout, 60s polling window — not a timing issue, the
  pipeline genuinely never finishes).
- **Reason:** the background pipeline throws
  `Cannot read properties of undefined (reading 'content')` when every
  `fetchWhatsAppMessage` retry fails, leaving the question stuck instead of
  degrading gracefully to `open`.
- **Fix:** Guard the `.content` access with a null check, and make sure the
  catch-all-retries-failed path still transitions the question to `open`
  (matching every other failure mode in this pipeline).

### `feedback/Feedback.e2e.test.ts` — 2/34 failing

- **Test 1:** *"runPaeValidationQueueCron assigns an ancient pending
  question to an available pae_expert"* — `result.assigned` is `0`, expected
  `≥ 1`. (The real DB-state assertions in the same test still pass — the
  assignment genuinely happened, only the reported count is wrong.)
- **Test 2:** *"GET /:questionId/pae-validation-timeline reflects the
  cron-assigned round"* — the question ends up with more than the expected
  1 review round (exact count varies by how many PAE-expert fixtures exist
  at that point in the run).
- **Reason (both):** a performance fix elsewhere (a lean DB projection on
  `findQuestionsPendingPaeValidation`) made that query stop returning the
  question's `question` text field. `runPaeValidationQueueCron`'s
  per-expert loop does the real assignment (DB write, commits fine) and
  *then* crashes building a notification message that reads
  `matchedQuestion.question` — now `undefined`. The surrounding `catch`
  treats that notification crash exactly like the whole assignment failed,
  and un-claims the question — so the next available expert matches the
  *same* question again, and the cycle repeats once per available expert.
  Net result: one question can get several duplicate review rounds pushed
  in a single cron run, no notification is ever sent, and the cron always
  reports `0` assignments even when it made several (duplicate) writes.
- **Fix:** Two changes needed together: (1) don't drop the `question` field
  from that lean projection — it's still used downstream — or fetch it
  separately if the projection must stay lean; (2) move the notification
  call outside the try/catch that un-claims on failure (or wrap just the
  notification in its own try/catch that logs but doesn't touch the claim
  state), so a notification failure can never be mistaken for an
  assignment failure.

---

## Flaky — not real failures (2)

Both confirmed non-reproducible in isolation; no test or app-code change was
made for either.

- **`user/UserController.e2e.test.ts`** — *"PATCH /users (notification
  preference) › updates the notification preference"* failed once, only
  during a full 29-file run, with an unhandled
  `MongoClientClosedError: Operation interrupted because client was closed`
  logged right after — a connection-pool race from running dozens of files'
  worth of real Atlas connections back-to-back. Re-ran the suite alone
  immediately after: clean.
- **`question/QuestionControllerGaps.e2e.test.ts`** — *"POST
  /questions/status-summary › returns 401 with no authenticated user"*
  failed once (`404` instead of `401`), same category, same likely cause.
  Re-ran the whole file alone immediately after: clean.

If either starts failing consistently (not just during a full-suite run),
that would point to a real routing or connection-handling issue worth a
closer look — right now it only ever happens under heavy concurrent load
from the rest of the suite.

---

## How to reproduce

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/reviewer-queue/ReviewerQueue.e2e.test.ts
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/whatsapp/WhatsAppQuestion.e2e.test.ts
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/feedback/Feedback.e2e.test.ts
```
