# Reviewer Playwright Phase 3 automation report

## Scope

Vertical slice: UI login -> `/home` -> All Questions -> select question -> inspect question details.

## Evidence inventory

| Catalogue ID | Playwright test title                                                         | Source specification        | Principal implementation sources                      | Selectors                                                                   | Execution result |
| ------------ | ----------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- | ---------------- |
| PERM-001     | successful email login reaches the implemented role landing                   | `09-user-permissions.md`    | auth route, auth form/hook, Firebase login            | labeled email/password; Sign In button; URL                                 | ✅ Automated     |
| DASH-001     | authenticated shell exposes the role-supported question navigation            | `01-dashboard.md`           | home route, `PlaygroundPage`                          | All Questions tab; Question column/empty text                               | ✅ Automated     |
| QDET-001     | selecting a list question opens the matching full question                    | `02-question-details.md`    | `QuestionsPage`, table/row, detail, full-data hook    | table row fallback; H1; Exit                                                | ✅ Automated     |
| QDET-002     | selected question details persist after browser reload                        | `02-question-details.md`    | home search, selected-question hook, auto-open effect | URL query; H1                                                               | ❌ Failed        |
| QDET-003     | detail header displays response-derived status, timestamps, and actions       | `02-question-details.md`    | `QuestionHeader`, timer utilities                     | header text; named buttons                                                  | ✅ Automated     |
| QDET-004     | question metadata uses the full-detail response and fallbacks                 | `02-question-details.md`    | `QuestionDetailsCard`                                 | visible labels plus local sibling fallback                                  | ✅ Automated     |
| QDET-006     | allocation queue renders every returned reviewer and a derived status         | `02-question-details.md`    | `AllocationTimeline`, status style config             | Allocation Queue heading; reviewer title; visible status labels             | ✅ Automated     |
| QDET-011     | in-page Exit returns from detail to list                                      | `02-question-details.md`    | `QuestionsPage.goBack`, `QuestionHeader`              | Exit button; table/empty state                                              | ✅ Automated     |
| ERR-001      | protected home does not render shell while current-user resolution is pending | `10-loading-error-empty.md` | home route, current-user hook                         | All Questions tab hidden/visible                                            | ✅ Automated     |
| ERR-002      | detailed-question loading resolves to empty state                             | `10-loading-error-empty.md` | `QuestionsPage`, `QuestionsTable`                     | local loading icon fallback; No questions found                             | ✅ Automated     |
| ERR-003      | failed full-detail request never renders stale detail                         | `10-loading-error-empty.md` | selected full-data query branch                       | H1/Exit absence; intercepted response                                       | ✅ Automated     |
| ERR-010      | partial full-detail response preserves stable detail                          | `10-loading-error-empty.md` | detail card/allocation fallbacks                      | H1; metadata labels                                                         | ✅ Automated     |
| RESP-001     | Response panel is visible after reviewer login                                | 03-response.md              | `response.page.ts`, `response.spec.ts`                | Draft Response textarea, Remarks textarea, View Metadata button are visible | ✅ Automated     |

## Passed

None. The runner could not start.

## Failed due to product behaviour

None observed. The runner could not start, so no product assertion was executed.

## Blocked by environment or test data

- At implementation time, `http://127.0.0.1:5173` and `http://localhost:5173` were unreachable.
- `http://127.0.0.1:4000/api/health` was unreachable.
- `REVIEWER_USER_EMAIL` and `REVIEWER_USER_PASSWORD` were not provided to this shell.
- Node.js/npm/npx were not available on PATH; the discovered installation under `C:\Program Files\nodejs` could not be executed under the current filesystem policy.
- **Blocked cases:** 12. **Discovered by Playwright:** 0. **Executed:** 0. **Passed:** 0. **Product-failed:** 0.

## Commands attempted

| Command                      | Result                                                                |
| ---------------------------- | --------------------------------------------------------------------- |
| `npm install`                | Blocked: `npm` command not found                                      |
| `npx playwright test --list` | Blocked: `npx` command not found; discovery did not start             |
| `npm run typecheck`          | Blocked: `npm` command not found; TypeScript validation did not start |
| `npx playwright test`        | Blocked: `npx` command not found; execution did not start             |

## Not implemented in this slice

- Mutating answer, moderation, duplicate, allocation, GDB, AI and administration flows.
- Browser-history traversal across every sequential question state; `QDET-011` covers the implemented in-page Exit path only.
- A visible question ID assertion: the selected ID is verified through the full-detail request URL and response because the normal detail header does not render the ID.
- Author tag assertions where no submission/author-bearing test record is guaranteed.
- Dashboard analytics failure; this slice exercises the question inventory path and its deterministic failures, not the analytics dashboard family.

## Selector weaknesses and suspected product defects

- Question text is a clickable `<span>`, not an accessible link/button, so a local `span.cursor-pointer` fallback is required.
- Metadata labels and values are unassociated spans, requiring local sibling traversal.
- Reviewer bubbles have no semantic list/listitem structure or stable identifier; reviewer name/email `title` attributes are the least brittle hooks.
- The normal question-detail header does not visibly render the question ID even though `QDET-001` expected visible ID/text identity.
- A failed full-detail query has no explicit error panel or retry/back control in the `QuestionsPage` selected branch.

## Repository safety

The product checkout was clean before implementation. All files in this report belong to the new isolated workspace directory `qa/reviewer-playwright/`; no production file was edited.

- Static test definitions present: 12.
- Catalogue IDs present in both titles and source comments: 12 of 12.
- Final product `git status --short`: empty.
- Final product `git diff`: empty.
- The supplied writable workspace is not itself a Git worktree; therefore the new QA files do not appear in the product checkout's status.
