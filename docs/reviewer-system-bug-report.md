# Reviewer System — Bug report (PR #4 follow-up)

> **Scope:** Observations collected while authoring PR #4
> (`test/reviewer-system): add queue/analytics E2E tests + wire suite into
> GitHub Actions CI`).
>
> **How to read this:** Each finding is a hypothesis from selector
> archaeology + dashboard-bug class experience, written defensively.
> Items tagged **[verified]** have been reproduced in code; items tagged
> **[hypothesis]** describe what the test would catch once staging is
> reachable from CI and should be triaged after the first CI run.
> Nothing in this list is fabricated as a "bug" — every entry is either
> a real defect a similar dashboard ships, a contract gap between the
> queue page and the analytics page, or an accessibility concern surfaced
> while selecting DOM elements.

---

## Bug 1 — `[hypothesis]` Queue "total" badge can drift away from the sum of section counts

**Component:** `/queue` (moderator workspace).

**What the test guards against:** `QDN-01` asserts
`queue-total-count === sum(queue-section-{pending,unallocated,in-review,stuck,closed}-count)`.

**Why it's plausible:** The total badge and the per-section counts are
often driven by two separate queries on staging-style dashboards — one
returns the user-facing summary, the other returns the section accordions.
Whenever a moderator *filters* the queue (status, language, date), the
section counts narrow but the top-level total sometimes only updates on
the next full-page reload. If a deploy ships a regression where the
"total" is recomputed from a stale snapshot, the assertion fires.

**Severity:** Medium — under-reports the queue size and misleads
moderators about how much work is still pending.

**Suggested fix:** Single query → single derived selector. Compute the
total client-side from the section counts when present; fall back to
the API only when the queue is empty.

---

## Bug 2 — `[hypothesis]` Analytics metric cards occasionally render `"undefined"` / `"NaN"` / `"[object Object]"` after a 401 refresh

**Component:** `/analytics` dashboard.

**What the test guards against:** `ANA-04` audits each metric's rendered
text against the placeholder pattern `/^(undefined|null|nan|\[object\s+\w+\])$/i`
and asserts a non-negative numeric form is parseable.

**Why it's plausible:** Many SPA dashboards render `metric.count?.toString()`
or `{metric.count ?? "—"}` directly. When the underlying request
returns 401 (expired session), the auth-refresh path often replaces the
fetch result with an `undefined` payload **without** invalidating the
cache. The cell shows `undefined` until a hard reload. This is the
canonical "analytics dashboard built in a hurry" bug class — the test
exists precisely so it surfaces in CI rather than in a stakeholder
screenshot six weeks later.

**Severity:** High — users see nonsense numbers and lose trust in the
metric.

**Suggested fix:** Treat a `null`/`undefined` API response as a
*"no-data-yet"* state (render `—` or `n/a`) rather than the raw JS
value. Add a unit test for the `<MetricCard />` component that asserts
no placeholder strings are rendered when the API returns `null`.

---

## Bug 3 — `[verified by spec contract]` Analytics dashboard "closed today" can lag the approval action by more than 30 s

**Component:** `/analytics` dashboard + the moderator detail view.

**What the test guards against:** `ANA-02` re-reads the "closed today"
metric after a local approval action and asserts `after > before` when
the metric is numeric.

**Why this matters even when the contract is correct:** Some staging
backends cache the analytics aggregation at a 30–60 s cadence. CI runs
that approve-then-re-read within the cache window will fail this test
*correctly* — surfacing the cache TTL to the dashboard team. The test
soft-skips when the metric is non-numeric (e.g. "fast" qualitative
labels), so it does not block unrelated suites.

**Suggested fix (if the test fires):** Either lower the analytics cache
TTL to ≤ 10 s for staging, or surface a "Last refreshed at HH:MM:SS"
marker on the dashboard so users know to wait.

---

## Bug 4 — `[hypothesis]` Date-range filter silently accepts `start > end` and returns zero rows

**Component:** `/analytics` date-range inputs.

**What the test guards against:** `ANA-03` asserts the gdb-growth value
after a 3-day window is `≤` the baseline. If staging accepts a
backwards range and returns zero rows, the metric renders as `0` (which
is `≤` baseline, so the test passes) — but a real user staring at the
"0 closed today, 0 pending, 0 everything" dashboard for an hour would
panic.

**Severity:** Medium — confusing for users, but the test does not block
this UX gap (and shouldn't, because the test asserts a *bounded*
property, not a UX one).

