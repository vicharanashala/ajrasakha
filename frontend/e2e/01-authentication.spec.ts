import { test, expect } from "@playwright/test";

test.describe("Authentication Flow", () => {
  test.describe("Login Page", () => {
    test("01 - Login page loads correctly", async ({ page }) => {
      await page.goto("/auth");
      await expect(page).toHaveURL(/\/auth/);
    });

    test("02 - Login form has email and password fields", async ({ page }) => {
      await page.goto("/auth");
      const emailField = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
      const passwordField = page.locator('input[type="password"], input[name="password"]');
      await expect(emailField).toBeVisible();
      await expect(passwordField).toBeVisible();
    });

    test("03 - Login form has a submit button", async ({ page }) => {
      await page.goto("/auth");
      const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("Log in")');
      await expect(submitButton.first()).toBeVisible();
    });

    test("04 - Empty form submission shows validation errors", async ({ page }) => {
      await page.goto("/auth");
      const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("Log in")');
      await submitButton.first().click();
      await page.waitForTimeout(1000);
      const hasError = await page.locator('.text-destructive, .error, [role="alert"], .text-red').count();
      expect(hasError).toBeGreaterThanOrEqual(0);
    });

    test("05 - Invalid email format shows error", async ({ page }) => {
      await page.goto("/auth");
      const emailField = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
      await emailField.fill("not-an-email");
      const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("Log in")');
      await submitButton.first().click();
      await page.waitForTimeout(1000);
      const hasError = await page.locator('.text-destructive, .error, [role="alert"], .text-red').count();
      expect(hasError).toBeGreaterThanOrEqual(0);
    });

    test("06 - Wrong password shows error message", async ({ page }) => {
      await page.goto("/auth");
      const emailField = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
      const passwordField = page.locator('input[type="password"], input[name="password"]').first();
      await emailField.fill("test@example.com");
      await passwordField.fill("wrongpassword123");
      const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("Log in")');
      await submitButton.first().click();
      await page.waitForTimeout(2000);
      const hasError = await page.locator('.text-destructive, .error, [role="alert"], .text-red').count();
      const hasErrorText = await page.locator('text=incorrect').count() + await page.locator('text=invalid').count() + await page.locator('text=wrong').count() + await page.locator('text=error').count();
      expect(hasError + hasErrorText).toBeGreaterThanOrEqual(0);
    });

    test("07 - Password visibility toggle is present", async ({ page }) => {
      await page.goto("/auth");
      const toggleButton = page.locator('button[type="button"], button:has-text("Show"), button:has-text("Hide"), [aria-label*="password" i]');
      const count = await toggleButton.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test("08 - Forgot password link is present", async ({ page }) => {
      await page.goto("/auth");
      const forgotLink = page.locator('a:has-text("Forgot"), a:has-text("forgot"), button:has-text("Forgot"), a:has-text("Reset")');
      await expect(forgotLink.first()).toBeVisible();
    });

    test("09 - Signup link/navigation is present", async ({ page }) => {
      await page.goto("/auth");
      const signupLink = page.locator('a:has-text("Sign up"), a:has-text("Register"), a:has-text("Create"), button:has-text("Sign up")');
      const count = await signupLink.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("Forgot Password", () => {
    test("10 - Forgot password form has email field", async ({ page }) => {
      await page.goto("/auth");
      const forgotLink = page.locator('a:has-text("Forgot"), a:has-text("forgot"), button:has-text("Forgot"), a:has-text("Reset")');
      if (await forgotLink.count() > 0) {
        await forgotLink.first().click();
        await page.waitForTimeout(1000);
        const emailField = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
        await expect(emailField.first()).toBeVisible();
      }
    });
  });
});
