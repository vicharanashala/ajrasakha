# AjraSakha – Project 2 Test Execution Report

## 1. Project Information

| Field | Details |
|---|---|
| Project | AjraSakha – Project 2 |
| Testing framework | Playwright |
| Language | TypeScript |
| Backend | Node.js and Express |
| Database | MongoDB |
| CI tool | GitHub Actions |

## 2. Website E2E Testing

A suite of 40 website end-to-end test cases was developed.

### Coverage

- Website navigation
- Query submission
- Language handling
- Hindi and English scenarios
- Voice input
- Mobile scenarios
- Empty query handling
- Network failures
- Server errors
- Language switching

### Local execution results

| Metric | Result |
|---|---:|
| Test cases | 40 |
| Browser-specific executions | 200 |
| Passed | 200 |
| Failed | 0 |

## 3. Backend and API Testing

A separate suite of 46 functional API tests was executed against the MongoDB-backed backend.

### Test categories

| Test IDs | Test category | Count |
|---|---|---:|
| 1–10 | Question creation | 10 |
| 11–16 | Question validation | 6 |
| 17–26 | Answer creation | 10 |
| 27–33 | Answer validation | 7 |
| 34–40 | Retrieval and association | 7 |
| 41–46 | Disclaimer service logic | 6 |
| **Total** | | **46** |

### Local execution results

| Metric | Result |
|---|---:|
| API and functional tests | 46 |
| Passed | 46 |
| Failed | 0 |

Note: Disclaimer tests 41–46 directly test the service logic.

## 4. GitHub Actions Execution Results

The Playwright test suite was successfully executed through GitHub Actions.

### Browser execution breakdown

| Browser project | Passed | Failed |
|---|---:|---:|
| Chromium | 42 | 0 |
| Firefox | 42 | 0 |
| WebKit | 42 | 0 |
| Mobile Chrome | 42 | 0 |
| Mobile Safari | 42 | 0 |
| **Total** | **210** | **0** |

### API execution breakdown

| Project | Passed | Failed |
|---|---:|---:|
| API | 46 | 0 |

### Overall CI results

| Metric | Result |
|---|---:|
| Total executions | 256 |
| Passed | 256 |
| Failed | 0 |
| Skipped | 0 |
| Flaky | 0 |
| Duration | Approximately 2.1 minutes |
| Workers | 1 |

**Final result: 256/256 passed.**

### Latest CI execution

| Metric | Result |
|---|---:|
| Total test executions | 256 |
| Passed | 256 |
| Failed | 0 |
| Execution time | 2.1 minutes |
| Workers | 1 |

## 5. Test Result

**Overall CI status: PASSED**

All 256 test executions in the latest GitHub Actions run passed.

The exact distribution of those 256 executions across browser and API projects must be verified separately using the detailed Playwright report.

## 6. Test Artifacts

The following evidence is available:
- Successful GitHub Actions workflow run.
- Downloaded Playwright HTML report.
- Local browser test results.
- Local API test results.

## 7. Conclusion

The website E2E testing suite, backend functional testing suite and CI automation were executed successfully based on the recorded results.

No failed test executions were reported in the latest CI run.