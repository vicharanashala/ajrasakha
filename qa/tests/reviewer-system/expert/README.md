# Reviewer System — Expert (`tests/reviewer-system/expert/`)

End-to-end coverage of the **expert's** workflow: reviewing an allocated
question, drafting the answer, submitting for peer review, and (after
approval) pushing the final answer into the Golden Database.

## Coverage (PR #2)

| # | ID | Behaviour |
|---|----|-----------|
| 1 | EXP-01 | Expert logs in with valid credentials and lands on `/expert/inbox` |
| 2 | EXP-02 | Allocated question (from PR #1) appears in the expert inbox with correct row metadata (language, deadline / SLA) |
| 3 | EXP-03 | Opening a question renders the farmer's original query and the optional AI-prefilled draft |
| 4 | EXP-04 | Expert writes an answer and submits it for review — "submitted" toast confirms the round-trip |
| 5 | EXP-05 | Submitting an empty answer is blocked with a visible validation error; the form does NOT navigate away |
| 6 | EXP-06 | After submission the question's status badge moves into the next pipeline stage ("pending review" / "under second review" / "awaiting approval" — accepted as a regex union) |
| 7 | EXP-07 | Submission hands the question off to the next reviewer (dual-assertion: visible toast OR outbound `/notifications | /handoff | /review-request` network call) |
| 8 | EXP-08 | Expert saves a draft answer; draft persists after a page reload |
| 9 | EXP-09 | Expert cannot open or act on a question allocated to another expert (403 / redirect / permission-denied region) |
| 10 | EXP-10 | Expert can view their own past submissions on `/expert/history` |

Every test is **atomic** (one behaviour, no multi-assert), uses
`test.step()` for readable CI output, and **soft-skips** when shared
staging data is empty rather than hard-failing the suite.

## Independent setup

Every test pulls in the `allocatedQuestion` fixture from
`fixtures/expert-fixtures.ts`.  That fixture:

1. spins up an isolated browser context (so parallel specs don't fight
   for the main `page`),
2. logs in as the moderator using the PR #1 page objects,
3. allocates the first available pending question to the configured
   expert.

There is **no dependency on PR #1's spec having run first** — each test
can be selected individually (`--grep EXP-04`) or run in parallel
(`--workers > 1`).

The fixture falls back to driving the moderator UI from a separate
browser context because the Reviewer System frontend
(`desk.vicharanashala.ai`) does not currently expose a public staging
allocation API.  See `fixtures/expert-fixtures.ts` for the full
rationale and the swap-in path when an API lands.

## Files in this folder

```
expert/
├── README.md                            [UPDATED in PR #2]
└── answer-and-handoff.spec.ts           [NEW — 10 EXP-* tests]
```

## Page objects (added in PR #2)

```
page-objects/
├── ExpertInboxPage.ts        — /expert/inbox          (assigned-questions view)
├── ExpertAnswerPage.ts       — /expert/inbox/:id      (write / submit / draft)
└── ExpertHistoryPage.ts      — /expert/history        (past submissions)
```

All selectors are centralised in `page-objects/selector-map.ts` under
`SELECTOR_MAP.expert.*`.  Each entry is marked `// TODO(selector)` until
the staging DOM is confirmed — once real `data-testid` values land,
swap them in the map and every EXP-* test picks them up.

## Why this folder sits beside `moderator/`

The Reviewer pipeline is a relay: **moderator → expert → reviewer (peer) →
GDB**.  Keeping each role's specs in its own folder makes it obvious which
step a failing test belongs to, even when the trace.zip is the only signal
the on-call has.

## Out of scope for PR #2 (planned for later PRs)

* **Re-allocation back to moderator** — lands in PR #3 alongside the
  peer-reviewer flow.
* **Expert reputation score updates** — lands in PR #5 with analytics.
* **Mobile viewport pass + a11y baseline** — PR #6 runs the expert
  suite against the `reviewer-mobile` project + axe-core gate.
* **AI draft acceptance** ("use AI draft as starting point") — pending
  product decision; will be a new EXP-* test in a follow-up PR.
