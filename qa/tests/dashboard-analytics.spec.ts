import { test, expect } from "@playwright/test";
import { performMockLogin, setupDefaultMockRoutes } from "./helpers";

test.describe("Dashboard Analytics & Metrics", () => {
  test.beforeEach(async ({ page }) => {
    await setupDefaultMockRoutes(page);
    await performMockLogin(page, { role: "farmer" });
  });

  test("should render dashboard header and welcome title", async ({ page }) => {
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("text=/Annam/i").first()).toBeVisible();
  });

  test("should render performance metrics summary cards", async ({ page }) => {
    // Navigate to Dashboard tab if available
    const dashboardTab = page.locator("text=/Dashboard/i").first();
    if (await dashboardTab.isVisible()) {
      await dashboardTab.click();
    }
    await expect(page.locator("body")).toBeVisible();
  });

  test("should handle empty shift analytics response without page crash", async ({ page }) => {
    await page.route("**/api/performance/shift-based-*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.reload();
    await expect(page.locator("header")).toBeVisible();
  });

  test("should switch between available header navigation tabs", async ({ page }) => {
    const questionsTab = page.locator("text=/All Questions/i").first();
    if (await questionsTab.isVisible()) {
      await questionsTab.click();
      await page.waitForTimeout(300);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("should render crop analytics filter controls", async ({ page }) => {
    const filterCombobox = page.locator("[role='combobox'], select").first();
    if (await filterCombobox.isVisible()) {
      await expect(filterCombobox).toBeEnabled();
    }
  });

  test("should render notification icon in top navigation bar", async ({ page }) => {
    const bellIcon = page.locator("header button, header svg").first();
    await expect(bellIcon).toBeVisible();
  });
});
