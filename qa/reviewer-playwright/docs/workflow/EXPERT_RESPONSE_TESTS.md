# Expert Response Workflow

## Scope

This document covers the **Expert Response Workflow** from the moderator and expert perspectives.

The workflow begins with a moderator creating a question, preparing its allocation, and manually assigning an expert. It then validates that the allocated expert can access the question, view the response form, interact with response controls, enter and reset response data, submit a response, and trigger the corresponding moderator-side status transition.

The workflow also covers the initial review handoff after the first expert submits an answer, including allocation of the remaining experts and verification that a second expert can access the review actions for the first expert's answer.

The workflow currently does **not** cover the complete Accept / Reject / Modify review actions. The review action controls are verified, but the underlying action dialogs and workflows require separate DOM verification and dedicated coverage.

Each test creates a fresh question during setup.

---

## ERW-M001 — Moderator prepares question for expert response

### Feature

Expert Response Workflow

### Purpose

Verify that the moderator successfully prepares a question for the expert response workflow and that the intended expert has been manually allocated.

### Preconditions

- Moderator account exists and is authenticated.
- A valid question can be created.
- An expert account is configured through `EXPERT_EMAIL`.

### Test Flow

1. Login as moderator.
2. Navigate to **All Questions**.
3. Create a new question.
4. Provide the required question metadata:
   - State: `Jammu And Kashmir`
   - District: `Rajouri`
   - Crop: `All Spice`
   - Season: `Winter`
   - Domain: `Fertilizer Use and Availability`
5. Submit the question.
6. Open the created question.
7. Open the Allocation Queue.
8. Disable **Auto Allocate Experts**.
9. Identify the automatically allocated expert.
10. Remove the automatically allocated expert.
11. Verify that the expert queue is empty.
12. Open **Select Experts**.
13. Select `EXPERT_EMAIL`.
14. Allocate the expert.
15. Verify that the expert appears in the queue.
16. Verify that the expert has **Waiting** status.

### Assertions

- The question is successfully created.
- The question is visible in the moderator dashboard.
- Allocation Queue is opened successfully.
- Auto-allocation can be disabled.
- The automatically allocated expert can be removed.
- The manually selected expert is allocated successfully.
- The allocated expert is visible in the queue.
- The allocated expert has **Waiting** status.

### Implementation

- `fixtures/workflow.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `pages/workflows/expert-allocation-section.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Status

✅ Passed

---

## ERW-M002 — Allocated expert logs in

### Feature

Expert Response Workflow

### Purpose

Verify that the manually allocated expert can successfully authenticate and reach the expert dashboard.

### Preconditions

- A question has been created.
- An expert has been manually allocated to the question.
- The expert account is configured and available for login.

### Test Flow

1. Login as the allocated expert.
2. Wait for the expert dashboard shell to load.

### Assertions

- Expert login succeeds.
- Expert is redirected to the expected dashboard.
- Expert dashboard shell is visible.

### Implementation

- `fixtures/workflow.fixture.ts`
- `pages/expert/dashboard.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Status

✅ Passed

---

## ERW-M003 — Allocated expert can view assigned question

### Feature

Expert Response Workflow

### Purpose

Verify that the allocated expert can see the question assigned to them and open it in the Response panel.

### Preconditions

- Expert is authenticated.
- The question has been allocated to the expert.

### Test Flow

1. Wait for the expert dashboard shell.
2. Wait for the created question to appear in the queue.
3. Open the question.
4. Verify the current query in the Response panel.

### Assertions

- The assigned question is visible to the expert.
- The expert can open the question.
- The Response panel displays the selected question as the **Current Query**.

### Implementation

- `pages/expert/dashboard.page.ts`
- `pages/expert/response.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Notes

The My Queue workflow does not navigate to a separate question-details route. Selecting a question updates the Response panel's **Current Query** in place. Therefore, the Current Query value is used as the signal that the question has been opened.

### Status

✅ Passed

---

## ERW-M004 — Expert can access response form

### Feature

Expert Response Workflow

### Purpose

Verify that the allocated expert can open the assigned question and access the complete response form.

### Preconditions

