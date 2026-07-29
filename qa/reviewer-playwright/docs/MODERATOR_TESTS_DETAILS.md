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
