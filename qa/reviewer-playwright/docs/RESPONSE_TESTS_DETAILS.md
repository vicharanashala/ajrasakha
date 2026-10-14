## SCOPE

Expert UI login -> `/home` -> `My Queue & Allocated Questions` opened by default -> respond to question

### RESP-001 — Response panel is visible

**Feature**

Response Panel

**Purpose**

Verify that an authenticated reviewer lands on a page where the Response panel is rendered and ready for interaction.

**Preconditions**

- Reviewer is authenticated.
- Reviewer lands on the My Queue page.

**Test Flow**

1. Login as reviewer.
2. Wait for the reviewer shell to load.
3. Verify that the Response panel controls are available.

**Assertions**

- Draft Response textarea is visible.
- Remarks textarea is visible.
- View Metadata button is visible.

**Implementation**

- `pages/response.page.ts`
- `tests/response.spec.ts`

**Status**

✅ Passed

### RESP-002 — Expert can open the metadata dialog

**Feature**

Response Panel

**Purpose**

Verify that an expert can open and dismiss the Question Details metadata dialog from the Response panel.

**Preconditions**

- Reviewer is authenticated.
- Reviewer lands on the My Queue page.
- A question is already selected.

**Test Flow**

1. Login as reviewer.
2. Wait for the reviewer shell.
3. Click **View Metadata**.
4. Verify the metadata dialog opens.
5. Close the dialog.

**Assertions**

- Metadata dialog is displayed.
- Question Details title is visible.
- Dialog closes successfully.

**Implementation**

- `pages/response.page.ts`
- `tests/response.spec.ts`

**Status**

✅ Passed

### RESP-003 — Metadata dialog displays all expected sections

**Feature**

Response Panel

**Purpose**

Verify that the Question Details metadata dialog renders all expected sections after being opened.

**Preconditions**

- Reviewer is authenticated.
- Reviewer lands on the My Queue page.
- A question is selected.
- Metadata dialog can be opened.

**Test Flow**

1. Login as reviewer.
2. Wait for the reviewer shell to load.
3. Open the metadata dialog using the View Metadata button.
4. Verify the dialog is displayed.
5. Verify all expected metadata sections are rendered.
6. Close the dialog.

**Assertions**

- Metadata dialog is visible.
- Summary section is visible.
- Metadata section is visible.
- Details section is visible.
- Dialog closes successfully.

**Implementation**

- `pages/response.page.ts`
- `tests/response.spec.ts`

**Status**

✅ Passed

### RESP-004 — Metadata dialog displays expected metadata fields

**Feature**

Response Panel

**Purpose**

Verify that the Question Details metadata dialog displays all expected metadata field labels for the selected question.

**Preconditions**

- Reviewer is authenticated.
- Reviewer lands on the My Queue page.
- A question is selected.
- Metadata dialog is opened.

**Test Flow**

1. Login as reviewer.
2. Wait for the reviewer shell to load.
3. Open the metadata dialog.
4. Verify the metadata field labels are rendered.
5. Close the dialog.

**Assertions**

The Details section contains the following metadata fields:

- State
- District
- Crop
- Normalized Crop
- Season
- Domain

**Implementation**

Page Object

- `pages/response.page.ts`

Test

- `tests/response.spec.ts`

**Status**

✅ Passed

Here are the additions in the same format as your existing documentation.

---

## `03-response.md`

### RESP-005 — Metadata dialog displays populated metadata values

**Feature**

Response Panel

**Purpose**

Verify that every metadata field displayed in the Question Details dialog contains a populated value for the selected question.

**Preconditions**

- Reviewer is authenticated.
- Reviewer lands on the My Queue page.
- A question is selected.
- Metadata dialog is opened.

**Test Flow**

1. Login as reviewer.
2. Wait for the reviewer shell to load.
3. Open the metadata dialog.
4. Verify that each Summary metadata field contains a value.
5. Verify that each Details metadata field contains a value.
6. Close the dialog.

**Assertions**

The Summary section contains populated values for:

- Source
- Priority
- Status
- Total Answers
- Created At

The Details section contains populated values for:

- State
- District
- Crop
- Normalized Crop
- Season
- Domain

**Implementation**

Page Object

- `pages/response.page.ts`

Test

- `tests/response.spec.ts`

**Status**

✅ Passed

---

### RESP-006 — Reviewer can enter a draft response

**Feature**

Response Panel

**Purpose**

Verify that the Draft Response textarea accepts reviewer input and displays the entered response correctly.

**Preconditions**

- Reviewer is authenticated.
- Reviewer lands on the My Queue page.
- A question is selected.

**Test Flow**

1. Login as reviewer.
2. Wait for the reviewer shell to load.
3. Enter a draft response into the Draft Response textarea.
4. Verify the entered response is displayed correctly.

**Assertions**

- Draft Response textarea is editable.
- Entered response matches the supplied value.

**Implementation**

