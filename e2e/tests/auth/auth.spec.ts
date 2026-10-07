import { test, expect } from "../../fixtures";
import { env } from "../../support/config";
import { expectToast } from "../../support/helpers";

/**
 * AUTH-* — login / signup / forgot-password (unauthenticated project).
 *
 * These run WITHOUT a saved session (no storageState). AUTH-04/07/08 need real
 * staging accounts from e2e/.env and FAIL LOUDLY (never silently skip) when the
 * corresponding env vars are missing (TEST_PLAN.md §3, §6.1).
 */

test.describe("AUTH auth & onboarding", () => {
  test("AUTH-01 login page renders the auth form", async ({ loginPage }) => {
    await loginPage.goto();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.signInButton).toBeVisible();
    await expect(loginPage.forgotPasswordButton).toBeVisible();
  });

  test("AUTH-02 empty submit shows validation errors", async ({
    loginPage,
    page,
  }) => {
    await loginPage.goto();
    await loginPage.submit();
    await expectToast(page, "Please fix form errors.");
    await expect(page).toHaveURL(/\/auth/);
  });

  test("AUTH-03 wrong password shows Invalid Credentials toast", async ({
    loginPage,
    page,
  }) => {
    await loginPage.goto();
    await loginPage.fillCredentials(env.admin.email, "definitely-wrong-password");
    await loginPage.submit();
    await expectToast(page, "Invalid Credentials");
    await expect(page).toHaveURL(/\/auth/);
  });

  test("AUTH-04 valid admin login lands on /home with header", async ({
    loginPage,
  }) => {
    await loginPage.goto();
    await loginPage.fillCredentials(env.admin.email, env.admin.password);
    await loginPage.submit();
    await expect(loginPage.page).toHaveURL(/\/home/, { timeout: 30_000 });
    await expect(loginPage.page.locator("header")).toBeVisible();
  });

  test("AUTH-05 /home without a session redirects to /auth", async ({
    page,
  }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/auth/, { timeout: 30_000 });
  });

  test("AUTH-06 signup mode: mismatched passwords shows error", async ({
    loginPage,
    page,
  }) => {
    await loginPage.goto();
    await loginPage.signUpToggle.click();
    await page.getByLabel("Full Name").fill("E2E Tester");
    await page.getByLabel("Email Address").fill("e2e-mismatch@example.invalid");
    await page.getByLabel("Password", { exact: true }).fill("StrongPass123!");
    await page.getByLabel("Confirm Password").fill("DifferentPass123!");
    await page.getByRole("button", { name: "Create Account" }).click();
    await expectToast(page, "Please fix form errors.");
    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });

  test("AUTH-07 forgot password sends reset and shows Check your email", async ({
    loginPage,
    page,
  }) => {
    const email = env.testUser.email;
    if (!email) {
      throw new Error(
        "[setup precondition] AUTH-07 needs a real account to send a reset link to. " +
          "Set E2E_TEST_USER_EMAIL in e2e/.env (an account provisioned on staging), then re-run.",
      );
    }
    await loginPage.goto();
    await loginPage.forgotPasswordButton.click();
    await page.getByLabel("Email Address").fill(email);
    await page.getByRole("button", { name: "Send Reset Link" }).click();
    await expect(
      page.getByRole("heading", { name: /check your email/i }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("AUTH-08 inactive moderator/expert is blocked at login", async ({
    loginPage,
    page,
  }) => {
    const email = env.testUser.email;
    const password = env.testUser.password;
    if (!email || !password) {
      throw new Error(
        "[setup precondition] AUTH-08 needs the email/password of an account that is " +
          "deliberately IN-ACTIVE on staging (see E2E_TEST_USER_EMAIL in e2e/.env.example).",
      );
    }
    await loginPage.goto();
    await loginPage.fillCredentials(email, password);
    await loginPage.submit();
    await expectToast(page, "User marked as Inactive Please Contact Moderator");
    await expect(page).toHaveURL(/\/auth/);
  });
});
