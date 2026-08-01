# SCOPE

Moderator UI login → `/home` → **All Questions** → Create Question → Open **Question Details**

---

## MQD-001 — Moderator can open Question Details page

### Feature

Question Details

### Purpose

Verify that a moderator can successfully open the **Question Details** page after creating a question.

### Preconditions

- Moderator account exists and is authenticated.
- Application loads successfully after login.
- A valid question is created during test setup.

### Test Flow

1. Login as moderator.
2. Wait for the moderator dashboard to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Create a valid question.
6. Submit the question.
7. Open the newly created question.
8. Verify that the Question Details page is displayed.

### Assertions

- Question Details page opens successfully.
- Question title is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/question-details.page.ts`
- `tests/moderator/moderator-question-details.spec.ts`

### Status

✅ Passed

---

## MQD-002 — Moderator sees the correct question title

### Feature

Question Details

### Purpose

Verify that the Question Details page displays the exact title of the question that was created.

### Preconditions

- Moderator is authenticated.
- A question has been created and opened.

### Test Flow

1. Login as moderator.
2. Create a new question.
3. Open the created question.
4. Verify the displayed question title.

### Assertions

- The page heading exactly matches the created question text.

### Implementation

- `pages/moderator/question-details.page.ts`
- `tests/moderator/moderator-question-details.spec.ts`

### Status

✅ Passed

---

## MQD-003 — Moderator sees Question Details header

### Feature

Question Details

### Purpose

Verify that the primary navigation controls are available on the Question Details page.

### Preconditions

- Moderator is authenticated.
- Question Details page is open.

### Test Flow

1. Login as moderator.
2. Create a question.
3. Open Question Details.
4. Verify the header controls.

### Assertions

- Question title is visible.
- Exit button is visible.
- View LifeCycle button is visible.
- View Audit button is visible.

### Implementation

- `pages/moderator/question-details.page.ts`
- `tests/moderator/moderator-question-details.spec.ts`

### Status

✅ Passed

---

## MQD-004 — Moderator sees the correct question metadata

### Feature

Question Details

### Purpose

Verify that the metadata shown in the **Details** section matches the values provided during question creation.

### Preconditions

- Moderator is authenticated.
- Question has been created using known metadata values.
- Question Details page is open.

### Test Flow

1. Login as moderator.
2. Create a question.
3. Populate the required metadata.
4. Submit the question.
5. Open Question Details.
6. Verify the metadata displayed in the Details card.

### Assertions

- State matches the created question.
- District matches the created question.
- Crop matches the created question.
- Season matches the created question.
- Domain matches the created question.

### Implementation

- `pages/moderator/question-details.page.ts`
- `tests/moderator/moderator-question-details.spec.ts`

### Status

✅ Passed

---

## MQD-005 — Moderator sees AI Generated Answer section

### Feature

Question Details

### Purpose

Verify that the **AI Generated Answer** section is rendered on the Question Details page.

### Preconditions

- Moderator is authenticated.
- Question Details page is open.

### Test Flow

1. Login as moderator.
2. Create a question.
3. Open Question Details.
4. Verify the AI Generated Answer section.

### Assertions

- AI Generated Answer heading is visible.
- View Details control is visible.

> **Note:** This test verifies only the presence of the AI Generated Answer section. It does not validate AI generation, generated content, or backend integration.

### Implementation

- `pages/moderator/question-details.page.ts`
- `tests/moderator/moderator-question-details.spec.ts`

### Status

✅ Passed

---

## MQD-006 — Moderator can generate an AI answer _(Planned)_

### Feature

Question Details

### Purpose

Verify that a moderator can generate an AI answer for a question from the **AI Generated Answer** section.

### Preconditions

- Moderator is authenticated.
- Question Details page is open.
- AI answer generation service is available and enabled for the target environment.

### Test Flow

1. Login as moderator.
2. Create a question.
3. Open Question Details.
4. Expand the **AI Generated Answer** section.
5. Click **Generate AI Answer**.
6. Wait for AI generation to complete.
7. Verify the generated response is displayed.

### Assertions

- AI Generated Answer section can be expanded.
- Generate AI Answer button is clickable.
- AI generation request completes successfully.
- "No AI answer available" message is no longer displayed.
- Generated AI answer is visible and non-empty.

### Implementation

- `pages/moderator/question-details.page.ts`
- `tests/moderator/moderator-question-details.spec.ts`

### Status

🟡 Planned

> **Note**
>
> This test is intentionally expected to fail until AI answer generation is available in the test environment. Once the backend service is enabled (or appropriately mocked), the test will be updated to validate the generated response.

## MQD-007 — Moderator can exit Question Details

### Feature

Question Details

### Purpose

Verify that a moderator can exit the **Question Details** page and return to the **All Questions** view.

### Preconditions

- Moderator account exists and is authenticated.
- Application loads successfully after login.
- A valid question is created during test setup.
- Question Details page is open.

### Test Flow

1. Login as moderator.
2. Wait for the moderator dashboard to load.
3. Open the **All Questions** tab.
4. Open the **Create Question** dialog.
5. Create a valid question.
6. Submit the question.
7. Open the newly created question.
8. Click the **Exit** button.
9. Verify that the moderator is returned to the **All Questions** page.

### Assertions

- Exit button is visible and clickable.
- Question Details page closes successfully.
- All Questions page is displayed.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/question-details.page.ts`
- `tests/moderator/moderator-question-details.spec.ts`

