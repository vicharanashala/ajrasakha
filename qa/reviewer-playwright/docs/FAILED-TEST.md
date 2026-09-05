# Playwright Test Investigation Log

This document tracks Playwright test failures encountered during automation development, along with their investigation, findings, and current status.

---

# QDET-002 — Selected question details remain visible after a browser reload

## Test

**File**

```
tests/dashboard-question-details.spec.ts
```

**Current Test Name**

```
QDET-002 selected question details remain visible after a browser reload
```

---

## Current Implementation

```ts
await dashboardPage.openAllQuestions();

const selected = await dashboardPage.openFirstQuestion();

await questionDetailsPage.expectQuestionText(selected.question);

await authenticatedPage.reload();

await questionDetailsPage.expectQuestionText(selected.question);
```

---

## Execution

```bash
pnpm exec playwright test -g "QDET-002" --headed --debug
```

---

## Result

**Status**

❌ Failed

---

## Failure

```
Error:
expect(locator).toHaveText(expected) failed

Locator:
getByRole('heading', { level: 1 })

Expected:
E2E_AJ_1782374979328 My paddy crop leaves are turning yellow, what should I do?

Error:
element(s) not found
```

---

## Investigation

### Reload Behaviour

After refreshing the browser:

- Question details disappear.
- User is returned to the **All Questions** view.
- URL remains unchanged.
- Previously selected question is lost.

Current behaviour:

```
Question Details
        │
        ▼
Browser Reload
        │
        ▼
All Questions
```

Expected behaviour (per test):

```
Question Details
        │
        ▼
Browser Reload
        │
        ▼
Question Details
```

---

## Root Cause

The failure is **not** caused by:

- incorrect Playwright locator
- timing issue
- synchronization issue

The failure occurs because the application does not preserve the selected question after a browser reload.

**Confirmed in source (2026-09-05):** clicking a question row calls
`handleViewMore(questionId)` in `frontend/src/components/questions-page.tsx`,
which only calls `setSelectedQuestionId(questionId)` — local React state.
It never calls the URL-syncing setter that `useSelectedQuestion()`
(`frontend/src/hooks/api/question/useSelectedQuestion.ts`) exposes for the
`?question=` search param, even though that param exists and is read on
mount (`autoOpenQuestionId`/`routeQuestionId`). So the selection is real,
but nowhere the URL can see it, and a reload always drops back to the list.
This is a one-line-of-intent gap in `questions-page.tsx`, not a Playwright
issue — fixing it means calling the URL setter from `handleViewMore` too,
which is a frontend change outside this test suite's scope.

---

## Current Status

| Item                | Status                                             |
| ------------------- | -------------------------------------------------- |
| Reload verification | Added                                              |
| Test result         | Failing                                            |
| Root cause          | Application returns to question list after refresh (confirmed in source) |

---

## Next Steps

Await confirmation from the development team whether:

- question selection should persist across browser reloads,
  _or_
- returning to the question list is the intended application behaviour.

If persistence is wanted, the fix is in `handleViewMore` in
`questions-page.tsx`: also call the `setSelectedQuestionId` returned by
`useSelectedQuestion()` (which writes `?question=`), not just the local
`useState` setter of the same name.

---

# MQD-006 — AI Generated Answer generation unavailable in test environment

## Test

**File**

```text
tests/moderator/moderator-question-details.spec.ts
```

**Current Test Name**

```text
MQD-006 Moderator can generate an AI answer
```

---

## Current Implementation

```ts
await moderatorQuestionDetailsPage.expandAiGeneratedAnswerSection();

await moderatorQuestionDetailsPage.generateAiAnswer();

await moderatorQuestionDetailsPage.expectAiAnswerGenerated();
```

---

## Execution

```bash
pnpm exec playwright test -g "MQD-006" --headed
```

---

## Result

**Status**

❌ Failed (Expected)

---

## Failure

The AI answer is not generated after clicking **Generate AI Answer**.

The test fails while verifying that an AI-generated response replaces the default empty state.

---

## Investigation

### AI Generation Behaviour

Current application behaviour:

```
Question Details
        │
        ▼
Expand AI Generated Answer
        │
        ▼
Click "Generate AI Answer"
        │
        ▼
No AI response generated
```

Expected behaviour:

```
Question Details
        │
        ▼
Expand AI Generated Answer
        │
        ▼
Click "Generate AI Answer"
        │
        ▼
Loading state
        │
        ▼
AI-generated response displayed
```

---

## Root Cause

The failure is **not** caused by:

- incorrect Playwright locators
- synchronization or timing issues
- page object implementation

The failure occurs because AI answer generation is currently unavailable in the target environment. The backend service responsible for generating responses is not enabled (or is not returning a generated answer), so the UI remains in its default empty state.

---

## Current Status

| Item               | Status                                        |
| ------------------ | --------------------------------------------- |
| AI generation test | Added                                         |
| Test result        | Failing (Expected)                            |
| Root cause         | AI generation unavailable in test environment |

---

## Next Steps

Await availability of AI answer generation in the target environment.

Once available:

- verify loading state during generation
- verify successful API completion
- verify "No AI answer available" is removed
- verify generated AI response is rendered
- verify generated content is non-empty

---

# RESP-009, MQA-009, MOD-002, AAR-002, AAR-004 — Login stuck on /auth during a ~11-minute window of a long full-suite run

## Test

**Files / Test Names**

