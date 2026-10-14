# Project 1: Reviewer System Frontend Testing Report

## Overview
This report outlines the testing infrastructure and test cases implemented for the ACE Reviewer System frontend. The goal was to ensure the integrity of the SLA countdown mechanics and establish a visual regression testing safety net.

## 1. Unit Testing (Vitest)
Implemented 25 comprehensive unit tests targeting the core timing logic and edge cases for the SLA countdown mechanics. 

**Files Tested:**
- `src/utils/getTimerStartTime.test.ts`
- `src/hooks/ui/useCountdown.test.ts`

**Key Coverage Areas:**
- **Null/Undefined Safety:** Verified the system doesn't crash when passing empty objects, null, or undefined dates.
- **Hold Mechanics:** Validated `buildHoldCountdownOptions` correctly shifts the deadline forward based on `accumulatedHoldMs`.
- **Active Freezes:** Ensured the countdown properly pauses when a question is placed on active hold (`holdAt`).
- **Formatting:** Verified time wraps correctly using `% 24` logic for questions exceeding 24 hours.

*All 25 tests are passing successfully.*

## 2. Visual Regression Testing (Playwright)
Set up a dedicated `qa` environment using Playwright to protect the UI design from unexpected CSS or layout regressions.

**Setup:**
- Initialized Playwright in a dedicated `/qa` directory.
- Configured to test across both Desktop (Chromium) and Mobile viewports.

**Test Coverage:**
- Takes a "Golden Screenshot" of the local frontend.
- Performs pixel-by-pixel comparison on subsequent test runs to catch overlapping text, broken layouts, or styling bugs that standard E2E tests miss.

## How to Run the Tests

**To run Unit Tests:**
```bash
cd frontend
pnpm test
```

**To run Visual Regression Tests:**
```bash
# Ensure frontend is running on localhost:5173 first
cd qa
npx playwright test
```
