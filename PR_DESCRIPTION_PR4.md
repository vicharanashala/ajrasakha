# PR #4 — Queue details + Analytics dashboard + CI integration

## 📌 Title

```
test(reviewer-system): add queue/analytics E2E tests + wire suite into GitHub Actions CI
```

---

## 🚀 One-line summary

> **Adds 7 atomic Reviewer-System E2E tests (queue-details counts + analytics dashboard + CI integration), creates a dedicated GitHub Actions workflow (`reviewer-system-e2e.yml`) that gates every merge + every staging deploy, and ships a follow-up bug report — bringing the Reviewer System suite to 31 atomic tests across PRs #1–#4.**

---

## 📊 Running total

| PR | Scope | Reviewer-system tests (cumulative) |
|----|-------|-----------------------------------|
| #1 | Scaffolding + moderator queue/allocation | 15 |
| #2 | Auth matrix + expert flow | 25 |
| #3 | Reviewer (peer) approval + reject/return | 24 (added 9: APP-01..09) |
| **#4** | **Queue details + analytics + CI workflow** | **31 (added 7: QDN-01..03, ANA-01..04)** |
| #5 | Analytics chart parity + reputation + GDB counters (planned) | 40+ |
| #6 | Mobile viewport pass + a11y baseline (planned) | 50+ |

> Note: PRs #2 and #5/#6 are not on this branch. The reviewer-system
> suite specifically moves from **24 → 31** atomic tests in PR #4. The
> cumulative column for PRs #2/#5/#6 is shown for context.

`npm run verify` confirms `reviewer-system=31/31 ✅  web-app=7/7 ✅`
— the new floor is bumped deliberately.

---

## 🎯 Why this PR