Page Object

- `pages/response.page.ts`

Test

- `tests/response.spec.ts`

**Status**

✅ Passed

### RESP-007 — Reviewer can enter remarks

**Feature**

Response Panel

**Purpose**

Verify that the Remarks textarea accepts reviewer input and displays the entered text correctly.

**Preconditions**

- Reviewer is authenticated.
- Reviewer lands on the My Queue page.
- A question is selected.

**Test Flow**

1. Login as reviewer.
2. Wait for the reviewer shell to load.
3. Enter text into the Remarks textarea.
4. Verify the entered remarks are displayed correctly.

**Assertions**

- Remarks textarea is editable.
- Entered remarks match the supplied value.

**Implementation**

Page Object

- `pages/response.page.ts`

Test

- `tests/response.spec.ts`

**Status**

✅ Passed

### RESP-008 — Reset clears draft response and remarks

**Feature**

Response Panel

**Purpose**

Verify that clicking the Reset button clears all editable fields in the Response panel.

**Preconditions**

- Reviewer is authenticated.
- Reviewer lands on the My Queue page.
- A question is selected.

**Test Flow**

1. Login as reviewer.
2. Wait for the reviewer shell to load.
3. Enter text into the Draft Response textarea.
4. Enter text into the Remarks textarea.
5. Click the Reset button.
6. Verify both textareas are cleared.

**Assertions**

- Draft Response textarea is empty after Reset.
- Remarks textarea is empty after Reset.

**Implementation**

Page Object

- `pages/response.page.ts`

Test

- `tests/response.spec.ts`

**Status**

✅ Passed

### RESP-009 — Submit button is enabled after entering a draft response

**Feature**

Response Panel

**Purpose**

Verify that the Submit button remains disabled until a reviewer enters a Draft Response, and becomes enabled once valid input is provided.

**Preconditions**

- Reviewer is authenticated.
- Reviewer lands on the My Queue page.
- A question is selected.
- Draft Response textarea is initially empty.

**Test Flow**

1. Login as reviewer.
2. Wait for the reviewer shell to load.
3. Verify the Submit button is disabled.
4. Enter text into the Draft Response textarea.
5. Verify the Submit button becomes enabled.

**Assertions**

- Submit button is disabled when the Draft Response textarea is empty.
- Submit button becomes enabled after entering a Draft Response.

**Implementation**

Page Object

- `pages/response.page.ts`

Test

- `tests/response.spec.ts`

**Status**

✅ Passed

### RESP-010 — Reviewer can successfully submit a response

**Feature**

Response Panel

**Purpose**

Verify that a reviewer can successfully submit a valid Draft Response and that the application indicates a successful submission.

**Preconditions**

- Reviewer is authenticated.
- Reviewer lands on the My Queue page.
- A question is selected.
- Draft Response textarea is empty.

**Test Flow**

1. Login as reviewer.
2. Wait for the reviewer shell to load.
3. Enter a valid Draft Response.
4. Verify the Submit button becomes enabled.
5. Click the Submit button.
6. Verify that the submission succeeds.

**Assertions**

- Submit button is disabled when no Draft Response is provided.
- Submit button becomes enabled after entering a valid Draft Response.
- Clicking Submit successfully submits the response.
- A success indication (toast, banner, dialog, or status update) is displayed.

**Implementation**

Page Object

- `pages/response.page.ts`

Test

- `tests/response.spec.ts`

**Status**

✅ Passed

### RESP-011 — Response form resets after successful submission

**Feature**

Reviewer Response Panel

**Purpose**

Verify that a reviewer can successfully submit a response with a valid source reference and that, after confirmation, the application loads the next allocated question with a cleared response form.

**Preconditions**

- Reviewer is logged in.
- Reviewer has at least one allocated question.
- Response panel is visible.
- A draft response has been entered.
- A valid source reference has been added.
- Submit button is enabled.

**Test Flow**

1. Open the Reviewer Dashboard.
2. Wait for the Response panel to load.
3. Enter a draft response.
4. Add a valid source reference.
5. Verify the **Submit** button is enabled.
6. Click **Submit**.
7. Confirm the submission from the **Submit Response** confirmation dialog.
8. Wait for the next question to load.
9. Verify the draft response field has been cleared.

**Assertions**

- Draft response can be entered successfully.
- Source reference can be added successfully.
- Submit button is enabled before submission.
- Submission confirmation dialog is displayed.
- Reviewer can confirm the submission.
- Current response is submitted successfully.
- Next allocated question is loaded.
- Draft response textarea is empty for the newly loaded question.

**Implementation**

**Page Object**

- `pages/response.page.ts`

Methods used:

- `fillDraftResponse()`
- `addSourceReference()`
- `clickSubmit()`
- `confirmSubmission()`
- `expectDraftResponseEmpty()`

**Test**

- `tests/response.spec.ts`

**Status**

✅ Passed

---