- Expert is authenticated.
- The question is allocated to the expert.

### Test Flow

1. Wait for the expert dashboard shell.
2. Wait for the question to appear.
3. Open the question.
4. Verify the Current Query.
5. Verify that the Response panel is loaded.

### Assertions

- Assigned question is visible.
- Question can be opened.
- Current Query contains the expected question.
- Response form is rendered successfully.

### Implementation

- `pages/expert/dashboard.page.ts`
- `pages/expert/response.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Status

✅ Passed

---

# Response Panel Tests

The following tests execute with the question already open in the Response panel.

Before each test:

1. Wait for the expert dashboard shell.
2. Wait for the assigned question.
3. Open the question.
4. Verify the Current Query.

---

## ERW-M005 — Response panel controls are visible

### Feature

Expert Response Workflow

### Purpose

Verify that all expected controls of the Response panel are available after opening an assigned question.

### Preconditions

- Expert is authenticated.
- Assigned question is open in the Response panel.

### Test Flow

1. Open the assigned question.
2. Verify the Response panel is loaded.

### Assertions

- Response panel is visible.
- Expected response controls are rendered.

### Implementation

- `pages/expert/response.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Catalogue Reference

`03-response.md` — RESP-001

### Status

✅ Passed

---

## ERW-M006 — Expert can open the metadata dialog

### Feature

Expert Response Workflow

### Purpose

Verify that the expert can open and close the question metadata dialog from the Response panel.

### Preconditions

- Assigned question is open.
- Response panel is loaded.

### Test Flow

1. Open the metadata dialog.
2. Verify that the metadata dialog is displayed.
3. Close the metadata dialog.

### Assertions

- Metadata dialog opens successfully.
- Metadata dialog is visible.
- Metadata dialog can be closed successfully.

### Implementation

- `pages/expert/response.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Catalogue Reference

`03-response.md` — RESP-002

### Status

✅ Passed

---

## ERW-M007 — Metadata dialog displays all expected sections

### Feature

Expert Response Workflow

### Purpose

Verify that the metadata dialog contains all expected metadata sections.

### Preconditions

- Assigned question is open.
- Response panel is loaded.

### Test Flow

1. Open the metadata dialog.
2. Verify that the metadata dialog is displayed.
3. Verify all expected metadata sections.
4. Close the metadata dialog.

### Assertions

- Metadata dialog is visible.
- All expected metadata sections are displayed.
- Metadata dialog can be closed successfully.

### Implementation

- `pages/expert/response.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Catalogue Reference

`03-response.md` — RESP-003

### Status

✅ Passed

---

## ERW-M008 — Metadata dialog displays expected metadata field labels

### Feature

Expert Response Workflow

### Purpose

Verify that the metadata dialog displays the expected field labels.

### Preconditions

- Assigned question is open.
- Metadata dialog can be opened.

### Test Flow

1. Open the metadata dialog.
2. Verify that the metadata dialog is displayed.
3. Verify the expected metadata field labels.
4. Close the metadata dialog.

### Assertions

- Metadata dialog is visible.
- Expected metadata field labels are present.
- Metadata dialog can be closed successfully.

### Implementation

- `pages/expert/response.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Catalogue Reference

`03-response.md` — RESP-004

### Status

✅ Passed

---

## ERW-M009 — Metadata dialog displays populated metadata values

### Feature

Expert Response Workflow

### Purpose

Verify that the metadata fields contain populated values for the selected question.

### Preconditions

- Assigned question is open.
- Metadata dialog is available.

### Test Flow

1. Open the metadata dialog.
2. Verify the metadata dialog is displayed.
3. Verify that the following fields contain values:
   - Source
   - Priority
   - Status
   - Total Answers
   - Created At
   - State
   - District
   - Crop
   - Normalized Crop
   - Season
   - Domain
4. Close the metadata dialog.

### Assertions

The following metadata fields contain populated values:

- **Source**
- **Priority**
- **Status**
- **Total Answers**
- **Created At**
- **State**
- **District**
- **Crop**
- **Normalized Crop**
- **Season**
- **Domain**

### Implementation

- `pages/expert/response.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Catalogue Reference

`03-response.md` — RESP-005

