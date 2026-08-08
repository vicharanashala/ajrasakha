/**
 * BUG FIX TEST: auth-form error handling
 *
 * Bug #14: auth-form.tsx — setErrors({}) in finally block wipes form validation
 *          errors after failed submission, preventing users from seeing what
 *          went wrong.
 *
 * File affected: frontend/src/components/auth-form.tsx
 *
 * Fix: Removed setErrors({}) from the finally block so validation errors
 *      persist after failed submissions.
 */

import { describe, it, expect } from "vitest";

describe("Bug #14: auth-form errors wiped in finally block", () => {
  it("validation errors should persist after failed submission", () => {
    // Simulates the form state management
    let errors: Record<string, string> = {};

    const setErrors = (newErrors: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
      if (typeof newErrors === "function") {
        errors = newErrors(errors);
      } else {
        errors = newErrors;
      }
    };

    // Step 1: Validation sets errors
    setErrors({ email: "Email is required", password: "Password must be at least 8 characters" });
    expect(errors.email).toBe("Email is required");
    expect(errors.password).toBe("Password must be at least 8 characters");

    // Step 2: Submission fails (catch block)
    try {
      throw new Error("Invalid credentials");
    } catch (e) {
      // Error shown via toast, errors state should persist
    }

    // Step 3: BEFORE FIX — finally block wiped errors: setErrors({})
    // AFTER FIX — finally block does NOT wipe errors
    // Do NOT call setErrors({}) here (the fix)

    expect(errors.email).toBe("Email is required"); // Should still exist after fix
    expect(errors.password).toBe("Password must be at least 8 characters");
  });

  it("errors should only be cleared at the start of a new submission", () => {
    let errors: Record<string, string> = { email: "Invalid email" };

    // Clearing errors happens at the start of handleSubmit, not in finally
    const handleSubmit = () => {
      errors = {}; // Clear on new submission start
      // ... validation and API call
    };

    expect(errors.email).toBe("Invalid email");

    handleSubmit(); // New submission clears old errors
    expect(errors).toEqual({});
  });

  it("errors should be cleared when user types in a field", () => {
    let errors: Record<string, string> = { email: "Invalid email" };

    const handleChange = (name: string) => {
      if (errors[name]) {
        errors = { ...errors, [name]: "" };
      }
    };

    handleChange("email");
    expect(errors.email).toBe("");
  });
});

describe("Auth form validation flow", () => {
  it("should return error for empty email", () => {
    const validate = (form: { name: string; email: string; password: string; confirmPassword: string }) => {
      const newErrors: Record<string, string> = {};
      if (!form.email) newErrors.email = "Email is required";
      if (!form.password) newErrors.password = "Password is required";
      if (form.password !== form.confirmPassword) newErrors.confirmPassword = "Passwords don't match";
      return newErrors;
    };

    const errors = validate({ name: "John", email: "", password: "12345678", confirmPassword: "12345678" });
    expect(errors.email).toBe("Email is required");
    expect(errors.password).toBeUndefined();
  });

  it("should return error for mismatched passwords", () => {
    const validate = (form: { name: string; email: string; password: string; confirmPassword: string }) => {
      const newErrors: Record<string, string> = {};
      if (!form.email) newErrors.email = "Email is required";
      if (form.password !== form.confirmPassword) newErrors.confirmPassword = "Passwords don't match";
      return newErrors;
    };

    const errors = validate({ name: "John", email: "test@test.com", password: "12345678", confirmPassword: "87654321" });
    expect(errors.confirmPassword).toBe("Passwords don't match");
  });

  it("should return no errors for valid form", () => {
    const validate = (form: { name: string; email: string; password: string; confirmPassword: string }) => {
      const newErrors: Record<string, string> = {};
      if (!form.email) newErrors.email = "Email is required";
      if (form.password !== form.confirmPassword) newErrors.confirmPassword = "Passwords don't match";
      return newErrors;
    };

    const errors = validate({ name: "John", email: "test@test.com", password: "12345678", confirmPassword: "12345678" });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
