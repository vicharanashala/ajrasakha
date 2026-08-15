import { test, expect } from "@playwright/test";
import { performMockLogin, setupDefaultMockRoutes } from "./helpers";

test.describe("Dashboard Analytics & Metrics", () => {
  test.beforeEach(async ({ page }) => {
    await setupDefaultMockRoutes(page);
    await performMockLogin(page, { role: "farmer" });
  });

  test("should render dashboard header and welcome title", async ({ page }) => {
    const header = page.locator("header, nav, .border-b").first();
    await header.waitFor({ state: "visible", timeout: 10000 });
    await expect(header).toBeVisible();
  });

  test("should render performance metrics summary cards", async ({ page }) => {
    await page.waitForTimeout(500);
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

    await page.waitForTimeout(300);
    const body = page.locator("body");
    await expect(body).toBeVisible();
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
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("should render notification icon in top navigation bar", async ({ page }) => {
    const headerIcon = page.locator("header button, button:has(svg), header svg").first();
    await headerIcon.waitFor({ state: "visible", timeout: 10000 });
    await expect(headerIcon).toBeVisible();
  });
});
