# SCOPE

Moderator UI login → `/home` → **All Questions** → Open **Create Question** dialog

---

## MOD-001 — Moderator can open the Create Question dialog

### Feature

Create Question

### Purpose

Verify that an authenticated moderator can navigate to the **All Questions** view and open the **Create Question** dialog.

### Preconditions

- Moderator account exists and is authenticated.
- Application loads successfully after login.

### Test Flow

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Click the **Add Question (+)** button.
5. Verify that the Create Question dialog is displayed.

### Assertions

- All Questions tab is accessible.
- Add Question button is visible and clickable.
- Create Question dialog is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `tests/moderator-login.spec.ts`

### Status

✅ Passed

## MOD-002 — Create Question dialog renders all required controls

**Feature**

Create Question

**Purpose**

Verify that the Create Question dialog renders all mandatory form controls required to create a new question.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Verify that all required form controls are rendered.

**Assertions**

- Create Question dialog is visible.
- Question Text textarea is visible.
- State selector is visible.
- District selector is visible.
- Crop selector is visible.
- Season selector is visible.
- Domain selector is visible.
- Add Question button is visible.
- Cancel button is visible.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-003 — Create Question form initializes with expected default values

**Feature**

Create Question

**Purpose**

Verify that the Create Question dialog initializes with the expected default values and disabled state before any user interaction.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Verify the default values of the form controls.

**Assertions**

- Question Text textarea is empty.
- Context textarea is empty.
- AI Initial Answer textarea is empty.
- Priority defaults to **Medium**.
- Status defaults to **Open**.
- State selector displays **Select state**.
- District selector displays **Select district**.
- Crop selector displays **Select crop**.
- Season selector displays **Select season**.
- Domain selector displays **Select domain**.
- Add Question button is disabled.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-004 — Required fields prevent question creation

**Feature**

Create Question

**Purpose**

Verify that a moderator cannot submit the Create Question form until all mandatory fields are completed.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.
- No form fields have been modified.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Verify that the form cannot be submitted without completing the required fields.

**Assertions**

- Add Question button remains disabled.
- Question creation cannot be initiated while mandatory fields are empty.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-005 — Moderator can enter Question Text

**Feature**

Create Question

**Purpose**

Verify that a moderator can enter text into the Question Text field and that the entered value is retained.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Enter a valid question into the **Question Text** field.

**Assertions**

- Question Text field accepts user input.
- Entered question text is displayed correctly in the field.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-006 — Moderator can enter Context

**Feature**

Create Question

**Purpose**

Verify that a moderator can enter contextual information into the Context field and that the entered value is retained.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Enter contextual information into the **Context** field.

**Assertions**

- Context field accepts user input.
- Entered context is displayed correctly in the field.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-007 — Moderator can enter AI Initial Answer

**Feature**

Create Question

**Purpose**

Verify that a moderator can enter an AI Initial Answer and that the entered value is retained.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Enter an AI-generated response into the **AI Initial Answer** field.

**Assertions**

- AI Initial Answer field accepts user input.
- Entered AI Initial Answer is displayed correctly in the field.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-008 — Moderator can select Priority

**Feature**

Create Question

**Purpose**

Verify that a moderator can change the Priority field from its default value by selecting a different priority option.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Open the **Priority** dropdown.
6. Select **High**.

**Assertions**

- Priority dropdown opens successfully.
- Selected priority is updated to **High**.
- Newly selected value is displayed in the Priority field.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-009 — Moderator can select Status

**Feature**

Create Question

**Purpose**

Verify that a moderator can change the Status field by selecting a different status option.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Open the **Status** dropdown.
6. Select **Closed**.

**Assertions**

- Status dropdown opens successfully.
- Selected status is updated to **Closed**.
- Newly selected value is displayed in the Status field.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-010 — Moderator can select State

**Feature**

Create Question

**Purpose**

Verify that a moderator can select a state from the State dropdown and that the selected value is displayed correctly.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Open the **State** dropdown.
6. Select **Punjab**.

**Assertions**

