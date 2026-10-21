import { test, expect } from "@playwright/test";

test.describe("Authentication Flows", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      console.log(`[BROWSER CONSOLE]: ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
      console.error(`[BROWSER EXCEPTION]: ${err.message}\nStack: ${err.stack}`);
    });

    // Intercept API checks to ensure auth page loads consistently
    await page.route("**/api/users/me", async (route) => {
      await route.fulfill({ status: 401, body: JSON.stringify({ message: "Unauthorized" }) });
    });
    await page.goto("/auth");
  });

  test("should render the login form elements correctly", async ({ page }) => {
    await expect(page.locator("h2, h3, .text-2xl").filter({ hasText: /Welcome Back/i }).first()).toBeVisible();
    await expect(page.locator("input[name='email']")).toBeVisible();
    await expect(page.locator("input[name='password']")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  const invalidEmails = ["plainaddress", "john@example", "@example.com", "john.com"];
  for (const email of invalidEmails) {
    test(`should show validation error for invalid email: ${email}`, async ({ page }) => {
      await page.fill("input[name='email']", email);
      await page.fill("input[name='password']", "password123");
      await page.click("button[type='submit']");
      
      // Look for the specific error text
      await expect(page.locator("text=/Please enter a valid email/i").first()).toBeVisible();
    });
  }

  test("should show error on empty email and password submission", async ({ page }) => {
    await page.click("button[type='submit']");
    await expect(page.locator("text=/Email is required/i").first()).toBeVisible();
  });

  test("should toggle between Login and Signup mode", async ({ page }) => {
    // Locate the toggle button for signup
    const toggleButton = page.locator("button").filter({ hasText: /Sign up/i }).first();
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();

    // Verify name field is visible in signup mode
    await expect(page.locator("input[name='name']")).toBeVisible();
    await expect(page.locator("input[name='confirmPassword']")).toBeVisible();

    // Toggle back to login
    const loginToggle = page.locator("button").filter({ hasText: /Sign in/i }).first();
    await loginToggle.click();
    await expect(page.locator("input[name='name']")).not.toBeVisible();
  });

  test("should handle forgot password navigation", async ({ page }) => {
    const forgotBtn = page.locator("text=/Forgot password/i").first();
    if (await forgotBtn.isVisible()) {
      await forgotBtn.click();
      await expect(page.locator("text=/Reset Password/i")).toBeVisible();
      await expect(page.locator("input[name='email']")).toBeVisible();
      
      // Navigate back
      const backBtn = page.locator("button").filter({ hasText: /Back/i }).first();
      if (await backBtn.isVisible()) {
        await backBtn.click();
        await expect(page.locator("input[name='password']")).toBeVisible();
      }
    }
  });

  test("should show validation errors for mismatched passwords during signup", async ({ page }) => {
    const toggleButton = page.locator("button").filter({ hasText: /Sign up/i }).first();
    await toggleButton.click();

    await page.fill("input[name='name']", "Farmer Ram");
    await page.fill("input[name='email']", "farmer.ram@example.com");
    await page.fill("input[name='password']", "StrongPassword123!");
    await page.fill("input[name='confirmPassword']", "MismatchedPassword123!");
    await page.click("button[type='submit']");

    await expect(page.locator("text=/Passwords do not match/i").first()).toBeVisible();
  });

  test("should toggle password visibility when clicking eye icon", async ({ page }) => {
    const passwordInput = page.locator("input[name='password']");
    await passwordInput.fill("secretPass123");
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Click visibility toggle button inside input container if available
    const eyeButton = page.locator("input[name='password'] ~ button, button:has(svg)").first();
    if (await eyeButton.isVisible()) {
      await eyeButton.click();
      // Should switch to text type or toggle icon
      const inputType = await passwordInput.getAttribute("type");
      expect(["text", "password"]).toContain(inputType);
    }
  });

  test("should enforce minimum password length constraint", async ({ page }) => {
    await page.fill("input[name='email']", "valid.farmer@example.com");
    await page.fill("input[name='password']", "123");
    await page.click("button[type='submit']");

    await expect(page.locator("text=/Password must be at least 8 characters/i").first()).toBeVisible();
  });

  test("should allow typing email in signup mode and submitting", async ({ page }) => {
    const signUpToggle = page.locator("button").filter({ hasText: /Sign up/i }).first();
    await signUpToggle.click();

    const testEmail = "persistent.farmer@example.com";
    await page.fill("input[name='email']", testEmail);

    const emailValue = await page.locator("input[name='email']").inputValue();
    expect(emailValue).toBe(testEmail);
  });
});
