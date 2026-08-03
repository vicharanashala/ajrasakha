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

## MQA-007 — Moderator sees Gate Keeper Queue

### Feature

Gate Keeper Queue

### Purpose

Verify that the **Gate Keeper Queue** section is displayed on the Question Details page.

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
6. Scroll to the **Gate Keeper Queue** section.
7. Verify the section is displayed.

### Assertions

- Gate Keeper Queue heading is visible.
- Queue subtitle is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-008 — Moderator sees Gate Keeper Auto Allocate toggle

### Feature

Gate Keeper Queue

### Purpose

Verify that the **Auto-allocate Gate Keeper** toggle is visible.

### Preconditions

- Moderator account exists and is authenticated.
- Question Details page is open.

### Test Flow

1. Open a question.
2. Navigate to the **Gate Keeper Queue** section.
3. Verify the Auto-allocate Gate Keeper control.

### Assertions

- Auto-allocate Gate Keeper toggle is visible.
- Auto-allocate Gate Keeper label is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-009 — Moderator sees Gate Keeper empty state

### Feature

Gate Keeper Queue

### Purpose

Verify that the Gate Keeper Queue displays its empty state when no Gate Keeper has been assigned.

### Preconditions

- Moderator account exists and is authenticated.
- Newly created question.
- No Gate Keeper is assigned.

### Test Flow

1. Open a question.
2. Navigate to the **Gate Keeper Queue**.
3. Verify the empty state.

### Assertions

- Empty state heading **"No gate keeper assigned"** is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-010 — Moderator sees Gate Keeper assignment message

### Feature

Gate Keeper Queue

### Purpose

Verify that the informational message explaining Gate Keeper assignment is displayed.

### Preconditions

- Moderator account exists and is authenticated.
- Newly created question.
- No Gate Keeper is assigned.

### Test Flow

1. Open a question.
2. Navigate to the **Gate Keeper Queue**.
3. Observe the assignment information.

### Assertions

- Assignment guidance message is visible.
- The message explains that a Gate Keeper will be assigned automatically when auto-allocation is enabled.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-011 — Moderator sees Auditor Queue

### Feature

Auditor Queue

### Purpose

Verify that the **Auditor Queue** section is displayed on the Question Details page.

### Preconditions

- Moderator account exists and is authenticated.
- Application loads successfully after login.
- A valid question is created during test setup.
- Moderator opens the newly created question.

### Test Flow

1. Login as moderator.
2. Create a valid question.
3. Open the question.
4. Navigate to the **Auditor Queue** section.

### Assertions

- Auditor Queue heading is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-012 — Moderator sees Auditor Auto Allocate toggle

### Feature

Auditor Queue

### Purpose

Verify that the **Auto-allocate Auditor** toggle is visible.

### Preconditions

- Moderator account exists and is authenticated.
- Question Details page is open.

### Test Flow

1. Open a question.
2. Navigate to the **Auditor Queue**.
3. Verify the Auto-allocate Auditor control.

### Assertions

- Auto-allocate Auditor toggle is visible.
- Auto-allocate Auditor label is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-013 — Moderator sees Auditor empty state

### Feature

Auditor Queue

### Purpose

Verify that the Auditor Queue displays its empty state when no Auditor has been assigned.

### Preconditions

- Moderator account exists and is authenticated.
- Newly created question.
- No Auditor is assigned.

### Test Flow

1. Open a question.
2. Navigate to the **Auditor Queue**.
3. Verify the empty state.

### Assertions

- Empty state heading **"No auditor assigned"** is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-014 — Moderator sees Auditor assignment message

### Feature

Auditor Queue

### Purpose

Verify that the informational message explaining Auditor assignment is displayed.

### Preconditions

- Moderator account exists and is authenticated.
- Newly created question.
- No Auditor is assigned.

### Test Flow

1. Open a question.
2. Navigate to the **Auditor Queue**.
3. Observe the assignment information.

### Assertions

- Assignment guidance message is visible.
- The message explains that an Auditor will be assigned automatically when auto-allocation is enabled.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-015 — Moderator sees Moderator Queue

### Feature

Moderator Queue

### Purpose

Verify that the **Moderator Queue** section is displayed on the Question Details page.

### Preconditions

- Moderator account exists and is authenticated.
- Application loads successfully after login.
- A valid question is created during test setup.
- Moderator opens the newly created question.

### Test Flow

1. Login as moderator.
2. Create a valid question.
3. Open the question.
4. Navigate to the **Moderator Queue** section.

### Assertions

