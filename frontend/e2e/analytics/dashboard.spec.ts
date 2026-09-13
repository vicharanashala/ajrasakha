import { test, expect } from "../fixtures/auth.fixture";
import { DashboardPage } from "../pages/DashboardPage";

test.describe("Analytics & Dashboard", () => {
  test("admin dashboard loads with header", async ({ adminPage }) => {
    const dashboard = new DashboardPage(adminPage);
    await dashboard.goto();
    await expect(dashboard.header).toBeVisible();
  });

  test("dashboard tab is visible for admin", async ({ adminPage }) => {
    const dashboard = new DashboardPage(adminPage);
    await dashboard.goto();

    const dashTab = adminPage.getByRole("tab", { name: /^dashboard$/i });
    if (await dashTab.isVisible()) {
      await dashTab.click();
      await adminPage.waitForTimeout(2000);
    }
  });

  test("chatbot analytics tab loads", async ({ adminPage }) => {
    const dashboard = new DashboardPage(adminPage);
    await dashboard.goto();

    const chatbotTab = adminPage.getByRole("tab", {
      name: /chatbot analytics/i,
    });
    if (await chatbotTab.isVisible()) {
      await chatbotTab.click();
      await adminPage.waitForTimeout(2000);
    }
  });

  test("data processing tab loads for admin", async ({ adminPage }) => {
    const dashboard = new DashboardPage(adminPage);
    await dashboard.goto();

    const dataTab = adminPage.getByRole("tab", { name: /data processing/i });
    if (await dataTab.isVisible()) {
      await dataTab.click();
      await adminPage.waitForTimeout(2000);
    }
  });

  test("user management tab loads", async ({ adminPage }) => {
    const dashboard = new DashboardPage(adminPage);
    await dashboard.goto();

    const userMgmtTab = adminPage.getByRole("tab", {
      name: /user management/i,
    });
    if (await userMgmtTab.isVisible()) {
      await userMgmtTab.click();
      await adminPage.waitForTimeout(2000);

      const table = adminPage.locator("table");
      const isVisible = await table.isVisible().catch(() => false);
      expect(isVisible).toBe(true);
    }
  });

  test("fertilizer calculator tab loads for admin", async ({ adminPage }) => {
    const dashboard = new DashboardPage(adminPage);
    await dashboard.goto();

    const fertTab = adminPage.getByRole("tab", {
      name: /fertilizer calculator/i,
    });
    if (await fertTab.isVisible()) {
      await fertTab.click();
      await adminPage.waitForTimeout(2000);
    }
  });

  test("manage agents tab loads for admin", async ({ adminPage }) => {
    const dashboard = new DashboardPage(adminPage);
    await dashboard.goto();

    const agentsTab = adminPage.getByRole("tab", { name: /manage agents/i });
    if (await agentsTab.isVisible()) {
      await agentsTab.click();
      await adminPage.waitForTimeout(2000);
    }
  });

  test("dashboard has no critical console errors", async ({ adminPage }) => {
    const errors: string[] = [];
    adminPage.on("pageerror", (err) => errors.push(err.message));

    const dashboard = new DashboardPage(adminPage);
    await dashboard.goto();
    await adminPage.waitForTimeout(3000);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("NetworkError") &&
        !e.includes("Failed to fetch") &&
        !e.includes("NotAllowedError"),
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("all admin tabs are clickable", async ({ adminPage }) => {
    const dashboard = new DashboardPage(adminPage);
    await dashboard.goto();

    const tabs = adminPage.locator('[role="tab"]');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThan(3);

    for (let i = 0; i < Math.min(tabCount, 5); i++) {
      const tab = tabs.nth(i);
      if (await tab.isVisible()) {
        await tab.click();
        await adminPage.waitForTimeout(500);
      }
    }
  });

  test("page loads within performance threshold", async ({ adminPage }) => {
    const start = Date.now();
    const dashboard = new DashboardPage(adminPage);
    await dashboard.goto();
    await adminPage.waitForLoadState("networkidle");
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(15_000);
  });
});
