# Expert Review Workflow

## Scope

This document covers the **Expert Review Workflow** for reviewing an answer submitted by the first expert.

The workflow begins with a moderator creating a question, preparing the allocation queue, manually allocating two experts, and having the first expert submit an answer.

The second expert then reviews the submitted answer through the Review Panel.

The workflow covers:

- Accessing the review panel
- Viewing answer details
- Expanding comments
- Viewing answer metadata
- Accepting an answer
- Verifying acceptance-related state changes
- Opening the rejection dialog
- Viewing rejection criteria
- Enabling and disabling rejection criteria
- Resetting rejection criteria
- Value Addition / Insight rejection restrictions
- Rejection reason validation
- Submitting a rejection
- Removing a rejected question from the review queue

---

# Test Setup

## Common Preconditions

Before every test, the workflow creates and prepares a fresh question.

### Question

A unique question is generated using:

`PW_REVIEW_${Date.now()}`

### Question Metadata

The following values are used:

| Field    | Value                           |
| -------- | ------------------------------- |
| State    | Jammu And Kashmir               |
| District | Rajouri                         |
| Crop     | All Spice                       |
| Season   | Winter                          |
| Domain   | Fertilizer Use and Availability |

### Initial Allocation Flow

1. Login as moderator.
2. Open **All Questions**.
3. Open the Create Question dialog.
4. Create the question with the required metadata.
5. Submit the question.
6. Verify that the question was created.
7. Verify that the question is visible.
8. Open the created question.
9. Open the Allocation Queue.
10. Disable expert auto-allocation.
11. Identify the automatically allocated expert.
12. Remove the automatically allocated expert.
13. Verify that the expert queue is empty.

### Expert Allocation

Two experts are then manually allocated.

#### Expert 1

1. Open Select Experts.
2. Select `EXPERT_EMAIL`.
3. Allocate the expert.
4. Verify that Expert 1 is allocated.

#### Expert 2

1. Open Select Experts.
2. Select `EXPERT_EMAIL_2`.
3. Allocate the expert.
4. Verify that Expert 2 is allocated.

### Expert 1 Response

Expert 1 then:

1. Opens the assigned question.
2. Verifies the Current Query.
3. Enters:

   `Playwright automated review answer.`

4. Adds a **State** source reference.
5. Verifies that Submit is enabled.
6. Submits the response.
7. Confirms the submission.
8. Verifies the submission success state.

At this point, the question contains an answer submitted by Expert 1 and is ready for review by Expert 2.

---

# ERW-R001 — Second expert can view the review panel

### Feature

Expert Review Workflow

### Purpose

Verify that the second expert can access the question containing the first expert's answer and view the Review Panel.

### Preconditions

- Question has been created.
- Expert 1 has submitted an answer.
- Expert 2 has been allocated.
- Expert 2 is authenticated.

### Test Flow

1. Wait for the Expert 2 dashboard shell.
2. Wait for the question to appear.
3. Open the question.
4. Verify that review actions are visible.

### Assertions

- Expert 2 can access the assigned question.
- The Review Panel is displayed.
- Review actions are visible.

### Status

Implemented

---

# ERW-R002 — Expert can view answer details

### Feature

Expert Review Workflow

### Purpose

Verify that the second expert can view detailed information about the first expert's answer.

### Test Flow

1. Wait for the Expert 2 dashboard shell.
2. Wait for the question.
3. Open the question.
4. Verify that review actions are visible.
5. Open **View Details**.

### Assertions

- Review actions are visible.
- View Details can be opened successfully.

### Status

Implemented

---

# ERW-R003 — Expert can expand comments

### Feature

Expert Review Workflow

### Purpose

Verify that the second expert can expand the comments section associated with the answer.

### Test Flow

1. Wait for the Expert 2 dashboard shell.
2. Wait for the question.
3. Open the question.
4. Expand the comments section.
5. Verify that comments are expanded.

### Assertions

- Comments can be expanded.
- Expanded comments state is displayed correctly.

### Status

Implemented

---

# ERW-R004 — Expert can view answer metadata

### Feature

Expert Review Workflow

### Purpose

Verify that the second expert can access the metadata associated with the answer.

### Test Flow

1. Wait for the Expert 2 dashboard shell.
2. Wait for the question.
3. Open the question.
4. Open the metadata dialog.
5. Verify that the metadata dialog is visible.
6. Close the metadata dialog.

