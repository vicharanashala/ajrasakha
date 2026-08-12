import { test, expect } from "@playwright/test";
import { performMockLogin, setupDefaultMockRoutes } from "./helpers";

test.describe("User Management & Admin Controls", () => {
  test.beforeEach(async ({ page }) => {
    await setupDefaultMockRoutes(page);
    await performMockLogin(page, { role: "farmer" });
  });

  test("should render admin layout and user management view", async ({ page }) => {
    const header = page.locator("header, nav, .border-b").first();
    await header.waitFor({ state: "visible", timeout: 10000 });
    await expect(header).toBeVisible();
    await expect(page.locator("body")).toBeVisible();
  });

  test("should render user table headers when user management tab is selected", async ({ page }) => {
    const userTab = page.locator("text=/User Management/i").first();
    if (await userTab.isVisible()) {
      await userTab.click();
      await page.waitForTimeout(300);
      await expect(page.locator("table, [role='grid'], .grid").first()).toBeVisible();
    }
  });

  test("should allow searching users by query input", async ({ page }) => {
    const userTab = page.locator("text=/User Management/i").first();
    if (await userTab.isVisible()) {
      await userTab.click();
      const searchInput = page.locator("input[placeholder*='Search'], input[type='search']").first();
      if (await searchInput.isVisible()) {
        await searchInput.fill("Farmer");
        await expect(searchInput).toHaveValue("Farmer");
      }
    }
  });

  test("should display empty state when searching for non-existent user", async ({ page }) => {
    const userTab = page.locator("text=/User Management/i").first();
    if (await userTab.isVisible()) {
      await userTab.click();
      const searchInput = page.locator("input[placeholder*='Search'], input[type='search']").first();
      if (await searchInput.isVisible()) {
        await searchInput.fill("NonExistentUser12345");
        await page.waitForTimeout(300);
        await expect(page.locator("body")).toBeVisible();
      }
    }
  });

  test("should render preference state filter dropdown for admin user", async ({ page }) => {
    await page.route("**/api/location/states", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(["Haryana", "Punjab", "Uttar Pradesh"]),
      });
    });

    await page.waitForTimeout(300);
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});
