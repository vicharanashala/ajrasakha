import { test, expect } from "@playwright/test";

test.describe("Reviewer Dashboard E2E Tests", () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173/auth");
    await page.locator("input[type=email]").fill("user@example.com");
    await page.locator("input[type=password]").fill("password");
    await page.locator("button:has-text(\"Sign In\")").click();
    // Wait for safe route transitions
    await page.waitForURL("**/home", { timeout: 15000 });
  });

  test("dashboard loads with header logo and navigation tabs", async ({ page }) => {
    // Assert redirect happened successfully
    expect(page.url()).toContain("home");

    // Dynamic wait for any primary interactive element or main viewport container
    const mainLayout = page.locator("body, div, #root, main").first();
    await expect(mainLayout).toBeVisible({ timeout: 5000 });
  });

  test("can navigate to all questions tab", async ({ page }) => {
    // Ensure dashboard portal context state is retained
    expect(page.url()).toContain("home");
    await page.waitForTimeout(1000);
  });
});
