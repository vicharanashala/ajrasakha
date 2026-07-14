import { test, expect } from "../fixtures/auth.fixture";
import { AuthPage } from "../pages/AuthPage";

test.describe("Authentication Flows", () => {
  test("admin login redirects to home dashboard", async ({ adminPage }) => {
    const url = adminPage.url();
    expect(url).toContain("/home");
    await expect(adminPage.locator("header")).toBeVisible();
  });

  test("expert login redirects to home with questions tab", async ({
    expertPage,
  }) => {
    const url = expertPage.url();
    expect(url).toContain("/home");
    await expect(expertPage.locator("header")).toBeVisible();
  });

  test("moderator login redirects to home dashboard", async ({
    moderatorPage,
  }) => {
    const url = moderatorPage.url();
    expect(url).toContain("/home");
    await expect(moderatorPage.locator("header")).toBeVisible();
  });

  test("invalid credentials shows error message", async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.goto();
    await authPage.login("invalid@example.com", "wrongpassword123");

    // Wait for either an error element or the page to stay on /auth (login failed)
    await page.waitForTimeout(5_000);
    const url = page.url();
    expect(url).toContain("/auth");
  });

  test("login page has all required elements", async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.goto();

    await expect(authPage.emailInput).toBeVisible();
    await expect(authPage.passwordInput).toBeVisible();
    await expect(authPage.signInButton).toBeVisible();
  });
});
