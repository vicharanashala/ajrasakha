```md
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
```