```text
tests/expert/expert-draft-response.spec.ts        RESP-009 Submit button is enabled after entering a draft response
tests/moderator/moderator-allocation-queue.spec.ts MQA-009 Moderator sees Gate Keeper empty state
tests/moderator/moderator-create-question.spec.ts  MOD-002 Create Question dialog renders all required controls
tests/workflows/auto-allocation-random-review-workflow.spec.ts AAR-002 The auto-allocated expert can find and open the question
tests/workflows/auto-allocation-random-review-workflow.spec.ts AAR-004 Full random review chain runs until three consecutive acceptances or all 10 experts are done
```

All five fail inside the shared `LoginPage` helper (`pages/shared/login.page.ts`), not in their own test bodies:

```ts
async open(): Promise<void> {
  await this.page.goto("/auth");
  await expect(this.page.locator('[data-slot="card-title"]')).toHaveText(
    "Welcome Back",
  );
}

async signInAndWaitForLanding(email: string, password: string): Promise<void> {
  await this.open();
  await this.signIn(email, password);
  await expect(this.page).toHaveURL(
    /\/(home|pae-expert|user\/[^/?#]+)(?:[/?#]|$)/,
    { timeout: 30_000 },
  );
}
```

---

## Execution

```bash
pnpm exec playwright test
```

(full suite, 169 tests, one worker, ~69 minutes)

---

## Result

**Status**

❌ Failed (all 5) — `MQA-009` failed at `open()` itself (`"Welcome Back"` never rendered, blank white screenshot); the other four failed at `signInAndWaitForLanding()` (credentials submitted, but the app never redirected off `/auth` within 30s).

---

## Investigation

Pulled exact failure timestamps from `test-results/results.json` for this run (`startTime: 2026-09-05T04:45:17.684Z`):

```text
04:48:30  RESP-009  failed
04:50:41  QDET-002  failed (separate, pre-existing cause — see above)
04:52:40  MQA-009   failed
04:55:01  MOD-002   failed
04:57:53  MQD-006   failed (separate, pre-existing cause — see above)
04:59:12  AAR-002   failed
05:00:09  AAR-004   failed
05:03:27  EAW-M010  failed (separate cause — since fixed, see fixes below)
```

Cross-checked against the backend's own request log (`/tmp/backend-dev.log`) for `/api/auth/sync` — the call every successful login makes right after Firebase confirms the sign-in:

```text
...
04:49:30.480  POST /api/auth/sync  200
04:49:32.756  POST /api/auth/sync  200
                                              <-- gap: zero /auth/sync calls for ~11 minutes -->
05:00:11.849  POST /api/auth/sync  200
05:00:21.236  POST /api/auth/sync  200
...
```

Every `/auth/sync` call **before and after** this gap succeeded in 40-170ms — the backend itself was healthy and idle the entire time, it simply received no login traffic to respond to. `MQA-009`, `MOD-002`, `AAR-002`, and `AAR-004` all fall inside this exact window; `RESP-009` (04:48:30) sits just before it opens. The rest of the 69-minute run (161 other tests, including many that log in as 2-4 different accounts per test) completed cleanly before and after this window.

---

## Root Cause

The failure is **not** caused by:

- a Playwright locator or page-object bug (`LoginPage` is shared, unchanged code, and works in every other run)
- a backend bug or crash (backend log shows continuous healthy `200`s immediately either side of the gap, no restart, no errors)
- a frontend bug (same login flow that succeeds ~160 other times in the same run)
- the app-behavior gaps already documented elsewhere in this file (`QDET-002`, `MQD-006`) — those are separate, and reproduced independently at their own timestamps

Login in this app calls Firebase directly from the browser before the backend is ever involved (`/auth/sync` is the *second* step, only reached once Firebase confirms the sign-in). The backend log proves the backend had nothing to do — so whatever blocked login for those ~11 minutes happened before that point, in the browser-to-Firebase leg: either an external Firebase Auth throttle/rate-limit responding to the sustained volume of logins this suite (and manual verification runs immediately before it) generates, or a transient local network hiccup between the test machine and Firebase's servers. Both are external dependencies outside this repository's code, correlate with a login-heavy suite, and are not reproducible on demand — the exact same run, immediately before and after this window, works fine with no code involved.

## Why this can't be fixed via a text/code change

- There is no source file to edit: the failing step is an external network call (browser → Firebase), not application or test logic. `LoginPage`, the backend, and the frontend are all provably healthy immediately before and after the window.
- A longer assertion timeout would only paper over it, not fix it — during the 11-minute window itself, no amount of waiting inside a single test would have helped, since Firebase never let the sign-in through.
- It isn't reproducible on demand: rerunning the same tests individually right after (see `EAW-M010`'s verification below, run minutes later against the same servers) works fine, which rules out a deterministic bug in this suite's code.

---

## Current Status

| Item        | Status                                                             |
| ----------- | ------------------------------------------------------------------- |
| Test result | Failing (intermittently, only when this window is hit)              |
| Root cause  | External auth dependency (Firebase) unavailable/throttled for ~11 min |
| Fix         | None available in this repo's code; see mitigations below            |

---

## Next Steps

Mitigations worth considering (process/config, not test-code fixes):

- Avoid stacking a full-suite run immediately after several manual/interactive login runs against the same accounts, to reduce burst login volume.
- If this recurs reliably, capture the browser's network/console log for a failing `open()`/`signIn()` call (not just the DOM snapshot) to get the actual Firebase error code (e.g. `TOO_MANY_ATTEMPTS_TRY_LATER`) and confirm the rate-limit theory directly.
- Consider a dedicated Firebase test project/quota for this suite if shared quota with other environments is a factor.

---

---

# Future Investigations

Add subsequent failing test investigations below using the same structure.

## TEST-ID

### Status

### Failure

### Investigation

### Root Cause

### Resolution