### Status

✅ Passed

---

## ERW-M010 — Expert can enter a draft response

### Feature

Expert Response Workflow

### Purpose

Verify that an expert can enter a response into the response field before submission.

### Preconditions

- Assigned question is open.
- Response panel is loaded.

### Test Flow

1. Enter the following draft response:

   `Playwright successfully entered this response.`

2. Verify the response field contains the entered text.

### Assertions

- Expert can enter text into the response field.
- Entered response is displayed correctly.

### Implementation

- `pages/expert/response.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Catalogue Reference

`03-response.md` — RESP-006

### Status

✅ Passed

---

## ERW-M011 — Expert can enter remarks

### Feature

Expert Response Workflow

### Purpose

Verify that an expert can enter remarks associated with the response.

### Preconditions

- Assigned question is open.
- Response panel is loaded.

### Test Flow

1. Enter the following remarks:

   `Playwright successfully entered reviewer remarks.`

2. Verify that the remarks field contains the entered text.

### Assertions

- Expert can enter remarks.
- Entered remarks are displayed correctly.

### Implementation

- `pages/expert/response.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Catalogue Reference

`03-response.md` — RESP-007

### Status

✅ Passed

---

## ERW-M012 — Reset clears draft response and remarks

### Feature

Expert Response Workflow

### Purpose

Verify that the Reset action clears both the draft response and remarks.

### Preconditions

- Assigned question is open.
- Response panel is loaded.

### Test Flow

1. Enter a draft response:

   `Playwright draft response.`

2. Enter remarks:

   `Playwright remarks.`

3. Click **Reset**.
4. Verify that the response field is empty.
5. Verify that the remarks field is empty.

### Assertions

- Draft response is cleared.
- Remarks are cleared.
- Reset does not leave previously entered text in either field.

### Implementation

- `pages/expert/response.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Catalogue Reference

`03-response.md` — RESP-008

### Status

✅ Passed

---

## ERW-M013 — Submit button is enabled after entering a draft response

### Feature

Expert Response Workflow

### Purpose

Verify that the Submit button transitions from disabled to enabled once a response has been entered.

### Preconditions

- Assigned question is open.
- Response panel is loaded.

### Test Flow

1. Verify that the Submit button is initially disabled.
2. Enter:

   `Test response`

3. Verify the Submit button is enabled.

### Assertions

- Submit button is initially disabled.
- Entering a draft response enables the Submit button.

### Implementation

- `pages/expert/response.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Catalogue Reference

`03-response.md` — RESP-009

### Status

✅ Passed

---

## ERW-M014 — Expert can submit a response and the form resets

### Feature

Expert Response Workflow

### Purpose

Verify the complete response submission flow and ensure that the response form is reset after successful submission.

### Preconditions

- Assigned question is open.
- Response panel is loaded.

### Test Flow

1. Enter:

   `Playwright successfully submitted this response.`

2. Add a source reference of type **State**.
3. Verify that the Submit button is enabled.
4. Click **Submit**.
5. Confirm the submission.
6. Verify the submission success state.
7. Verify that the draft response field is empty.

### Assertions

- Response can be entered.
- Source reference can be added.
- Submit button becomes enabled.
- Submission confirmation can be completed.
- Successful submission notification/state is displayed.
- Response field is reset after successful submission.

### Implementation

- `pages/expert/response.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Catalogue Reference

`03-response.md` — RESP-010 + RESP-011

### Notes

RESP-010 and RESP-011 are intentionally merged into a single end-to-end test because the complete submission workflow naturally validates both the submission action and the post-submission form reset.

### Status

✅ Passed

---

# Post-Submission Workflow

The following tests execute after the first expert has submitted an answer.

The shared setup performs the following:

1. Opens the assigned question.
2. Enters:

   `Playwright automated answer for the review workflow.`

3. Adds a **State** source reference.
4. Verifies that Submit is enabled.
5. Submits the response.
6. Confirms the submission.
7. Verifies successful submission.

---

## ERW-M015 — Moderator sees the expert's status change to Answer Created

### Feature

Expert Response Workflow

### Purpose

Verify that the moderator sees the allocated expert's status transition from the initial state to **Answer Created** after the expert submits a response.

### Preconditions

- Moderator has created the question.
- Expert is manually allocated.
- Expert has submitted an answer.
- Moderator's existing Allocation Queue view may contain stale data.

### Test Flow

1. Expert submits a response.
2. Exit the moderator's current Question Details view.
3. Return to the question through the moderator dashboard.
4. Open the same question.
5. Verify that the Allocation Queue is displayed.
6. Verify the expert status.

### Assertions

- Question can be reopened by the moderator.
- Allocation Queue is displayed.
- Allocated expert status is **Answer Created**.

### Implementation

- `pages/moderator/question-details.page.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Notes

