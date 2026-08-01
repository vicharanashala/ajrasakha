## MQA-001 — Moderator sees Allocation Queue

### Feature

Allocation Queue

### Purpose

Verify that the **Allocation Queue** section is displayed on the Question Details page for a newly created question.

### Preconditions

- Moderator account exists and is authenticated.
- Application loads successfully after login.
- A valid question is created during test setup.
- Moderator opens the newly created question.

### Test Flow

1. Login as moderator.
2. Navigate to **All Questions**.
3. Create a valid question.
4. Submit the question.
5. Open the created question.
6. Verify that the **Allocation Queue** section is visible.

### Assertions

- Allocation Queue heading is visible.
- Queue subtitle (expert count) is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-002 — Moderator sees Auto Allocate toggle

### Feature

Allocation Queue

### Purpose

Verify that the **Auto-allocate Experts** toggle is visible within the Allocation Queue.

### Preconditions

- Moderator account exists and is authenticated.
- Question Details page is open.

### Test Flow

1. Open a question.
2. Navigate to the Allocation Queue section.
3. Verify the Auto-allocate Experts control.

### Assertions

- Auto-allocate Experts toggle is visible.
- Auto-allocate Experts label is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-003 — Moderator sees allocation cards

### Feature

Allocation Queue

### Purpose

Verify that at least one allocation card is displayed for the question.

### Preconditions

- Moderator account exists and is authenticated.
- Question Details page is open.

### Test Flow

1. Open a question.
2. Scroll to the Allocation Queue.
3. Verify that allocation cards are rendered.

### Assertions

- At least one allocation card is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-004 — Moderator sees assigned experts

### Feature

Allocation Queue

### Purpose

Verify that assigned expert information is displayed on allocation cards.

### Preconditions

- Moderator account exists and is authenticated.
- Allocation Queue contains at least one expert.

### Test Flow

1. Open a question.
2. Navigate to Allocation Queue.
3. Verify that expert information is displayed.

### Assertions

- Expert name/email is visible on the allocation card.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-005 — Moderator sees allocation statuses

### Feature

Allocation Queue

### Purpose

Verify that allocation status badges are displayed for allocated experts.

### Preconditions

- Moderator account exists and is authenticated.
- Allocation Queue contains at least one allocation.

### Test Flow

1. Open a question.
2. Navigate to Allocation Queue.
3. Verify allocation status badges.

### Assertions

- At least one allocation status badge is visible.
- Status corresponds to one of the supported allocation states (e.g. Waiting, Approved, Rejected, Answer Created).

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-006 — Moderator can view allocation status details

### Feature

Allocation Queue

### Purpose

Verify that hovering over an allocation card reveals the current allocation status message.

### Preconditions

- Moderator account exists and is authenticated.
- Question Details page is open.
- At least one allocation card is present.

### Test Flow

1. Open a question.
2. Navigate to the Allocation Queue.
3. Hover over the first allocation card.
4. Verify that the allocation status message is displayed.

### Assertions

- Allocation card flips on hover.
- Current allocation status message is visible (for example, **"Expert is reviewing the question!!"** or **"Expert created an answer."**).

> **Note:** Detailed allocation metadata such as **Assigned**, **Completed**, and **Duration** is intentionally **not** verified in this test because those fields are only available after the expert has completed at least one stage of the review workflow. Those validations belong in a later workflow-specific test suite.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed
