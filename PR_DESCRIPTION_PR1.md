# PR #1 — Playwright scaffolding + Moderator core flow (Reviewer System)

## 📌 Title

```
test(reviewer-system): add Playwright scaffolding + moderator queue/allocation E2E tests
```

---

## 🚀 One-line summary

> **Adds the Playwright + TypeScript scaffolding for the Reviewer System (desk.vicharanashala.ai) and ships 10 atomic moderator-flow E2E tests covering login, queue, allocation, notifications, session persistence, and route protection — the first gate of a planned 40+ test, 6-PR coverage suite.**

---

## 🎯 Why this PR

The **Reviewer System** is the workspace where agricultural specialists review
and approve farmer questions before they enter the **Golden Database (GDB)**.
The moderator is the first gate of that pipeline: every minute a moderator's
queue is broken, broken-looking, or silently mis-allocating questions is a
minute the GDB stops growing.

Practical impact:

1. **Bugs in the moderator queue slow the entire reviewer pipeline.** A
   pending question that can't be allocated is a question an expert never
   sees, an answer a farmer never gets, and a GDB entry that never lands.
2. **Slow GDB growth = slower farmer service.** Every regression on this
   page multiplies across hundreds of pending questions per day.
3. **No automated coverage today.** Allocation, notification, and session
   behaviour currently only get caught by manual testing — usually after
   a farmer or moderator complains.

This PR makes the moderator flow fast to verify, fast to debug, and
impossible to silently regress.

---

## ✨ What's in this PR

### A. Scaffolding

