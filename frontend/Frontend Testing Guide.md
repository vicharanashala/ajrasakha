# Frontend Testing Guide

## Goal

Add simple, maintainable frontend tests for new features/components.

We are using:

- Vitest
- React Testing Library
- jsdom

---

# Test File Naming

Use these suffixes:

| Type | Naming |

|---|---|

| Unit Test |`*.unit.test.tsx`|

| Integration Test |`*.integration.test.tsx`|

Examples:

```text

UserCard.unit.test.tsx

LoginForm.integration.test.tsx

```

---

# Test File Location

Keep tests near the feature/module.

Example:

```text

src/

└── modules/

    └── auth/

        ├── components/

        │   ├── LoginForm.tsx

        │   └── LoginForm.unit.test.tsx

        │

        ├── pages/

        │   ├── LoginPage.tsx

        │   └── LoginPage.integration.test.tsx

```

Avoid central `/tests` folders for feature tests.

---

# What To Test

## Component Unit Tests

Test:

- Rendering
- User interaction
- Props behavior
- Conditional UI
- Loading/error states

Example:

```tsx
it("shows loading spinner", () => {
  render(<Button loading />);

  expect(screen.getByText("Loading...")).toBeInTheDocument();
});
```

---

## Integration Tests

Test:

- Page behavior
- API interaction
- Form submission
- Multiple components working together
- Routing behavior

Example:

```tsx
it("submits login form successfully", async () => {
  // render page
  // type email/password
  // click submit
  // verify success state
});
```

---

# What NOT To Test

Do NOT test:

- Internal implementation details
- CSS classes unless critical
- Third-party libraries
- React internals
- Exact HTML structure unless necessary

Avoid:

```tsx
expect(component.state.loading).toBe(true);
```

Prefer:

```tsx
expect(screen.getByText("Loading")).toBeInTheDocument();
```

---

# Test Structure

Use this structure:

```tsx
describe("ComponentName", () => {
  it("does something", () => {
    // arrange
    // act
    // assert
  });
});
```

---

# Mocking Rules

## Mock APIs

Always mock API calls in frontend tests.

Example:

```tsx
vi.mock("@/api/userApi", () => ({
  getUser: vi.fn(),
}));
```

---

## Do NOT Call Real Backend APIs

Frontend tests must not depend on:

- real backend
- real database
- real auth server

---

# Preferred Queries

Prefer:

```tsx
screen.getByRole();

screen.getByText();

screen.getByLabelText();
```

Avoid:

```tsx
container.querySelector();
```

---

# Example Unit Test

```tsx
import { render, screen } from "@testing-library/react";

import { describe, it, expect } from "vitest";

import { UserCard } from "./UserCard";

describe("UserCard", () => {
  it("renders user name", () => {
    render(<UserCard name="Riya" />);

    expect(screen.getByText("Riya")).toBeInTheDocument();
  });
});
```

---

# Example Integration Test

```tsx
import { render, screen } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

describe("LoginForm", () => {
  it("submits form", async () => {
    render(<LoginForm />);

    await userEvent.type(
      screen.getByLabelText("Email"),

      "test@example.com",
    );

    await userEvent.type(
      screen.getByLabelText("Password"),

      "password123",
    );

    await userEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(screen.getByText("Success")).toBeInTheDocument();
  });
});
```

---

# Rules

## Keep Tests Independent

Tests should not depend on:

- test execution order
- shared state
- previous tests

---

## One Responsibility Per Test

Good:

```tsx
it("shows validation error for invalid email");
```

Bad:

```tsx
it("handles all login scenarios");
```

---

# Before Creating PR

Ensure:

- Tests pass locally
- No real API calls
- No console errors
- New feature includes tests
- Existing tests still pass

Run:

```bash

pnpm test

```

---

# Minimal Checklist

Before submitting:

- [ ] Added test file
- [ ] Added happy path test
- [ ] Added error/loading test
- [ ] Tests pass locally
- [ ] No real backend calls

```

```
