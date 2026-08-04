
## EAW-M001 — Moderator can access Expert Manual Allocation workflow

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that a moderator can successfully reach the Expert Allocation section after creating a new question. This serves as a smoke test for the manual allocation workflow.

### Preconditions

* Moderator account exists and is authenticated.
* A valid question is created during test setup.
* Moderator opens the created question.

### Test Flow

1. Login as moderator.
2. Navigate to **All Questions**.
3. Create a valid question.
4. Open the created question.
5. Navigate to the Allocation Queue.
6. Verify that the queue is rendered correctly.

### Assertions

* Allocation Queue heading is visible.
* Expert count is visible.
* Auto-allocate Experts toggle is visible.
* At least one expert allocation card is visible.
* Expert information is displayed.
* Expert status badge is displayed.

### Implementation

* `fixtures/moderator.fixture.ts`
* `pages/moderator/dashboard.page.ts`
* `pages/moderator/create-question.page.ts`
* `pages/moderator/allocation-queue.page.ts`
* `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

