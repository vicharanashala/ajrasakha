# PR #3 — Approval → GDB, stuck-question indicator, reputation scoring

## 📌 Title

```
test(reviewer-system): add final-approval/GDB, stuck-question, and reputation E2E tests
```

---

## 🚀 One-line summary

> Adds reviewer-system moderator E2E coverage for final approval, Golden Database confirmation, stuck-question visibility, hover context, and expert reputation scoring across 11 atomic tests.

---

## 📎 Depends on PR #1

This PR is stacked on top of PR #1 (`test(reviewer-system-moderator-pr1)`).
It reuses PR #1's moderator fixtures and page objects (`LoginPage`,
`QuestionQueuePage`, `QuestionDetailPage`).

> Mark this PR as "blocked by / requires" PR #1 in your git host UI.

The PR #1 contract also drives PR #3's centralised selector map,
soft-skip behavior for empty shared staging data, and fallback action
button lookup logic.

---

## 🎯 Why this PR

The moderator's final approval path is the last gate before questions
enter the Golden Database.  If this approval flow is broken, correct
answers may never become queryable in the GDB, and overdue questions can
remain hidden behind stale queue state.

This PR adds coverage for:

- final approval and closed status transition
- GDB confirmation / moved-to-GDB success feedback
- reject/send-back behavior when available
- stuck question indicators for overdue review work
- stuck indicator hover context when supported
- expert reputation delta after approval
- weaker reputation change behavior after reject actions

---

## ✨ What this PR contains

### A. Final approval → GDB entry

Adds moderator tests to verify:

- APP-01: a fully-reviewed question awaiting final approval is visible
- APP-02: the moderator can approve the final answer, the status closes,
  and re-approval is not possible
- APP-03: approval surfaces a GDB confirmation message or equivalent
- APP-04: reject/send-back is available when staging exposes it, and the
  question returns to a reviewable status instead of closing

### B. Stuck-question indicator

Adds queue tests to verify:

- APP-05: overdue questions show a stuck indicator
- APP-06: questions within SLA do not show the stuck indicator
- APP-07: hovering the stuck indicator reveals contextual details when
  supported by the UI

### C. Reputation scoring

Adds expert reputation tests to verify:

- APP-08: approval updates expert reputation score in a non-decreasing way
- APP-09: reject actions do not appear to increase reputation in the same
  way as approvals, when the system distinguishes them

---

## 📌 Data dependencies

### Block B — stuck-question indicator

These tests depend on staging exposing queue rows with the following states:

- a row that is already overdue / stuck according to the UI's SLA rules
- a row that is still within SLA and does not show the stuck indicator

If CI skips these tests, reproduce by seeding a question with a backdated
`assigned_at` timestamp or enabling the staging fixture that exposes a
stuck row in the moderator queue.

### Block C — reputation scoring

These tests depend on staging exposing:

- a working expert account with `EXPERT_TEST_EMAIL` / `EXPERT_TEST_PASSWORD`
- the expert profile API at `/users/me` returning `reputation_score`
- review actions that update reputation after approval or rejection

If CI skips these tests, verify the expert credentials and the `/users/me`
reputation endpoint on staging before rerunning.

---

## 🧪 How to run

```bash
cd qa
cp .env.example .env && $EDITOR .env
pnpm install
pnpm exec playwright install --with-deps chromium

pnpm exec playwright test --project=reviewer --config=playwright.config.ts \
  tests/reviewer-system/moderator/approval-and-scoring.spec.ts
```

---

## Files changed

- `qa/tests/reviewer-system/moderator/approval-and-scoring.spec.ts`
- `qa/tests/reviewer-system/page-objects/QuestionDetailPage.ts`
- `qa/tests/reviewer-system/page-objects/QuestionQueuePage.ts`
- `qa/tests/reviewer-system/page-objects/selector-map.ts`
- `PR_DESCRIPTION_PR3.md`
