# AjraSakha – Project 2: Web App Frontend Testing

## Objective
To automate testing of the AjraSakha farmer-facing web application using Playwright, TypeScript and GitHub Actions.

## Test Cases

| ID | Test Case | Expected Result |
|---|---|---|
| TC01 | Open the website | Website loads successfully |
| TC02 | Submit an English query | Relevant response is displayed |
| TC03 | Submit a Hindi query | Response is displayed in Hindi |
| TC04 | No GDB match | 2-hour disclaimer appears in the farmer's language |
| TC05 | Submit query on mobile | Query is submitted successfully |
| TC06 | Use voice input | Voice input is captured and submitted |
| TC07 | No internet connection | Appropriate error is displayed |
| TC08 | Server error | Appropriate error message is displayed |
| TC09 | Submit empty query | Empty query is handled correctly |
| TC10 | Switch language mid-session | Language changes correctly |

## Tools Used
- Playwright
- TypeScript
- Node.js
- GitHub Actions

## Testing Requirements
- Minimum 40 end-to-end tests.
- Desktop and mobile viewport coverage.
- Automated test execution using GitHub Actions.
- Bug report for identified issues.

## Current Progress

- Playwright installed and configured successfully.
- TypeScript test environment configured.
- Staging website URL configured.
- Six test specification files implemented.
- Chromium test execution completed successfully.
- All tests in the current Chromium run passed.
- HTML test report generated successfully.
- GitHub Actions workflow created and changes pushed to GitHub.

**Remaining Work:**
- Expand the suite to meet the minimum 40 meaningful end-to-end tests.
- Implement and verify actual functional scenarios.
- Complete account-dependent testing where access is available.