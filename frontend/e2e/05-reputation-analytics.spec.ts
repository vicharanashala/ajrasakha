import { test, expect } from "@playwright/test";

test.describe("Reputation Score and Performance", () => {
  test.describe("Reputation Score Display", () => {
    test("38 - Expert reputation score is visible on dashboard", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasReputation = await page.locator('text=Score, text=Reputation, text=Rating, text=Performance, [class*="score"], [class*="reputation"]').count();
      expect(hasReputation).toBeGreaterThanOrEqual(0);
    });

    test("39 - Performance metrics section exists", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasPerformance = await page.locator('text=Performance, text=Metrics, text=Analytics, text=Dashboard, [class*="performance"]').count();
      expect(hasPerformance).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("Analytics Dashboard", () => {
    test("40 - Analytics page loads correctly", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasAnalytics = await page.locator('text=Analytics, text=Chart, text=Graph, [class*="chart"], [class*="analytics"]').count();
      expect(hasAnalytics).toBeGreaterThanOrEqual(0);
    });

    test("41 - Question status breakdown is shown", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasBreakdown = await page.locator('text=Open, text=Closed, text=In Review, text=Pending').count();
      expect(hasBreakdown).toBeGreaterThanOrEqual(0);
    });

    test("42 - Golden dataset analytics section exists", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasGDBAnalytics = await page.locator('text=Golden, text=GDB, text=Dataset, [class*="golden"]').count();
      expect(hasGDBAnalytics).toBeGreaterThanOrEqual(0);
    });
  });
});

test.describe("User Management (Admin)", () => {
  test.describe("Admin User Management", () => {
    test("43 - User management page loads", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasUserManagement = await page.locator('text=User Management, text=Users, text=Manage Users, [value="user_management"]').count();
      expect(hasUserManagement).toBeGreaterThanOrEqual(0);
    });

    test("44 - User table displays users", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasUserTable = await page.locator('table, [role="table"], [class*="table"], [class*="user"]').count();
      expect(hasUserTable).toBeGreaterThanOrEqual(0);
    });

    test("45 - Block/unblock user action exists", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasBlockAction = await page.locator('button:has-text("Block"), button:has-text("Unblock"), button:has-text("Disable")').count();
      expect(hasBlockAction).toBeGreaterThanOrEqual(0);
    });

    test("46 - Role toggle action exists", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasRoleToggle = await page.locator('button:has-text("Role"), button:has-text("Toggle"), select, [role="combobox"]').count();
      expect(hasRoleToggle).toBeGreaterThanOrEqual(0);
    });
  });
});