### Assertions

- Metadata dialog can be opened.
- Metadata dialog is visible.
- Metadata dialog can be closed.

### Status

Implemented

---

# ERW-R005 — Review actions remain available after closing details

### Feature

Expert Review Workflow

### Purpose

Verify that closing the answer details does not remove the available review actions.

### Test Flow

1. Wait for the Expert 2 dashboard shell.
2. Wait for the question.
3. Open the question.
4. Open **View Details**.
5. Close View Details.
6. Verify that review actions are still visible.

### Assertions

- View Details can be opened.
- View Details can be closed.
- Review actions remain available after closing details.

### Status

Implemented

---

# Acceptance Workflow

The following tests cover the acceptance flow for the second expert.

---

# ERW-R006 — Expert can open the accept confirmation dialog

### Feature

Expert Review Workflow

### Purpose

Verify that the second expert can open the acceptance confirmation dialog.

### Test Flow

1. Wait for the Expert 2 dashboard shell.
2. Wait for the question.
3. Open the question.
4. Open the Accept dialog.

### Assertions

- Accept action can be initiated.
- Acceptance confirmation dialog opens.

### Status

Implemented

---

# ERW-R007 — Acceptance criteria are displayed

### Feature

Expert Review Workflow

### Purpose

Verify that the acceptance dialog displays the expected acceptance criteria.

### Test Flow

1. Open the question.
2. Open the Accept dialog.
3. Verify that acceptance criteria are visible.

### Assertions

- Acceptance dialog is displayed.
- Acceptance criteria are visible.

### Status

Implemented

---

# ERW-R008 — Acceptance criteria are enabled by default

### Feature

Expert Review Workflow

### Purpose

Verify that all acceptance criteria are enabled when the acceptance dialog is initially opened.

### Test Flow

1. Open the question.
2. Open the Accept dialog.
3. Verify that all acceptance criteria are enabled.

### Assertions

- All acceptance criteria have an enabled state by default.

### Status

Implemented

---

# ERW-R009 — Confirm Accept button is enabled

### Feature

Expert Review Workflow

### Purpose

Verify that the Confirm Accept action is available when the acceptance dialog is ready.

### Test Flow

1. Open the question.
2. Open the Accept dialog.
3. Verify that the Confirm Accept button is enabled.

### Assertions

- Confirm Accept button is enabled.

### Status

Implemented

---

# ERW-R010 — Expert can accept an answer

### Feature

Expert Review Workflow

### Purpose

Verify that Expert 2 can accept the answer submitted by Expert 1.

### Test Flow

1. Open the assigned question.
2. Open the Accept dialog.
3. Verify that all acceptance criteria are enabled.
4. Confirm acceptance.
5. Verify that the question is removed from the expert's queue.

### Assertions

- Acceptance dialog can be opened.
- Acceptance criteria are enabled.
- Acceptance can be confirmed.
- Accepted question is removed from the expert's queue.

### Status

Implemented

---

# ERW-R011 — Moderator sees expert status as Approved

### Feature

Expert Review Workflow

### Purpose

Verify that the moderator sees the expert's status change after Expert 2 accepts the answer.

### Test Flow

### Expert 2

1. Wait for the Expert 2 dashboard shell.
2. Wait for the question.
3. Open the question.
4. Open the Accept dialog.
5. Confirm acceptance.

### Moderator

6. Exit the existing moderator Question Details view.
7. Reopen the same question from the moderator dashboard.
8. Verify that the Allocation Queue is displayed.
9. Verify the expert status.

### Assertions

- Expert 2 can accept the answer.
- Moderator can reopen the question.
- Allocation Queue is displayed.
- Expert status is:

`Approved`

### Important Implementation Note

The moderator page remains open after the expert accepts the answer, but the existing Question Details view contains stale allocation data.

Therefore, the test explicitly exits the Question Details view and reopens the question before checking the expert status.

### Status

Implemented

---

# ERW-R012 — Accepted question is removed from review queue

### Feature

Expert Review Workflow

### Purpose

Verify that the accepted question is removed from the second expert's review queue.

### Test Flow

1. Open the assigned question as Expert 2.
2. Open the Accept dialog.
3. Confirm acceptance.
4. Verify that the question is no longer present.

### Assertions

- Acceptance succeeds.
- Accepted question is removed from the review queue.