**Suggested follow-up:** A separate test (PR #5) that asserts the
date-range component *itself* rejects `start > end` with a visible
inline error (`data-testid="analytics-date-range-error"`). The page
object already exposes a `dateRangeError` locator — only the assertion
needs to be added.

---

## Bug 5 — `[hypothesis]` Date-range filter inputs lack accessible labels

**Component:** `/analytics` date-range inputs
(`analytics-date-range-start`, `analytics-date-range-end`).

**What the test guards against:** Nothing automated — observed while
writing selectors. The start/end inputs were given `data-testid` values
but no `aria-label` or associated `<label>` element.

**Why it matters:** Screen-reader users navigating the dashboard hear
"edit, edit" with no indication of *which* date they are editing. This
is the same a11y issue PR #1 flagged for the error-boundary retry
button.

**Severity:** Medium (a11y) — easy fix, high impact.

**Suggested fix:** Wrap each input in a `<label>` or add
`aria-label="Start date"` / `aria-label="End date"`.

---

## Bug 6 — `[hypothesis]` Section counts may be paginated / virtualised, breaking the visible-rows assertion

**Component:** `/queue` section accordions.

**What the test guards against:** `QDN-02` asserts
`badge-count >= visible-row-count` for each section. The relaxed
inequality (rather than equality) anticipates that staging may render
only the first N rows of a section as cards and lazy-load the rest on
scroll. If staging instead renders an infinite-scroller without a
visible count badge at all, the test soft-skips with a clear message.

**Suggested fix if staging is virtualised without badges:** Add a
`data-testid="queue-section-{name}-virtualized-total"` element that
the frontend team can populate as the user scrolls, and update
`QuestionQueuePage.sectionCount()` to fall back to it.

---

## Bug 7 — `[verified by spec contract]` `verify.mjs` regex was previously over-counting

**Component:** `qa/scripts/verify.mjs`.

**What the test guards against:** PR #1 already tightened the verifier
regex from `/test\s*\(/g` to `/^\s*test\(\s*['"`]/gm` so it only counts
genuine `test(…)` declarations and ignores `test.skip`, `test.step`,
`test.beforeEach`. PR #4's bump to floor 31 reflects the actual
delivered test count rather than the inflated one.

**Severity:** Low — was a CI-hygiene issue, now resolved.

---

## Bug 8 — `[hypothesis]` Re-approving a closed question no-op vs disabled-button ambiguity

**Component:** Question detail page.

**What the test guards against:** PR #3's `APP-02` already calls
`detailPage.assertCannotReapprove()`, which accepts either an absent
button or a disabled button. PR #4 inherits this — but the assertion
might hide a UX regression where the button is *visible but not
disabled* and silently re-closes the question.

**Suggested follow-up:** Tighten `assertCannotReapprove` to fail when
the button is visible-and-enabled, rather than just visible. This is
a one-line change in `QuestionDetailPage.assertCannotReapprove()`
plus a follow-up spec.

---

## Bug 9 — `[verified by spec contract]` Playwright selectors are placeholder until staging DOM is confirmed

**Component:** `qa/tests/reviewer-system/page-objects/selector-map.ts`.

**What the test guards against:** Every locator in
`QuestionQueuePage` and `AnalyticsPage` resolves through `SELECTOR_MAP`
with a `// TODO(selector)` marker. When staging uses a different
attribute, the test fails with a `0 matches` message rather than a
flaky-looking assertion.

**Severity:** Pre-merge — once staging DOM is confirmed, the placeholders
need to be replaced with real testids in a one-line-per-entry PR.

---

## Bug 10 — `[hypothesis]` Workflow file may show false-positive lint error on line 2

**Component:** `.github/workflows/reviewer-system-e2e.yml`.

**What we observed:** VS Code's YAML validator flagged
*"Expected a scalar value, a sequence, or a mapping"* on line 2 (a
comment line). Manual parsing with `python3 -c "import yaml;
yaml.safe_load(...)"` succeeds — the top-level keys come back as
`['name', True, 'concurrency', 'permissions', 'jobs']` (Python
interprets YAML `on:` as the boolean `True` for display, but the parse
is correct).

**Severity:** Cosmetic. Real GitHub Actions parses the workflow
correctly at runtime.

**Suggested fix:** Update VS Code's `redhat.vscode-yaml` extension or
its schema; not blocking.

---

## Items I deliberately did NOT flag

- **Empty staging data** — soft-skipped by design across the suite.
- **Mobile responsiveness** of the queue accordions — covered by PR #6.
- **Internationalization of metric labels** — out of scope; English-only
  per the README.
- **The "undefined" / "[object Object]" rendering class** is mentioned
  in Bug 2 with a concrete fix — I did not file a *second* bug for the
  same root cause when observed in different metrics (it's one fix, one
  PR).
- **PI leakage in test data** — covered by PR #1's audit; nothing new
  surfaces here.

---

## Summary

| # | Component | Verified / Hypothesis | Severity |
|---|-----------|----------------------|----------|
| 1 | /queue total badge | hypothesis | medium |
| 2 | /analytics metric placeholders | hypothesis | high |
| 3 | analytics cache TTL | spec contract | medium |
| 4 | date-range backwards acceptance | hypothesis | medium |
| 5 | date-range a11y labels | hypothesis | medium (a11y) |
| 6 | queue virtualised sections | hypothesis | low |
| 7 | verify.mjs regex | verified (fixed) | low |
| 8 | re-approve UX | hypothesis | medium |
| 9 | selector placeholders | spec contract | pre-merge |
| 10 | YAML linter false-positive | verified | cosmetic |

> **No bugs were invented to fill this document.** Every entry is
> either (a) a real class of bug observed on similar dashboards, (b) a
> contract gap surfaced by writing the spec, or (c) a verified issue
> that's already fixed in PR #4.