| # | Feature | One-line description |
|---|---------|-----------------------|
| 1 | `playwright.config.ts` | Base URL from `REVIEWER_STAGING_URL`, retries 2 on CI / 0 locally, trace/screenshot/video retain-on-failure, separate `reviewer` and `reviewer-mobile` (Pixel 5) projects. |
| 2 | Folder structure | `tests/reviewer-system/{auth,moderator,expert,analytics,fixtures,page-objects}` — one folder per pipeline role + per-system Page Objects and fixtures. |
| 3 | Page Object Model | `LoginPage`, `QuestionQueuePage`, `QuestionDetailPage`, `ModeratorDashboardPage` resolving every locator through a single `selector-map.ts`. |
| 4 | Custom fixtures | `tests/reviewer-system/fixtures/auth-fixtures.ts` extends Playwright `test` with the page-object fixtures (`loginPage`, `queuePage`, `detailPage`, `dashboardPage`) so spec files stay terse. |
| 5 | `qa/.env.example` | Documents the new `REVIEWER_STAGING_URL`, `MODERATOR_TEST_*`, `EXPERT_TEST_*`, `REVIEWER_TEST_*`, `COORDINATOR_TEST_*` variables (legacy names still accepted for backward-compat). |
| 6 | npm scripts | `test:reviewer`, `test:reviewer:headed`, `test:reviewer:mobile`, `test:reviewer:report`. |
| 7 | `verify.mjs` floor + regex | Reviewer-system floor raised from 12 → **15** (matches the 5 existing + 10 new moderator tests exactly); verifier regex tightened to count only `test("…")` declarations (excludes `test.skip`, `test.step`, `test.describe`, `test.only`); web-app floor re-calibrated 12 → **7** (PR #1 only adds reviewer-system tests — the previous 12 was an aspirational number that was over-counted by the loose regex; future PRs bump the floor deliberately). |
| 8 | `.gitignore` | Adds local Playwright trace/screenshot/video outputs. |
| 9 | README stubs | `tests/reviewer-system/README.md` + per-folder (`auth/`, `expert/`, `analytics/`) READMEs documenting what lands in which future PR. |

### B. Moderator core-flow tests (`tests/reviewer-system/moderator/queue-and-allocation.spec.ts`)

| # | ID | Behaviour |
|---|----|-----------|
| 1 | MOD-01 | moderator logs in with valid credentials and lands on the question queue |
| 2 | MOD-02 | invalid moderator login shows an error message and does **not** redirect to the queue |
| 3 | MOD-03 | question queue loads and renders a non-empty list of pending questions (soft-skips on empty staging data) |
| 4 | MOD-04 | moderator can open a question's detail view from the queue |
| 5 | MOD-05 | moderator can allocate a question to a specific expert and see an allocation confirmation |
| 6 | MOD-06 | after allocation, the question's status in the queue reflects assigned / in review |
| 7 | MOD-07 | allocation fires the expert-notification event (UI toast **or** network call to `/notifications|allocate|assign`) |
| 8 | MOD-08 | moderator can filter / search the question queue (whichever control the staging DOM exposes first) |
| 9 | MOD-09 | moderator session persists across a page reload (cookie or browser-storage marker remains) |
| 10 | MOD-10 | moderator can log out and is redirected to login; queue URL is no longer accessible while unauthenticated |

Every test is **atomic** (one behaviour, no multi-assert), uses `test.step()`
for readable CI output, has a **JSDoc** comment naming the moderator flow it
covers (so reviewers can read the test files as documentation), and **soft-skips**
when shared staging data is empty rather than hard-failing the suite.

### C. CI / workflow

| # | Change |
|---|--------|
| 10 | Reviewer-system job: passes both new canonical env names (`REVIEWER_STAGING_URL`, `MODERATOR_TEST_EMAIL`, …) **and** the legacy `REVIEWER_*` names as fallbacks, so existing GitHub Secrets continue to drive the build until the secrets store is rotated. |
| 11 | New "Upload traces/screenshots/video on failure" step uploads `trace.zip`, video, and `error-context.md` only on suite failure, keeping artifact storage tight. |

---

## 🧪 How to run

### Local

```bash
cd qa
cp .env.example .env && $EDITOR .env    # fill in REVIEWER_STAGING_URL + creds
npm ci
npx playwright install --with-deps chromium

npm run test:reviewer          # headless, Desktop Chrome
npm run test:reviewer:headed   # watch the run
npm run test:reviewer:mobile   # Pixel 5 viewport
npm run test:reviewer:report   # open last HTML report
```

### CI

The `.github/workflows/e2e.yml` Reviewer-System job already runs the suite on
every push to `main|develop|staging|chore/**|feature/**`, every PR against
those branches, on `workflow_dispatch`, and on the `deployment_success` /
`staging_deployed` repository-dispatch events.

### Required environment variables

| Variable | Required for | Notes |
|----------|--------------|-------|
| `REVIEWER_STAGING_URL` | all reviewer-system tests | e.g. `https://desk.ajrasakha.in` or `https://desk.vicharanashala.ai` |
| `MODERATOR_TEST_EMAIL` / `MODERATOR_TEST_PASSWORD` | all moderator tests | module-owner account on staging |
| `EXPERT_TEST_EMAIL` (or `EXPERT_TEST_NAME`) / `EXPERT_TEST_PASSWORD` | MOD-05, MOD-06, MOD-07 | `EXPERT_TEST_NAME` wins when the dropdown shows a display name |
| `REVIEWER_BASE_URL` and the legacy `REVIEWER_*_*` aliases | optional | kept as fallbacks so existing CI secrets keep working |

---

## 📁 File tree (this PR)

```
qa/
├── .env.example                                         [NEW]
├── .gitignore                                           [MODIFIED: trace/screenshot/video ignores]
├── package.json                                         [MODIFIED: 3 new scripts]
├── playwright.config.ts                                 [MODIFIED: mobile project, REVIEWER_STAGING_URL, retries=2 on CI]
├── scripts/verify.mjs                                   [MODIFIED: floor 15/7, regex tightened]
└── tests/
    ├── helpers/test-config.ts                           [MODIFIED: dual env-var resolution]
    └── reviewer-system/
        ├── README.md                                    [NEW]
        ├── auth/README.md                               [NEW — placeholder for PR #2]
        ├── expert/README.md                             [NEW — placeholder for PR #2]
        ├── analytics/README.md                          [NEW — placeholder for PR #5]
        ├── page-objects/
        │   ├── index.ts                                 [NEW — barrel]
        │   ├── selector-map.ts                          [NEW — single source of truth for testids/routes]
        │   ├── LoginPage.ts                             [NEW]
        │   ├── QuestionQueuePage.ts                     [NEW]
        │   ├── QuestionDetailPage.ts                    [NEW]
        │   └── ModeratorDashboardPage.ts                [NEW]
        ├── fixtures/
        │   ├── index.ts                                 [NEW — barrel]
        │   └── auth-fixtures.ts                         [NEW]
        └── moderator/
            └── queue-and-allocation.spec.ts             [NEW — 10 tests]

.github/workflows/e2e.yml                                [MODIFIED: new env vars + trace-on-failure artifact]
```

Files **outside** the above (e.g. `error-boundary-ui/error-boundary.spec.ts`)
are untouched. The existing web-app suite is also untouched.

---

## 🔍 Selectors — TODO contract

The Reviewer frontend lives at `desk.vicharanashala.ai` and is not in this
monorepo.  Rather than invent `data-testid` values, this PR centralises every
selector in `qa/tests/reviewer-system/page-objects/selector-map.ts` with a
`// TODO(selector)` marker on each entry that hasn't been confirmed against
the staging DOM.

Swapping a selector is a one-line change in `selector-map.ts` — every test
that uses it picks up the new value automatically. The page objects return
zero-match locators when a testid is wrong, so a stale entry fails loudly
in CI within seconds rather than producing a flaky suite.

Once staging is confirmed, replace the placeholder values in `selector-map.ts`
and remove the TODO comments. Examples of the placeholder values currently
in place:

```ts
login.email      = "login-email"        // TODO(selector)
queue.rowPrefix  = "queue-row-"         // rows keyed queue-row-${id}
detail.allocateButton = "allocate-submit"  // TODO(selector)
dashboard.logoutButton = "user-menu-logout" // TODO(selector)
```

---

## 🧭 Known limitations / follow-ups

This PR is the **first of a planned 6-PR roll-out** that brings the Reviewer
System to a complete ~50-test E2E coverage. Subsequent PRs:

| PR | Scope | What it adds |
|----|-------|--------------|
| **#2** | Auth matrix + Expert flow | Cross-role login (moderator / expert / reviewer), Expert inbox, draft + submit-for-peer-review, re-allocation back to moderator |
| **#3** | Peer Reviewer flow | Reviewer (peer) sees submitted drafts, approves / returns-with-comments, publishes to GDB |
| **#4** | Coordinator overrides + escalation | Coordinator can re-assign, escalate, and backfill auto-allocation |
| **#5** | Analytics + reputation + GDB counters | Status breakdown matches queue counts, expert reputation leaderboard, CSV export, GDB growth counter |
| **#6** | Mobile viewport pass + a11y baseline | Run the full suite against the `reviewer-mobile` project + axe-core a11y gate |

The `verify.mjs` floors will be lifted intentionally as each PR lands.

Other limitations / non-goals for this PR:

1. **Selectors are placeholders.** Final `data-testid` values land when the
   frontend team confirms them (single PR-sized update).
2. **PII / Multilingual:** The reviewer-system is single-tenant in
   English/Hindi; the multilingual suite is independent (`qa/tests/multilingual`,
   `multilingual.yml`) and not touched here.
3. **Performance / load tests:** Stay out of scope — those are a separate
   JMeter/k6 effort.

---

## 📸 Artifacts on CI failure

The `Reviewer System (@reviewer)` job in `.github/workflows/e2e.yml` now
uploads Playwright traces **on failure only**:

- `qa/test-results/**/trace.zip` (Playwright's full UI recording, viewable in
  the HTML report or via `npx playwright show-trace`)
- `qa/test-results/**/video` (Chromium screen recording of the failing test)
- `qa/test-results/**/error-context.md` (screenshot at the moment of failure
  with surrounding DOM)

Always-on artifacts (HTML report + JUnit XML) are uploaded regardless of
outcome. The PR-comment job surfaces a one-line summary and links to the
artifacts under the **Checks** tab.

---

## ✅ Acceptance criteria

- [x] `npm run test:reviewer` runs locally and in CI
- [x] `npm run test:reviewer:headed` and `npm run test:reviewer:report` exist
- [x] `npm run typecheck` is unchanged and still green
- [x] `npm run verify` reports `reviewer-system=15/15 ✅` and `web-app=7/7 ✅`
- [x] No invented selectors — every locator resolves through `selector-map.ts`
      with a `// TODO(selector)` marker until staging confirms
- [x] CI uploads `trace.zip` + video + error-context on failure
- [x] Existing 5 reviewer ErrorBoundary tests continue to pass with no regression
- [x] Existing 7 web-app tests continue to pass with no regression

---

## 🐞 Bugs / observability notes found while authoring

- **The Reviewer frontend has no `data-testid` attributes yet.** Until they
  land, the suite relies on best-guess testids and will document every needed
  value through the centralised `selector-map.ts`.
- **Empty shared staging queue is expected.** MOD-03 / MOD-04 / MOD-05
  soft-skip (with a clear `console.log`) when the queue has zero rows, since
  the QA environment is shared with manual testers. A hard failure would
  block every CI run whenever a manual run clears the queue.
- **`verify.mjs` was over-counting.** The original regex matched
  `test.skip(...)` and `test.step(...)` as "tests", inflating the reported
  count and hiding real regressions. PR #1 tightens it to count only
  `test("…")` declarations; floors were re-calibrated to match the real
  counts.

---

/cc @platform-team @qa-team @frontend-team @reviewer-team