### Status

✅ Passed

## MQD-008 — Moderator can open Question LifeCycle

### Feature

Question Details

### Purpose

Verify that a moderator can open the **Question LifeCycle** dialog from the Question Details page.

### Preconditions

- Moderator account exists and is authenticated.
- Application loads successfully after login.
- A valid question is created during test setup.
- Moderator is on the Question Details page.

### Test Flow

1. Login as moderator.
2. Wait for the moderator dashboard to load.
3. Open the **All Questions** tab.
4. Create and submit a valid question.
5. Open the newly created question.
6. Click the **View LifeCycle** button.
7. Verify that the Question LifeCycle dialog opens.

### Assertions

- View LifeCycle button is visible and clickable.
- Question LifeCycle dialog is displayed.
- Lifecycle dialog title is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/question-details.page.ts`
- `tests/moderator/moderator-question-details.spec.ts`

### Status

✅ Passed

# MQD-009 — Moderator sees Lifecycle timeline

### Feature

Question Lifecycle

### Purpose

Verify that the **Question Lifecycle** dialog displays the lifecycle timeline after it is opened.

### Preconditions

- Moderator account exists and is authenticated.
- Application loads successfully after login.
- A valid question is created during test setup.
- Moderator is viewing the Question Details page.

### Test Flow

1. Login as moderator.
2. Create a valid question.
3. Open the newly created question.
4. Click **View Lifecycle**.
5. Verify that the lifecycle timeline is displayed.

### Assertions

- Lifecycle dialog is open.
- Lifecycle table is visible.
- Timeline contains lifecycle events.
- Timeline displays the expected columns:
  - Timestamp
  - User
  - Duration
  - Action

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/question-details.page.ts`
- `tests/moderator/moderator-question-details.spec.ts`

### Status

✅ Passed

---

# MQD-010 — Moderator sees Lifecycle summary

### Feature

Question Lifecycle

### Purpose

Verify that the **Lifecycle Summary** section is displayed below the lifecycle timeline.

### Preconditions

- Moderator account exists and is authenticated.
- Application loads successfully after login.
- A valid question is created during test setup.
- Moderator is viewing the Question Lifecycle dialog.

### Test Flow

1. Login as moderator.
2. Create a valid question.
3. Open the Question Details page.
4. Open the **Question Lifecycle** dialog.
5. Verify that the lifecycle summary cards are displayed.

### Assertions

- Lifecycle summary section is visible.
- Summary information is displayed below the timeline.
- Summary cards render successfully.

> **Note:** This test validates the presence of the summary section only. It does not validate the calculated values or timings, which vary depending on workflow state.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/question-details.page.ts`
- `tests/moderator/moderator-question-details.spec.ts`

### Status

✅ Passed

---

# MQD-011 — Moderator can close Question Lifecycle

### Feature

Question Lifecycle

### Purpose

Verify that a moderator can close the **Question Lifecycle** dialog and return to the Question Details page.

### Preconditions

- Moderator account exists and is authenticated.
- Application loads successfully after login.
- A valid question is created during test setup.
- Moderator is viewing the Question Details page.

### Test Flow

1. Login as moderator.
2. Create a valid question.
3. Open the Question Details page.
4. Open the **Question Lifecycle** dialog.
5. Verify that the dialog is displayed.
6. Close the dialog.
7. Verify that the dialog is dismissed.

### Assertions

- Lifecycle dialog opens successfully.
- Close button is functional.
- Lifecycle dialog is no longer visible after closing.
- User remains on the Question Details page.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/question-details.page.ts`
- `tests/moderator/moderator-question-details.spec.ts`

### Status

✅ Passed
