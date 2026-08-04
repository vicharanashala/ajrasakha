# Scope

This document covers the **Expert Manual Allocation Workflow** from the moderator perspective. The workflow begins once a moderator has created a question and opened its **Allocation Queue**. It validates the manual allocation lifecycle, including opening the allocation dialog, selecting experts, allocating one or more experts, persistence of allocations, search functionality, dialog behaviour, validation handling, and expert deselection. It does **not** cover the expert response workflow, gatekeeper workflow, auditor workflow, or the auto-allocation algorithm itself. Tests assume a valid moderator session and a newly created question for each execution.

---

## EAW-M001 — Moderator can access Expert Manual Allocation workflow

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that a moderator can successfully reach the Expert Allocation section after creating a new question. This serves as a smoke test for the manual allocation workflow.

### Preconditions

- Moderator account exists and is authenticated.
- A valid question is created during test setup.
- Moderator opens the created question.

### Test Flow

1. Login as moderator.
2. Navigate to **All Questions**.
3. Create a valid question.
4. Open the created question.
5. Navigate to the Allocation Queue.
6. Verify that the queue is rendered correctly.

### Assertions

- Allocation Queue heading is visible.
- Expert count is visible.
- Auto-allocate Experts toggle is visible.
- At least one expert allocation card is visible.
- Expert information is displayed.
- Expert status badge is displayed.

### Implementation

- `fixtures/workflow.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M002 — Moderator disables Expert Auto Allocate

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that a moderator can disable automatic expert allocation and switch to manual allocation.

### Preconditions

- Moderator is on the Allocation Queue page.
- Auto-allocation is enabled.

### Test Flow

1. Open Allocation Queue.
2. Toggle **Auto-allocate Experts** off.

### Assertions

- Toggle changes from enabled to disabled.
- Manual allocation becomes available.

### Implementation

- `pages/moderator/allocation-queue.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M003 — Moderator sees Select Experts button

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that the **Select Experts** action becomes available after disabling auto-allocation.

### Preconditions

- Auto-allocation is disabled.

### Test Flow

1. Disable auto-allocation.
2. Observe the allocation section.

### Assertions

- Select Experts button is visible.
- Button is enabled.

### Implementation

- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M004 — Moderator opens Expert Selection dialog

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that clicking **Select Experts** opens the manual allocation dialog.

### Preconditions

- Auto-allocation is disabled.

### Test Flow

1. Disable auto-allocation.
2. Click **Select Experts**.

### Assertions

- Manual allocation dialog is displayed.
- Dialog heading is visible.

### Implementation

- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M005 — Moderator sees available experts

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that available experts are displayed inside the manual allocation dialog.

### Preconditions

- Manual allocation dialog is open.

### Test Flow

1. Open manual allocation dialog.
2. Inspect available expert list.

### Assertions

- At least one expert card is displayed.

### Implementation

- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M006 — Moderator sees dialog actions

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that the dialog exposes the expected action buttons.

### Preconditions

- Manual allocation dialog is open.

### Test Flow

1. Open dialog.

### Assertions

- Cancel button is visible.
- Submit button is visible.

### Implementation

- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M007 — Moderator cannot submit without selecting experts

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that submitting without selecting any expert is rejected.

### Preconditions

- Manual allocation dialog is open.
- No experts are selected.

### Test Flow

1. Open manual allocation dialog.
2. Leave all experts unselected.
3. Click **Submit**.

### Assertions

- Validation toast **"Experts list cannot be empty"** is displayed.

> **Note:** The current implementation keeps the Submit button enabled and performs validation after submission rather than disabling the action.

### Implementation

- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M008 — Moderator allocates selected expert

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that a moderator can manually allocate a single expert.

### Preconditions

- Auto-allocation is disabled.

### Test Flow

1. Open manual allocation dialog.
2. Select an expert.
3. Submit allocation.

### Assertions

- Allocation dialog closes successfully.

### Implementation

- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M009 — Allocated expert appears in Allocation Queue

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that the allocated expert is added to the queue.

### Preconditions

- Manual allocation completed successfully.

### Test Flow

1. Allocate an expert.
2. Return to Allocation Queue.

### Assertions

- Allocated expert email is displayed in the queue.

### Implementation

- `pages/moderator/allocation-queue.page.ts`
- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M010 — Newly allocated expert has Waiting status

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that a newly allocated expert starts in the **Waiting** state.

### Preconditions

- Manual allocation completed.

### Test Flow

1. Allocate an expert.
2. Observe expert status.

### Assertions

- Status badge displays **Waiting**.

### Implementation

- `pages/moderator/allocation-queue.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M011 — Moderator allocates multiple experts

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that multiple experts can be selected and allocated in one operation.

### Preconditions

- Auto-allocation disabled.

### Test Flow

1. Open dialog.
2. Select multiple experts.
3. Submit.

### Assertions

- Allocation completes successfully.
- Dialog closes.

### Implementation

- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M012 — Multiple experts appear in Allocation Queue

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that every selected expert appears after allocation.

### Preconditions

- Multiple experts allocated.

### Test Flow

1. Allocate multiple experts.
2. Inspect queue.

### Assertions

- Both allocated experts are displayed.

### Implementation

- `pages/moderator/allocation-queue.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M013 — Allocated experts persist after reopening question

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that manual allocations persist after leaving and reopening the question.

### Preconditions

- Expert has been manually allocated.

### Test Flow

1. Allocate an expert.
2. Exit Question Details.
3. Return to All Questions.
4. Reopen the same question.

### Assertions

- Previously allocated expert is still present.

### Implementation

- `pages/moderator/dashboard.page.ts`
- `pages/moderator/question-details.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M014 — Manual allocation appends experts to existing queue

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that manually allocated experts are appended to the existing queue rather than replacing existing allocations.

### Preconditions

- Auto-allocation is disabled.
- One expert is already present in the queue.

### Test Flow

1. Record the existing allocated expert.
2. Open manual allocation.
3. Allocate another expert.

### Assertions

- Original expert remains allocated.
- Newly selected expert is added.

### Notes

The currently assigned expert originates from the existing allocation logic. Once the auto-allocation algorithm is finalized, this test will additionally validate that the first expert corresponds to the lowest-workload selection.

### Implementation

- `pages/moderator/allocation-queue.page.ts`
- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M015 — Moderator closes dialog without allocating

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that closing the dialog does not modify allocations.

### Preconditions

- Manual allocation dialog is open.

### Test Flow

1. Open dialog.
2. Click Cancel.

### Assertions

- Dialog closes.
- Allocation Queue remains visible.

### Implementation

- `pages/workflows/expert-allocation-section.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M016 — Search preserves selected experts

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that selected experts remain selected after performing a search.

### Preconditions

- One expert has been selected.

### Test Flow

1. Select an expert.
2. Search for another expert.
3. Clear search.

### Assertions

- Previously selected expert remains selected.

### Implementation

- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M017 — Moderator can deselect expert before allocation

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that a selected expert can be deselected before submission.

### Preconditions

- Manual allocation dialog is open.

### Test Flow

1. Select an expert.
2. Verify the expert is selected.
3. Click the same expert again.
4. Submit without any selected experts.

### Assertions

- Expert becomes unselected.
- Validation toast **"Experts list cannot be empty"** is displayed after submission.

### Implementation

- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed

---

## EAW-M018 — Allocation dialog resets after successful allocation

### Feature

Expert Manual Allocation Workflow

### Purpose

Verify that reopening the dialog after a successful allocation starts with a fresh selection state.

### Preconditions

- An allocation has already been completed.

### Test Flow

1. Allocate an expert.
2. Reopen the manual allocation dialog.

### Assertions

- Previously selected expert is no longer selected.

### Implementation

- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-manual-allocation-workflow.spec.ts`

### Status

✅ Passed
