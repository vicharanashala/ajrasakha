import { test, expect } from "@playwright/test";
import { setupAuth, mockUsers } from "../fixtures/auth";
import { mockDashboardApi } from "../fixtures/performance";
import { PlaygroundPage } from "../pages/PlaygroundPage";
import { DashboardPage } from "../pages/DashboardPage";

const FIREBASE_TIMEOUT = 15000;

test.describe("Dashboard", () => {
  test("Dashboard loads successfully for admin", async ({ page }) => {
    await setupAuth(page, mockUsers.admin);
    await mockDashboardApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickDashboard();

    const dashboard = new DashboardPage(page);
    await expect(dashboard.heading).toHaveText("Admin Dashboard", { timeout: FIREBASE_TIMEOUT });
  });

  test("Dashboard overview widgets are visible", async ({ page }) => {
    await setupAuth(page, mockUsers.admin);
    await mockDashboardApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickDashboard();

    const dashboard = new DashboardPage(page);
    await expect(dashboard.roleOverviewCard).toBeVisible({ timeout: FIREBASE_TIMEOUT });
    await expect(dashboard.approvalRateCard).toBeVisible();
  });

  test("Golden Dataset section is visible", async ({ page }) => {
    await setupAuth(page, mockUsers.admin);
    await mockDashboardApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickDashboard();

    const dashboard = new DashboardPage(page);
    await expect(dashboard.goldenYearView).toBeVisible({ timeout: FIREBASE_TIMEOUT });
    await expect(dashboard.goldenMonthView).toBeVisible();
    await expect(dashboard.goldenWeekView).toBeVisible();
    await expect(dashboard.goldenDayView).toBeVisible();
  });

  test("Questions Analytics tabs switch correctly", async ({ page }) => {
    await setupAuth(page, mockUsers.admin);
    await mockDashboardApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickDashboard();

    const dashboard = new DashboardPage(page);
    await expect(dashboard.analyticsByCropTab).toBeVisible({ timeout: FIREBASE_TIMEOUT });
    await expect(dashboard.analyticsByStateTab).toBeVisible();
    await expect(dashboard.analyticsByDomainTab).toBeVisible();

    await dashboard.analyticsByStateTab.click();
    await expect(dashboard.analyticsByStateTab).toHaveAttribute("data-state", "active");

    await dashboard.analyticsByDomainTab.click();
    await expect(dashboard.analyticsByDomainTab).toHaveAttribute("data-state", "active");
  });

  test("Expert Performance chart is visible", async ({ page }) => {
    await setupAuth(page, mockUsers.admin);
    await mockDashboardApi(page);

    const playground = new PlaygroundPage(page);
    await playground.goto();
    await playground.clickDashboard();

    const dashboard = new DashboardPage(page);
    await expect(dashboard.expertsPerformanceCard).toBeVisible({ timeout: FIREBASE_TIMEOUT });
  });
});