The moderator's page is intentionally re-navigated to the same question after the expert submits because the previously displayed Allocation Queue can contain stale data.

The test exits Question Details and reopens the question from the All Questions flow rather than relying on the in-page refresh button. The existing refresh action navigates back to the All Questions list instead of keeping the moderator on the Allocation Queue view.

### Status

✅ Passed

---

## ERW-M016 — Moderator allocates the remaining experts to the queue

### Feature

Expert Response Workflow

### Purpose

Verify that the moderator can allocate the remaining configured experts after the first expert has submitted an answer.

### Preconditions

- First expert has submitted an answer.
- The first expert remains allocated.
- Additional expert accounts are configured in the environment.

### Test Flow

1. Identify the remaining configured experts:
   - `EXPERT_EMAIL_2`
   - `EXPERT_EMAIL_3`
   - `EXPERT_EMAIL_4`
   - `EXPERT_EMAIL_5`
   - `EXPERT_EMAIL_6`
   - `EXPERT_EMAIL_7`
   - `EXPERT_EMAIL_8`
2. Open **Select Experts**.
3. Select all remaining experts.
4. Allocate the selected experts.
5. Verify allocation success.
6. Verify each expert appears in the Allocation Queue.

### Assertions

- Remaining experts can be selected together.
- Allocation succeeds.
- Each remaining expert is visible in the Allocation Queue.

### Implementation

- `pages/workflows/expert-allocation-section.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Notes

The current environment contains eight configured experts in total:

- `EXPERT_EMAIL`
- `EXPERT_EMAIL_2`
- `EXPERT_EMAIL_3`
- `EXPERT_EMAIL_4`
- `EXPERT_EMAIL_5`
- `EXPERT_EMAIL_6`
- `EXPERT_EMAIL_7`
- `EXPERT_EMAIL_8`

`EXPERT_EMAIL_9` and `EXPERT_EMAIL_10` are not currently configured. If additional experts are required, their accounts must first be added to `.env` and `config/accounts.js`.

### Status

✅ Passed

---

# Review Handoff

The following tests execute after the remaining experts have been allocated.

Before each test in this section:

1. Open the Expert Selection dialog.
2. Select experts 2 through 8.
3. Allocate them.
4. Verify each allocated expert appears in the Allocation Queue.

---

## ERW-M017 — Second expert sees review actions for the first expert's answer

### Feature

Expert Response Workflow

### Purpose

Verify that a second allocated expert can access the first expert's submitted answer and see the available review actions.

### Preconditions

- First expert has submitted an answer.
- Remaining experts have been allocated.
- Second expert is configured and can log in.
- The question is available in the second expert's queue.

### Test Flow

1. Allocate the remaining experts.
2. Login as the second expert.
3. Wait for the second expert dashboard shell.
4. Wait for the question to appear.
5. Open the question.
6. Verify the review actions are visible.
7. Open **View Details**.

### Assertions

- Second expert can access the question.
- Review panel is displayed.
- Review actions are visible.
- **View Details** can be opened successfully.

### Implementation

- `pages/expert/dashboard.page.ts`
- `pages/expert/review-panel.page.ts`
- `tests/workflows/expert-response-workflow.spec.ts`

### Notes

This test currently validates only the review controls and the **View Details** interaction.

The following actions are **not yet covered** by this test:

- Accept
- Reject
- Modify

The corresponding action dialogs require additional DOM verification before dedicated tests can be implemented.

### Status

✅ Passed