- Moderator Queue heading is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-016 — Moderator sees Moderator Auto Allocate toggle

### Feature

Moderator Queue

### Purpose

Verify that the **Auto-allocate Moderator** toggle is visible.

### Preconditions

- Moderator account exists and is authenticated.
- Question Details page is open.

### Test Flow

1. Open a question.
2. Navigate to the **Moderator Queue**.
3. Verify the Auto-allocate Moderator control.

### Assertions

- Auto-allocate Moderator toggle is visible.
- Auto-allocate Moderator label is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-017 — Moderator sees Moderator empty state

### Feature

Moderator Queue

### Purpose

Verify that the Moderator Queue displays its empty state when no Moderator has been assigned.

### Preconditions

- Moderator account exists and is authenticated.
- Newly created question.
- No Moderator is assigned.

### Test Flow

1. Open a question.
2. Navigate to the **Moderator Queue**.
3. Verify the empty state.

### Assertions

- Empty state heading **"No Moderator Assigned"** is visible.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-018 — Moderator sees Moderator assignment message

### Feature

Moderator Queue

### Purpose

Verify that the informational message explaining Moderator assignment is displayed.

### Preconditions

- Moderator account exists and is authenticated.
- Newly created question.
- No Moderator is assigned.

### Test Flow

1. Open a question.
2. Navigate to the **Moderator Queue**.
3. Observe the assignment information.

### Assertions

- Assignment guidance message is visible.
- The message explains that a Moderator will be assigned automatically, or can be assigned manually.

### Implementation

- `fixtures/moderator.fixture.ts`
- `pages/moderator/dashboard.page.ts`
- `pages/moderator/create-question.page.ts`
- `pages/moderator/allocation-queue.page.ts`
- `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

## MQA-019 — Moderator sees Submission History

### Feature

Submission History

### Purpose

Verify that the **Submission History** section is displayed on the Question Details page.

### Preconditions

* Moderator account exists and is authenticated.
* Application loads successfully after login.
* A valid question is created during test setup.
* Moderator opens the newly created question.

### Test Flow

1. Login as moderator.
2. Navigate to **All Questions**.
3. Create a valid question.
4. Submit the question.
5. Open the created question.
6. Scroll to the **Submission History** section.
7. Verify the section is displayed.

### Assertions

* Submission History heading is visible.

### Implementation

* `fixtures/moderator.fixture.ts`
* `pages/moderator/dashboard.page.ts`
* `pages/moderator/create-question.page.ts`
* `pages/moderator/allocation-queue.page.ts`
* `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-020 — Moderator sees Refresh button

### Feature

Submission History

### Purpose

Verify that the **Refresh** button is visible in the Submission History section.

### Preconditions

* Moderator account exists and is authenticated.
* Question Details page is open.

### Test Flow

1. Open a question.
2. Scroll to **Submission History**.
3. Verify the Refresh button.

### Assertions

* Refresh button is visible.

### Implementation

* `fixtures/moderator.fixture.ts`
* `pages/moderator/dashboard.page.ts`
* `pages/moderator/create-question.page.ts`
* `pages/moderator/allocation-queue.page.ts`
* `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-021 — Moderator sees disabled Manage History button

### Feature

Submission History

### Purpose

Verify that the **Manage History** button is disabled when the question has no submissions.

### Preconditions

* Moderator account exists and is authenticated.
* Newly created question.
* No submissions exist.

### Test Flow

1. Open a question.
2. Navigate to the **Submission History** section.
3. Verify the state of the **Manage History** button.

### Assertions

* Manage History button is visible.
* Manage History button is disabled.

### Implementation

* `fixtures/moderator.fixture.ts`
* `pages/moderator/dashboard.page.ts`
* `pages/moderator/create-question.page.ts`
* `pages/moderator/allocation-queue.page.ts`
* `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

---

# MQA-022 — Moderator sees empty Submission History message

### Feature

Submission History

### Purpose

Verify that the Submission History displays the appropriate empty state when no answers have been submitted.

### Preconditions

* Moderator account exists and is authenticated.
* Newly created question.
* No expert submissions exist.

### Test Flow

1. Open a question.
2. Navigate to the **Submission History** section.
3. Observe the empty state.

### Assertions

* The message **"No answers yet."** is visible.

### Implementation

* `fixtures/moderator.fixture.ts`
* `pages/moderator/dashboard.page.ts`
* `pages/moderator/create-question.page.ts`
* `pages/moderator/allocation-queue.page.ts`
* `tests/moderator/moderator-allocation-queue.spec.ts`

### Status

✅ Passed

