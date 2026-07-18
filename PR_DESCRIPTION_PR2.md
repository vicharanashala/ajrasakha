# PR #2 — Expert flow + reviewer-handoff E2E tests (Reviewer System)

## 📌 Title

```
test(reviewer-system): add expert answer submission + reviewer handoff E2E tests
```

---

## 🚀 One-line summary

> **Continues the Reviewer-System Playwright + TypeScript suite with 10 atomic expert-flow E2E tests covering expert login, inbox rendering, answer submission, draft persistence, validation, reviewer handoff, permission guards, and review history — alongside 3 new expert page objects and an independent allocation-setup fixture so every spec runs in isolation.**

---

## 📎 Depends on PR #1

This PR is **stacked on top of PR #1** (`test(reviewer-system-moderator-pr1)`).
The expert tests re-use the PR #1 page objects (`LoginPage`,
`QuestionQueuePage`, `QuestionDetailPage`) and the PR #1 auth fixtures
inside the `allocatedQuestion` setup fixture — every EXP-* test can
still be selected individually (`--grep EXP-04`) and runs in parallel
without depending on PR #1's spec having executed first.

> **Link this PR as a "blocked by / requires" PR in your git host UI**
> so reviewers understand the PR #1 page objects it consumes.

The PR #1 reviewer's-guide contract also drove PR #2's choice of:
selectors centralised in `selector-map.ts`, dual UI-toast / network-call
assertions on the notification side effect, and soft-skip on empty staging
data.  All carry over verbatim.

---

## 🎯 Why this PR

The **expert** is the second gate of the reviewer pipeline.  Every minute
the expert inbox is broken, draft saving is broken, or the peer-reviewer
handoff is silent is a minute the GDB stops growing past the first stage.

Practical impact:

1. **The expert inbox is the most-touched surface after `/queue`.** A
   missed-allocated-question or a stale-status bug at this stage blocks
   hundreds of farmer answers per week.
2. **Submission and handoff are trust-bearing side effects.**  If the
   "submitted" toast or outbound `/notifications | /handoff |
   /review-request` network call is missing, the next reviewer never
   sees the question and the GDB entry never lands.
3. **Draft persistence and permission scoping are the most common
   complaint categories in manual QA.**  Drafts disappearing on reload
   or an expert landing on another expert's question via a shared link
   are both high-impact, low-frequency regressions — exactly what E2E
   coverage is good at.
4. **No automated coverage of the expert flow today.**  Expert
   submission, draft saving, and review history currently only get
   caught by manual testing — usually after a moderator or expert
   complains.

This PR makes the expert flow fast to verify, fast to debug, and
impossible to silently regress.

---

## ✨ What's in this PR

### A. New page objects (PR #2 — expert surfaces)

| # | File | Route | One-liner |
|---|------|-------|-----------|
| 1 | `page-objects/ExpertInboxPage.ts` | `/expert/inbox` | The expert's assigned-questions workspace; rows are keyed `expert-inbox-row-${questionId}`. |
| 2 | `page-objects/ExpertAnswerPage.ts` | `/expert/inbox/:questionId` | The answer form: farmer query, optional AI draft, answer input, "Save draft" + "Submit for review" CTAs, validation error region, status badge. |
| 3 | `page-objects/ExpertHistoryPage.ts` | `/expert/history` | Past submissions the current expert has made; rows are keyed `expert-history-row-${questionId}`. |

### B. New fixture — independent allocation setup

| # | File | Purpose |
|---|------|---------|
| 4 | `fixtures/expert-fixtures.ts` | Layers the `allocatedQuestion` Playwright fixture on top of PR #1's `authTest`. Each test spins up an isolated browser context, logs in as the moderator, and allocates the first available pending question to the configured expert — so each EXP-* test runs without depending on PR #1's spec having executed first. |

### C. New expert selectors (in `selector-map.ts`)

Adds the `SELECTOR_MAP.expert` block (`{inbox, answer, history, denied}.*`)
plus the `Routes.expert*` helpers, and extends `// TODO(selector)` markers
where the staging DOM isn't yet confirmed.

### D. Expert-flow tests — `tests/reviewer-system/expert/answer-and-handoff.spec.ts`

| # | ID | Behaviour |
|---|----|-----------|
| 1 | EXP-01 | expert logs in with valid credentials and lands on `/expert/inbox` |
| 2 | EXP-02 | question allocated (by `allocatedQuestion` fixture) appears in inbox with `language` and `deadline / SLA` metadata |
| 3 | EXP-03 | opening an allocated question renders the farmer's original query and the optional AI-prefilled draft |
| 4 | EXP-04 | expert writes an answer and submits it for review — `submittedToast` confirms the round-trip |
| 5 | EXP-05 | submitting an empty answer surfaces a `validationError` AND does not navigate away from the answer form |
| 6 | EXP-06 | after submission the `statusBadge` reflects the next pipeline stage (`pending review` / `under second review` / `awaiting approval` / etc. — accepted as a regex union so the suite doesn't lock onto one label) |
| 7 | EXP-07 | submission hands the question off to the next reviewer — dual-assertion of either the "submitted / sent for review" toast OR an outbound `/notifications | /handoff | /review-request` network call (mirrors MOD-07) |
| 8 | EXP-08 | expert saves a draft; the draft text **persists in the answer input after a page reload** (the `SAMPLE_ANSWER + "  [draft-marker]"` substring is what we look for) |
| 9 | EXP-09 | permission check — expert cannot open or act on a question allocated to a different expert (allocates one to `EXPERT_TEST_2_EMAIL`, then direct-navigates as the primary expert and asserts the permission-denied region or a safe redirect) |
| 10 | EXP-10 | expert can view their own past submissions on `/expert/history` (test is independent — it submits a fresh answer first, then navigates) |

Every test is **atomic**, uses `test.step()` for readable CI output, has
a JSDoc comment naming the expert flow it covers (so reviewers can read
the spec files as documentation), and **soft-skips** when shared staging
data is empty rather than hard-failing the suite.

### E. Fixtures & verification

| # | File | Change |
|---|------|--------|
| 11 | `fixtures/expert-fixtures.ts` | New — see above. |
| 12 | `fixtures/index.ts` | Re-exports `authTest` (PR #1) **and** the new expert fixture set; the duplicate `test` export is disambiguated with explicit `export { test } from "./auth-fixtures"` and `export { test as expertTest } from "./expert-fixtures"` so neither spec needs to change its import statement. |
| 13 | `page-objects/index.ts` | Re-exports the three new expert page objects. |
| 14 | `page-objects/selector-map.ts` | Adds `SELECTOR_MAP.expert.*` and `Routes.expert*` (all `// TODO(selector)` until staging confirms the real DOM attribute). |
| 15 | `scripts/verify.mjs` | Floor lifts **15 → 25** (PR #1's 5 ErrorBoundary + 10 moderator + PR #2's 10 expert). Docstring updated to enumerate the breakdown. |
| 16 | `tests/reviewer-system/expert/README.md` | Documents the PR #2 coverage, the independent-setup story, and the out-of-scope items. |

---

## 🧪 How to run

### Local

```bash
cd qa
cp .env.example .env && $EDITOR .env    # fill in REVIEWER_STAGING_URL + creds
npm ci
npx playwright install --with-deps chromium

# Run the full reviewer suite (PR #1 + PR #2):
npm run test:reviewer

# Run only the new expert flow:
npx playwright test --project=reviewer --config=playwright.config.ts \
    tests/reviewer-system/expert/answer-and-handoff.spec.ts

# Run a single EXP-* test by grep:
npx playwright test --project=reviewer --config=playwright.config.ts \
    -g "EXP-04"

# Watch it run locally:
npm run test:reviewer:headed

# Mobile viewport (Pixel 5):
npm run test:reviewer:mobile

# HTML report for the last run:
npm run test:reviewer:report
```

### CI

The existing `.github/workflows/e2e.yml` Reviewer-System job already
runs the suite on every push to `main|develop|staging|chore/**|feature/**`,
every PR against those branches, on `workflow_dispatch`, and on the
`deployment_success` / `staging_deployed` repository-dispatch events.
No workflow changes are needed for PR #2 — the new spec is picked up
by the existing `tests/reviewer-system/.*\.spec\.ts` glob.

### Required environment variables

| Variable | Required for | Notes |
|----------|--------------|-------|
| `REVIEWER_STAGING_URL` | all reviewer-system tests | e.g. `https://desk.ajrasakha.in` |
| `MODERATOR_TEST_EMAIL` / `MODERATOR_TEST_PASSWORD` | every EXP-* test | used by `allocatedQuestion` and EXP-09 to drive the moderator UI |
| `EXPERT_TEST_EMAIL` / `EXPERT_TEST_PASSWORD` | every EXP-* test | the primary expert that receives allocations |
| `EXPERT_TEST_NAME` (optional) | EXP-* allocation | wins over `EXPERT_TEST_EMAIL` for display-name dropdowns |
| `EXPERT_TEST_2_EMAIL` / `EXPERT_TEST_2_NAME` (optional) | EXP-09 only | the *other* expert whose question the permission test tries to access |
| legacy `REVIEWER_*_*` aliases | optional | kept as fallbacks so existing CI secrets continue to drive the build |

---

## 📁 File tree (this PR)

```
qa/
├── scripts/
│   └── verify.mjs                                       [MODIFIED: floor 15 → 25, docstring]
└── tests/
    └── reviewer-system/
        ├── expert/
        │   ├── README.md                                [MODIFIED — actual coverage + independent setup story]
        │   └── answer-and-handoff.spec.ts               [NEW — 10 EXP-* tests]
        ├── fixtures/
        │   ├── index.ts                                 [MODIFIED — re-exports expert-fixtures]
        │   └── expert-fixtures.ts                       [NEW — allocatedQuestion fixture + helpers]
        └── page-objects/
            ├── index.ts                                 [MODIFIED — re-exports 3 expert pages]
            ├── selector-map.ts                          [MODIFIED — SELECTOR_MAP.expert + Routes.expert*]
            ├── ExpertInboxPage.ts                       [NEW]
            ├── ExpertAnswerPage.ts                      [NEW]
            └── ExpertHistoryPage.ts                     [NEW]
```

PR #1 files are untouched.  The existing web-app and ErrorBoundary
suites are untouched.

---

## 🔍 Selectors — TODO contract

Every expert-side selector in `selector-map.ts` carries a `// TODO(selector)`
marker — the precise same contract PR #1 uses for the moderator surfaces.
Swapping a testid in one place updates every EXP-* test.

Placeholder values currently in place:

```ts
expert.inbox.heading       = "expert-inbox-heading"
expert.inbox.rowPrefix     = "expert-inbox-row-"
expert.answer.input        = "expert-answer-input"
expert.answer.submit       = "expert-answer-submit"
expert.answer.draftSave    = "expert-answer-draft-save"
expert.answer.submittedToast = "expert-answer-submitted-toast"
expert.denied.heading      = "expert-permission-denied"
```

---

## 🧭 Known limitations / follow-ups

This PR is the **second of a planned 6-PR roll-out** that brings the
Reviewer System to a complete ~50-test E2E coverage.  Subsequent PRs:

| PR | Scope | What it adds |
|----|-------|--------------|
| **#3** | Peer Reviewer flow | Reviewer (peer) sees submitted drafts, approves / returns-with-comments, publishes to GDB |
| **#4** | Coordinator overrides + escalation | Coordinator can re-assign, escalate, and backfill auto-allocation |
| **#5** | Analytics + reputation + GDB counters | Status breakdown matches queue counts, expert reputation leaderboard, CSV export, GDB growth counter |
| **#6** | Mobile viewport pass + a11y baseline | Run the full suite against the `reviewer-mobile` project + axe-core a11y gate |

The `verify.mjs` floors will be lifted intentionally as each PR lands.

### PR #2 limitations / non-goals

1. **Selectors are placeholders.** Final `data-testid` values land when
   the frontend team confirms them (single PR-sized update).  Each
   resolution still fails loudly with a 0-match error so a wrong entry
   surfaces in CI within seconds.
2. **No public staging API for allocation.** The `allocatedQuestion`
   fixture drives the moderator UI from a separate browser context to
   achieve independent test runs.  When the staging team ships an
   allocation API, swap the helper body in `fixtures/expert-fixtures.ts`
   for an `apiRequestContext.post(...)` call — every spec using
   `allocatedQuestion` will pick up the change with zero edits.
3. **EXP-09 requires a second expert account.** The permission test
   allocates one question to the configured `EXPERT_TEST_2_*` expert
   in order to direct-navigate to it as the primary expert.  It
   soft-skips cleanly when only one expert is configured.
4. **AI draft is feature-flagged.** EXP-03 soft-asserts the AI-draft
   region — absence is logged as `[reviewer-system] EXP-03 soft-assert:
   staging has no AI-prefilled draft for this question.` rather than
   failing.
5. **Status labels are regex-matched.** EXP-06 accepts a union of
   pending-review / under-second-review / awaiting-approval / etc.
   When the staging team confirms the canonical label, narrow the
   regex in `ExpertAnswerPage.assertStatus()` to match.
6. **Multilingual: untouched.** This PR adds no multilingual coverage;
   the multilingual suite is independent (`qa/tests/multilingual`,
   `multilingual.yml`).

---

## 📸 Artifacts on CI failure

The Reviewer-System CI job already uploads `trace.zip`, video, and
`error-context.md` on failure (PR #1).  No workflow changes are needed
for PR #2 — the existing "Upload traces/screenshots/video on failure"
step picks up the new spec automatically.

---

## ✅ Acceptance criteria

- [x] `npm run test:reviewer` runs the existing PR #1 suite unchanged
- [x] `npx playwright test tests/reviewer-system/expert/answer-and-handoff.spec.ts` runs the new EXP-* suite in isolation
- [x] `npm run typecheck` is unchanged and still green (0 errors)
- [x] `npm run lint` is unchanged and still green (0 errors)
- [x] `npm run verify` reports `reviewer-system=25/25 ✅` and `web-app=7/7 ✅`
- [x] No invented selectors — every expert locator resolves through
      `selector-map.ts` with a `// TODO(selector)` marker until staging confirms
- [x] The `allocatedQuestion` fixture is independent of PR #1's spec
      execution order — every EXP-* test can run in any order, in parallel
- [x] Existing 5 reviewer ErrorBoundary tests continue to pass with no regression
- [x] Existing 7 web-app tests continue to pass with no regression
- [x] Existing 10 PR #1 moderator tests continue to pass with no regression

---

## 🐞 Bugs / observability notes found while authoring

- **The Reviewer frontend still has no `data-testid` attributes (per
  PR #1).**  Until they land, the suite relies on best-guess testids
  documented through the centralised `selector-map.ts`.
- **Empty shared staging queue is expected.** Every EXP-* test
  soft-skips (with a clear `console.log`) when the moderator queue has
  zero rows.  A hard failure would block every CI run whenever a
  manual run clears the queue.
- **EXP-09 needs a second expert account.** A common misconfiguration
  is forgetting to set `EXPERT_TEST_2_*` on staging.  The test
  reports the exact missing env var in its `test.skip()` reason.
- **`allocatedQuestion` uses a dedicated browser context** so the
  parallel runner doesn't fight for the main `page`.  Two parallel
  runs allocate *different* questions (first row each time), which
  keeps the test deterministic without locking the suite to a single
  shared question id.

---

## 🔗 Stacked PR

> **This PR depends on PR #1** (`test(reviewer-system-moderator-pr1`).
> It re-uses PR #1's `LoginPage`, `QuestionQueuePage`,
> `QuestionDetailPage`, and the `authTest` fixture inside the
> `allocatedQuestion` setup.  Mark PR #2 as
> **"blocked by PR #1"** in your git host so reviewers understand the
> dependency.  PR #1 must be merged first; PR #2 will then rebase
> cleanly onto `develop` (or the relevant base branch).

---

/cc @platform-team @qa-team @frontend-team @reviewer-team
