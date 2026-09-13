# Playwright Test Investigation Log

This document tracks Playwright test failures encountered during automation development, along with their investigation, findings, and current status.

---

# QDET-002 — Selected question details remain visible after a browser reload

## Test

**File**

```
tests/dashboard-question-details.spec.ts
```

**Current Test Name**

```
QDET-002 selected question details remain visible after a browser reload
```

---

## Current Implementation

```ts
await dashboardPage.openAllQuestions();

const selected = await dashboardPage.openFirstQuestion();

await questionDetailsPage.expectQuestionText(selected.question);

await authenticatedPage.reload();

await questionDetailsPage.expectQuestionText(selected.question);
```

---

## Execution

```bash
pnpm exec playwright test -g "QDET-002" --headed --debug
```

---

## Result

**Status**

❌ Failed

---

## Failure

```
Error:
expect(locator).toHaveText(expected) failed

Locator:
getByRole('heading', { level: 1 })

Expected:
E2E_AJ_1782374979328 My paddy crop leaves are turning yellow, what should I do?

Error:
element(s) not found
```

---

## Investigation

### Reload Behaviour

After refreshing the browser:

- Question details disappear.
- User is returned to the **All Questions** view.
- URL remains unchanged.
- Previously selected question is lost.

Current behaviour:

```
Question Details
        │
        ▼
Browser Reload
        │
        ▼
All Questions
```

Expected behaviour (per test):

```
Question Details
        │
        ▼
Browser Reload
        │
        ▼
Question Details
```

---

## Root Cause

The failure is **not** caused by:

- incorrect Playwright locator
- timing issue
- synchronization issue

The failure occurs because the application does not preserve the selected question after a browser reload.

---

## Current Status

| Item                | Status                                             |
| ------------------- | -------------------------------------------------- |
| Reload verification | Added                                              |
| Test result         | Failing                                            |
| Root cause          | Application returns to question list after refresh |

---

## Next Steps

Await confirmation from the development team whether:

- question selection should persist across browser reloads,
  _or_
- returning to the question list is the intended application behaviour.

---

---

# Future Investigations

Add subsequent failing test investigations below using the same structure.

## TEST-ID

### Status

### Failure

### Investigation

### Root Cause

### Resolution

---
