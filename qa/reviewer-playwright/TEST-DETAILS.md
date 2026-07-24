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