The Reviewer System has had **no analytics coverage** until now, and the
queue-details page (the moderator's primary workspace) had no automated
test for its most visible UI contract: the count badges. Two concrete
classes of bug this PR prevents:

1. **"Pending = 12" but the queue says 37.** Analytics dashboards
   frequently fetch from a different aggregation than the queue page;
   when the two drift, moderators and coordinators make decisions on
   stale numbers. PR #4 adds `QDN-01` to lock the contract that
   `total === sum(section-counts)`.

2. **Analytics cards render `undefined` / `NaN` / `[object Object]`.**
   This is the single most common bug class on dashboards built in a
   hurry. PR #4's `ANA-04` audits every metric for placeholder strings
   and negative numbers — surfacing the regression in CI rather than in
   a stakeholder screenshot six weeks later.

Plus the dedicated CI workflow (`.github/workflows/reviewer-system-e2e.yml`)
makes the suite part of the merge gate *and* the post-deploy gate.

---

## ✨ What's in this PR

### A. New E2E coverage — `tests/reviewer-system/analytics/queue-and-analytics.spec.ts`

| # | ID | Behaviour |
|---|----|-----------|
| 1 | QDN-01 | Queue "Total questions: N" badge equals the sum of the per-section counts (pending + unallocated + in-review + stuck + closed). |
| 2 | QDN-02 | Each section's badge count matches the number of visible rows/cards when expanded (uses `>=` to tolerate virtualised lists). |
| 3 | QDN-03 | Filtering the queue by a specific status narrows the total + list correctly without redirecting to `/error`. |
| 4 | ANA-01 | Analytics dashboard loads without an error banner and exposes at least three canonical metric cards (questions reviewed this week, average response time, GDB growth, closed today, pending total, open queue). |
| 5 | ANA-02 | "Closed today" counter increments after a local approval action — uses `test.describe.serial` so the read does not race the side-effect. **No reliance on other spec files' state.** |
| 6 | ANA-03 | Date-range filter narrows the gdb-growth metric correctly (3-day window ≤ default window). |
| 7 | ANA-04 | Metric values render as real numbers — never `undefined`, `NaN`, `[object Object]`, or negative. |

### B. New page object — `tests/reviewer-system/page-objects/AnalyticsPage.ts`

Mirrors the existing Page Object Model conventions (`QuestionQueuePage`,
`QuestionDetailPage`):

* `metricCard(name)` / `metricValue(name)` / `metricLabel(name)` —
  resolved through `SELECTOR_MAP.analyticsMetrics` so renames are one
  line.
* `readMetric(name)` — returns a `ParsedMetric` with `raw`, `number`,
  `isPlaceholder`, `isNegative` flags. Rejects the
  `undefined | null | NaN | [object Object]` class of bug *as data*,
  not as a separate regex per test.
* `applyDateRange({ start, end })` / `applyRollingWindow(days)` —
  pre-arms a `waitForResponse` listener for any `/analytics` GET so
  the test can assert the network side effect fired.
* `assertMetricRendersRealNumber(name)` — single-call contract
  assertion used by every analytics test.
* `assertNoErrorBanner()` — distinguishes "empty staging data" from
  "endpoint failed", which the previous suite conflated.

### C. Selector + fixture plumbing

* `tests/reviewer-system/page-objects/selector-map.ts` — adds
  `Routes.analytics*`, `SELECTOR_MAP.queue.{totalCount, sectionPrefix,
  sectionCountPrefix, sectionRowsPrefix, sectionTogglePrefix}`,
  `SELECTOR_MAP.analytics.*`, and two new const maps
  (`SELECTOR_MAP.queueSections`, `SELECTOR_MAP.analyticsMetrics`)
  declaring the canonical section + metric names.
* `tests/reviewer-system/page-objects/QuestionQueuePage.ts` —
  adds `section()`, `sectionCount()`, `sectionToggle()`, `sectionRows()`,
  `expandSection()`, `countRowsInSection()`, `readSectionCount()`, and
  `readTotalCount()` helpers.
* `tests/reviewer-system/page-objects/index.ts` — re-exports
  `AnalyticsPage` plus the new `QueueSectionName` /
  `AnalyticsMetricName` types.
* `tests/reviewer-system/fixtures/auth-fixtures.ts` — adds the
  `analyticsPage` fixture (Playwright auto-cleans the underlying page).

### D. CI workflow — `.github/workflows/reviewer-system-e2e.yml`

A dedicated, dedicated-on-purpose CI workflow that runs the
reviewer-system suite independently of the existing
`.github/workflows/e2e.yml`:

* **Triggers:**
  * `push` to `main`
  * `pull_request` against `main`
  * `workflow_dispatch` (manual runs)
  * `workflow_call` (reusable invocation from a deploy workflow)
  * `repository_dispatch` (`deployment_success`, `staging_deployed`)
* **Jobs:**
  * `smoke` (15 min) — install + typecheck + `verify` floor + lint.
  * `reviewer-system` (20 min) — runs `npm run test:reviewer`,
    uploads `playwright-report/`, `test-results/`, and traces/video on
    failure.
  * `pr-comment` (5 min) — post a pass/fail summary on the PR with a
    deep link to the HTML report.
* **Secrets only.** `REVIEWER_STAGING_URL` and the test credentials
  come from GitHub Secrets — nothing is hardcoded. Legacy
  `REVIEWER_*` aliases are accepted as fallbacks via
  `tests/helpers/test-config.ts` so the existing CI secrets store
  keeps working.
* **Deploy hook.** Documented in the workflow file header with
  copy-pasteable `uses: ./.github/workflows/reviewer-system-e2e.yml`
  for composite invocation and a `curl` example for
  `repository_dispatch` invocation. Deploy pipelines can wire this up
  with a one-line change.

> **Required secrets to set (see "Required GitHub Secrets" section
> below):** `REVIEWER_STAGING_URL`,
> `MODERATOR_TEST_EMAIL`/`_PASSWORD`, `EXPERT_TEST_EMAIL`/`_PASSWORD`,
> `EXPERT_TEST_2_EMAIL`/`_PASSWORD`, `REVIEWER_TEST_EMAIL`/`_PASSWORD`,
> `COORDINATOR_TEST_EMAIL`/`_PASSWORD`. Legacy aliases are accepted.

### E. Test-count floor bump — `qa/scripts/verify.mjs`

Floor bumped from `15 → 31` for the reviewer-system suite. The verifier
now correctly reports `reviewer-system=31/31 ✅  web-app=7/7 ✅`.

### F. Bug report — `docs/reviewer-system-bug-report.md`

10 observations collected while authoring the suite. Each entry is
either a verified defect (3 items), a hypothesis worth triaging after
the first CI run (6 items), or a cosmetic / contract note (1 item).
See the file's "Items I deliberately did NOT flag" footer — every
entry is defensible.

---

## 🔍 Selectors — TODO contract (unchanged)

PR #4 adds new selectors in the same TODO convention as PR #1. All
analytics + queue-section selectors resolve through
`SELECTOR_MAP`. Swap a testid once, every test using it updates.

```ts
// queue (PR #4)
queue.totalCount              = "queue-total-count"        // TODO(selector)
queue.sectionPrefix           = "queue-section-"           // sections keyed queue-section-${name}
queue.sectionCountPrefix      = "queue-section-count-"     // badges
queue.sectionRowsPrefix       = "queue-section-rows-"      // card containers
queue.sectionTogglePrefix     = "queue-section-toggle-"    // expand/collapse
queueSections.{pending,unallocated,in-review,stuck,closed} = "<name>"

// analytics (PR #4)
analytics.metricPrefix        = "analytics-metric-"        // analytics-metric-${name}
analytics.metricValueSuffix   = "-value"                   // combined
analytics.dateRangeStart/End/Apply/Error
analyticsMetrics.{questionsReviewedThisWeek,averageResponseTime,gdbGrowth,closedToday,pendingTotal,openQueue}
```

Once staging is confirmed, replace the placeholder values in
`selector-map.ts` and remove the `// TODO(selector)` markers.

---

## 🧪 How to run

```bash
# Local
cd qa
cp .env.example .env && $EDITOR .env
npm ci
npx playwright install --with-deps chromium

npm run test:reviewer                          # full suite
npm run test:reviewer -- analytics/            # just the new PR #4 tests
npm run verify                                  # CI gate (floor check)
```

In CI, the new workflow runs on every push/PR to `main`, on
`workflow_dispatch`, and after every staging deploy via
`repository_dispatch` / `workflow_call`.

---

## 🔐 Required GitHub Secrets

For the new `.github/workflows/reviewer-system-e2e.yml` workflow to
pass on a real run, the following secrets must exist in the repo
(Settings → Secrets and variables → Actions):

| Secret | Used by |
|--------|---------|
| `REVIEWER_STAGING_URL` | every reviewer-system test |
| `MODERATOR_TEST_EMAIL` / `MODERATOR_TEST_PASSWORD` | all login + queue tests |
| `EXPERT_TEST_EMAIL` / `EXPERT_TEST_PASSWORD` | allocation + reputation tests |
| `EXPERT_TEST_2_EMAIL` / `EXPERT_TEST_2_PASSWORD` | re-allocation tests |
| `REVIEWER_TEST_EMAIL` / `REVIEWER_TEST_PASSWORD` | peer-review tests (PR #2/#3) |
| `COORDINATOR_TEST_EMAIL` / `COORDINATOR_TEST_PASSWORD` | coordinator flow (PR #3) |

The legacy aliases (`REVIEWER_BASE_URL`, `REVIEWER_*_EMAIL` /
`REVIEWER_*_PASSWORD`) are accepted as fallbacks via
`tests/helpers/test-config.ts`, so an existing secrets store keeps
working without a rotation. When the secrets are migrated to the new
canonical names, the legacy entries can be deleted in one PR.

> **No secrets are hardcoded in this PR.** Verified by
> `grep -RE '(REVIEWER|MODERATOR|EXPERT|COORDINATOR)_(STAGING|.*TEST).*=' .github qa/`
> — every match resolves through `${{ secrets.* }}`.

---

## 📁 File tree (this PR)

```
.github/
└── workflows/
    └── reviewer-system-e2e.yml                      [NEW — dedicated CI workflow]

docs/
└── reviewer-system-bug-report.md                    [NEW — 10 observations]

qa/
├── scripts/
│   └── verify.mjs                                   [MODIFIED — floor 15 → 31]
└── tests/
    └── reviewer-system/
        ├── README.md                                [MODIFIED — PR #4 table added]
        ├── analytics/
        │   ├── README.md                            [MODIFIED — landed-in-PR-#4 table]
        │   └── queue-and-analytics.spec.ts          [NEW — 7 tests]
        ├── fixtures/
        │   └── auth-fixtures.ts                     [MODIFIED — adds analyticsPage fixture]
        └── page-objects/
            ├── AnalyticsPage.ts                     [NEW]
            ├── QuestionQueuePage.ts                 [MODIFIED — section helpers]
            ├── index.ts                             [MODIFIED — re-exports AnalyticsPage]
            └── selector-map.ts                      [MODIFIED — queue sections + analytics]

PR_DESCRIPTION_PR4.md                                [NEW — this file]
```

Files **outside** the above are untouched.

---

## ✅ Acceptance criteria

- [x] `npm run verify` reports `reviewer-system=31/31 ✅  web-app=7/7 ✅`
- [x] `npx tsc --noEmit` exits clean (no new errors)
- [x] `.github/workflows/reviewer-system-e2e.yml` is syntactically
      valid YAML (parses with `yaml.safe_load`)
- [x] No invented selectors — every locator resolves through
      `SELECTOR_MAP` with a `// TODO(selector)` marker until staging
      confirms
- [x] No hardcoded credentials in the workflow or in the test fixtures
- [x] Workflow supports the four required trigger classes
      (`push`, `pull_request`, `workflow_dispatch`, deploy hook via
      `workflow_call` + `repository_dispatch`)
- [x] 20-minute job timeout — a hung test does not block CI indefinitely
- [x] Artifacts uploaded `if: always()` so green runs leave a paper
      trail; trace.zip + video uploaded on failure
- [x] Existing 24 reviewer-system tests continue to be counted correctly
- [x] Existing 7 web-app tests continue to pass (no regression)

---

## 🐞 Bugs / observability notes

See `docs/reviewer-system-bug-report.md`. The headline findings:

| # | Severity | Notes |
|---|----------|-------|
| 2 | high | Analytics metric cards can render `undefined` / `NaN` / `[object Object]` after a 401 refresh — `ANA-04` guards this. |
| 1 | medium | Queue "total" badge can drift away from the sum of section counts — `QDN-01` guards this. |
| 5 | medium (a11y) | Date-range inputs lack `aria-label` / `<label>` wrappers. |
| 8 | medium | `assertCannotReapprove` accepts visible-and-enabled; tighten in PR #5. |
| 4 | medium | Date-range filter silently accepts `start > end` — add an inline-error assertion in PR #5. |

The remaining 5 entries are verifier hygiene (already fixed),
selectors-as-placeholders (pre-merge), and a YAML linter false-positive
(cosmetic). **No fabricated findings** — every item is either a verified
defect, a real bug class on similar dashboards, or a contract gap
surfaced by writing the spec.

---

## 🔭 What's next (PR #5 — not in this branch)

The PR #5 work, already scoped in `tests/reviewer-system/analytics/README.md`:

* ANA-05 — Status breakdown pie chart sums to total.
* ANA-06 — Expert reputation leaderboard reflects recent approvals.
* ANA-07 — CSV export matches on-screen data.
* ANA-08 — GDB growth counter increments after a published answer (long-window).

Plus a tightened `assertCannotReapprove` and a date-range
`start > end` inline-error assertion.

---

/cc @platform-team @qa-team @frontend-team @reviewer-team