### Status

Implemented

---

# ERW-R013 — Next question becomes active after acceptance

### Feature

Expert Review Workflow

### Purpose

Verify that after accepting the current question, the next available question becomes active in the response/review interface.

### Test Flow

1. Open the assigned question.
2. Open the Accept dialog.
3. Confirm acceptance.
4. Verify that the Response panel is loaded.

### Assertions

- Acceptance succeeds.
- Response panel remains/returns to a loaded state.
- Next available question can become active.

### Status

Implemented

---

# ERW-R014 — Acceptance dialog closes after confirmation

### Feature

Expert Review Workflow

### Purpose

Verify that the acceptance dialog closes after acceptance is confirmed.

### Test Flow

1. Open the question.
2. Open the Accept dialog.
3. Confirm acceptance.
4. Verify that the Acceptance dialog is closed.

### Assertions

- Acceptance can be confirmed.
- Acceptance dialog is no longer visible.

### Status

Implemented

---

# Rejection Workflow

The following tests cover the rejection workflow.

---

# ERW-R015 — Expert can open the reject dialog

### Feature

Expert Review Workflow

### Purpose

Verify that Expert 2 can open the Reject Response dialog.

### Test Flow

1. Wait for the Expert 2 dashboard shell.
2. Wait for the question.
3. Open the question.
4. Open the Reject dialog.
5. Verify that the Reject dialog is visible.

### Assertions

- Reject action can be initiated.
- Reject Response dialog is displayed.

### Status

Implemented

---

# ERW-R016 — Reject dialog displays all review criteria

### Feature

Expert Review Workflow

### Purpose

Verify that the Reject Response dialog displays all available rejection criteria.

### Test Flow

1. Open the question.
2. Open the Reject dialog.
3. Verify that rejection criteria are visible.

### Expected Criteria

The rejection criteria include:

- Context & Relevance
- Technical Accuracy
- Practical Utility
- Value Addition / Insight
- Credibility & Trust
- Readability & Communication

### Assertions

- Reject Response dialog is visible.
- All expected review criteria are displayed.

### Status

Implemented

---

# ERW-R017 — Reject criteria are disabled by default

### Feature

Expert Review Workflow

### Purpose

Verify that all rejection criteria are initially disabled.

### Test Flow

1. Open the question.
2. Open the Reject dialog.
3. Verify the initial state of all rejection criteria.

### Assertions

- All rejection criterion toggles are disabled by default.

### Status

Implemented

---

# ERW-R018 — Rejection reason is required before submission

### Feature

Expert Review Workflow

### Purpose

Verify that a rejection reason is required before a rejection can be submitted.

### Test Flow

1. Open the question.
2. Open the Reject dialog.
3. Verify the rejection reason requirement.

### Assertions

- Rejection reason is required.
- Submission cannot proceed without the required reason.

### Status

Implemented

---

# ERW-R019 — Entering rejection reason enables submission

### Feature

Expert Review Workflow

### Purpose

Verify that entering a valid rejection reason enables the rejection submission action.

### Test Flow

1. Open the question.
2. Open the Reject dialog.
3. Enter:

   `The response does not provide sufficient technical accuracy.`

4. Verify that rejection submission is enabled.

### Assertions

- Rejection reason can be entered.
- Valid rejection reason enables the Submit Reject action.

### Status

Implemented

---

# ERW-R020 — Reject dialog can be cancelled

### Feature

Expert Review Workflow

### Purpose

Verify that Expert 2 can cancel the rejection workflow without submitting a rejection.

### Test Flow

1. Open the question.
2. Open the Reject dialog.
3. Cancel the rejection.

### Assertions

- Reject dialog can be cancelled.
- Rejection is not submitted.

### Status

Implemented

---

# ERW-R021 — Expert can enable a rejection criterion

### Feature

Expert Review Workflow

### Purpose

Verify that an expert can enable an individual rejection criterion.

### Test Flow

1. Open the question.
2. Open the Reject dialog.
3. Enable the **Technical Accuracy** criterion.

### Assertions

- Technical Accuracy criterion can be enabled.
- The criterion changes to the enabled state.

### Status

Implemented

---

# ERW-R022 — Expert can disable a rejection criterion

### Feature

Expert Review Workflow

### Purpose

Verify that an expert can disable a previously enabled rejection criterion.

### Test Flow