- State dropdown opens successfully.
- State **Punjab** can be selected.
- Selected state is displayed in the State dropdown.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-011 — Moderator can select District

**Feature**

Create Question

**Purpose**

Verify that a moderator can select a district after selecting a state and that the selected value is displayed correctly.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Select **Punjab** from the State dropdown.
6. Open the **District** dropdown.
7. Select **Bathinda**.

**Assertions**

- District dropdown opens successfully.
- District **Bathinda** can be selected.
- Selected district is displayed in the District dropdown.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-012 — Moderator can select Crop

**Feature**

Create Question

**Purpose**

Verify that a moderator can select a crop from the Crop dropdown and that the selected value is displayed correctly.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Open the **Crop** dropdown.
6. Select **Wheat**.

**Assertions**

- Crop dropdown opens successfully.
- Crop **Wheat** can be selected.
- Selected crop is displayed in the Crop dropdown.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-013 — Moderator can select Season

**Feature**

Create Question

**Purpose**

Verify that a moderator can select a season from the Season dropdown and that the selected value is displayed correctly.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Open the **Season** dropdown.
6. Select **Rabi**.

**Assertions**

- Season dropdown opens successfully.
- Season **Rabi** can be selected.
- Selected season is displayed in the Season dropdown.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-014 — Moderator can select Domain

**Feature**

Create Question

**Purpose**

Verify that a moderator can add a domain to the question using the Domain multi-select field and that the selected domain is displayed as a selected tag.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Open the **Domain** selector.
6. Select **Fertilizer Use and Availability**.

**Assertions**

- Domain selector opens successfully.
- Domain **Fertilizer Use and Availability** can be selected.
- The selected domain is displayed as a selected tag/chip beneath the Domain field.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-015 — Submit button becomes enabled after required fields are completed

**Feature**

Create Question

**Purpose**

Verify that the **Add Question** button becomes enabled once all mandatory fields are populated with valid values.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Enter a valid question.
6. Select **Punjab** as the State.
7. Select **Bathinda** as the District.
8. Select **Wheat** as the Crop.
9. Select **Rabi** as the Season.
10. Select **Fertilizer Use and Availability** as the Domain.
11. Verify that the **Add Question** button becomes enabled.

**Assertions**

- All required fields accept valid input.
- The **Add Question** button transitions from disabled to enabled after the required fields are completed.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-016 — Moderator can cancel question creation

**Feature**

Create Question

**Purpose**

Verify that a moderator can cancel the question creation process and close the Create Question dialog without creating a question.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator shell to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Enter sample text into the Question field.
6. Click the **Cancel** button.

**Assertions**

- Cancel button is clickable.
- The Create Question dialog closes successfully.
- No question is submitted or created.

**Implementation**

- `pages/moderator/create-question.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

## MOD-017 — Moderator can successfully create a question

**Feature**

Create Question

**Purpose**

Verify that a moderator can successfully create a new question by completing all mandatory fields, submitting the form, and confirming that the question is added to the All Questions list.

**Preconditions**

- Moderator is authenticated.
- Moderator has navigated to the **All Questions** page.
- Create Question dialog is opened.
- Backend services are available to process question creation.

**Test Flow**

1. Login as moderator.
2. Wait for the moderator dashboard to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Enter a unique question.
6. Select **Jammu And Kashmir** as the State.
7. Select **Rajouri** as the District.
8. Select **All Spice** as the Crop.
9. Select **Winter** as the Season.
10. Select **Fertilizer Use and Availability** as the Domain.
11. Click the **Add Question** button.
12. Wait for the success notification.
13. Verify that the newly created question appears in the **All Questions** table.

**Assertions**

- The question is submitted successfully.
- A success toast with the message **"Question submitted successfully."** is displayed.
- The newly created question is visible in the **All Questions** table.
- The question is available for further actions (view, allocation, review, etc.).

**Implementation**

- `pages/moderator/create-question.page.ts`
- `pages/moderator/dashboard.page.ts`
- `tests/moderator-create-question.spec.ts`

**Status**

✅ Passed

---
