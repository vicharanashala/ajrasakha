# Phase B — Core Moderation Pipeline (E2E Tests)

## Overview

Phase B adds Playwright E2E tests for three core moderation features accessible from the `/home` playground:
- **Dashboard** — admin overview, widgets, analytics tabs, golden dataset section, expert performance metrics
- **All Questions** — question table, advanced filters, view mode switching (Normal / Turn Around), question details panel, review level table, reallocation dialog
- **Queue & Review Flow** — expert question queue sidebar, question selection, response panel, preferences dialog, metadata dialog

All tests use mocked API routes (Firebase auth, performance, questions, QA interface endpoints), run headless Chromium, and rely on Zustand auth store pre-seeding to bypass login.

## Files Added

| File | Purpose |
|------|---------|
| `e2e/specs/04-dashboard.spec.ts` | 5 dashboard tests |
| `e2e/specs/05-all-questions.spec.ts` | 6 All Questions tests |
| `e2e/specs/06-review-flow.spec.ts` | 5 Queue & Review Flow tests |
| `e2e/pages/DashboardPage.ts` | Dashboard page object |
| `e2e/pages/QuestionsPage.ts` | All Questions page object |
| `e2e/pages/QAInterfacePage.ts` | QA Interface page object |
| `e2e/fixtures/questions.ts` | Mock data + route handlers for questions API |
| `e2e/fixtures/qa-interface.ts` | Mock data + route handlers for QA interface API |
| `e2e/fixtures/performance.ts` | Mock data + route handlers for dashboard/performance API |
| `playwright.config.ts` | Playwright configuration (Chromium-only, web server on `pnpm dev`) |

## Files Modified

| File | Change |
|------|--------|
| `e2e/pages/PlaygroundPage.ts` | Added `clickDashboard()`, `clickAllQuestions()`, `clickMyQueue()` methods |

## Test Coverage

| Spec | Tests | Status |
|------|-------:|--------|
| Dashboard (04) | 5 | PASS |
| All Questions (05) | 6 | PASS |
| Queue & Review Flow (06) | 5 | PASS |
| **Total** | **16** | **16/16 PASS** |

### Issues Fixed During Development

- **Glob route matching**: Playwright glob `**/api/questions/detailed*` failed to match actual request URLs with query strings. Replaced with function predicate `(url) => url.pathname.endsWith("/api/questions/detailed")`.
- **Mock data shape**: `IDetailedQuestionResponse` uses `questions` key (not `data`). Mock data must include all fields accessed by `<QuestionRow>` (`details.state`, `details.domain`, `totalAnswersCount`, etc.) to avoid runtime crashes.
- **Sidebar button clicks**: Buttons inside `div.sidebar-scroll-hidden` are outside Playwright's viewport and cannot be clicked even with `{ force: true }`. Fixed by using `evaluate(el => el.click())` to dispatch native DOM click events.
- **Accessible name mismatch**: The "View Metadata" button has `aria-label="View more details"` which overrides the accessible name. `getByRole("button", { name: "View Metadata" })` fails — must use `getByText("View Metadata")` instead.

## Final Result

**16/16 PASS** — All Phase B E2E tests passing on Chromium.