1. Open the question.
2. Open the Reject dialog.
3. Enable **Technical Accuracy**.
4. Disable **Technical Accuracy**.

### Assertions

- Technical Accuracy can be enabled.
- Technical Accuracy can subsequently be disabled.

### Status

Implemented

---

# ERW-R023 — Reset restores rejection criteria

### Feature

Expert Review Workflow

### Purpose

Verify that Reset restores all rejection criteria to their default disabled state.

### Test Flow

1. Open the question.
2. Open the Reject dialog.
3. Enable **Technical Accuracy**.
4. Enable **Practical Utility**.
5. Click Reset.
6. Verify that all rejection criteria are disabled.

### Assertions

- Multiple criteria can be enabled.
- Reset clears the selected criteria.
- All rejection criteria return to the disabled state.

### Status

Implemented

---

# ERW-R024 — Enabling Value Addition prevents rejection

### Feature

Expert Review Workflow

### Purpose

Verify the special rejection rule associated with **Value Addition / Insight**.

### Test Flow

1. Open the question.
2. Open the Reject dialog.
3. Enable **Value Addition / Insight**.
4. Verify the rejection warning.

### Expected Behavior

When **Value Addition / Insight** is enabled, the interface displays a warning indicating that the answer cannot be rejected while this criterion remains enabled.

### Assertions

- Value Addition / Insight can be enabled.
- The rejection warning is displayed.

### Status

Implemented

---

# ERW-R025 — Disabling Value Addition removes rejection warning

### Feature

Expert Review Workflow

### Purpose

Verify that disabling **Value Addition / Insight** removes the rejection restriction.

### Test Flow

1. Open the question.
2. Open the Reject dialog.
3. Enable **Value Addition / Insight**.
4. Verify that the rejection warning is displayed.
5. Disable **Value Addition / Insight**.
6. Verify that the rejection warning is hidden.

### Assertions

- Value Addition / Insight can be enabled.
- Rejection warning appears when enabled.
- Value Addition / Insight can be disabled.
- Rejection warning disappears after disabling it.

### Status

Implemented

---

# ERW-R026 — Reject button is disabled without reason and criteria

### Feature

Expert Review Workflow

### Purpose

Verify the initial invalid state of the rejection workflow when neither a rejection criterion nor a valid rejection reason has been provided.

### Test Flow

1. Open the question.
2. Open the Reject dialog.
3. Verify that all rejection criteria are disabled.
4. Verify that a rejection reason is required.

### Assertions

- No rejection criterion is selected.
- Rejection reason is required.
- Rejection cannot be submitted in the initial state.

### Status

Implemented

---

# ERW-R027 — Rejection can be submitted when a criterion and reason are provided

### Feature

Expert Review Workflow

### Purpose

Verify that the rejection submission action becomes available when a valid rejection criterion and rejection reason are provided.

### Test Flow

1. Open the question.
2. Open the Reject dialog.
3. Enable **Technical Accuracy**.
4. Enter:

   `The response does not provide sufficient technical accuracy.`

5. Verify that rejection submission is enabled.

### Assertions

- Technical Accuracy can be selected.
- A valid rejection reason can be entered.
- Submit Reject becomes enabled.

### Status

Implemented

---

# ERW-R029 — Rejected question is removed from review queue

### Feature

Expert Review Workflow

### Purpose

Verify that a question is removed from the second expert's review queue after the answer is rejected.

### Preconditions

- Question has been created.
- Expert 1 has submitted an answer.
- Expert 2 has been allocated.
- Expert 2 can access the Review Panel.
- Technical Accuracy can be selected as a rejection criterion.
- A valid rejection reason can be provided.

### Test Flow

1. Wait for the Expert 2 dashboard shell.
2. Wait for the question.
3. Open the question.
4. Open the Reject dialog.
5. Enable **Technical Accuracy**.
6. Enter:

   `The response does not provide sufficient technical accuracy.`

7. Submit the rejection.
8. Verify that the question is no longer present in the expert's queue.

### Assertions

- Reject dialog opens successfully.
- Technical Accuracy criterion can be enabled.
- Valid rejection reason can be entered.
- Rejection can be submitted.
- Rejected question is removed from the review queue.

### Result

❌ **Failed**

### Failure

The final assertion failed while checking that the rejected question was removed from the Expert 2 queue.

Expected:

```text
Question count = 0
```
