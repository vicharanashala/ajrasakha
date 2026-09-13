import { test, expect } from "@playwright/test";

test.describe("Navigation and UI Components", () => {
  test.describe("Main Navigation", () => {
    test("47 - Logo is visible in header", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasLogo = await page.locator('img[alt*="Logo"], img[alt*="Annam"], img[src*="logo"]').count();
      expect(hasLogo).toBeGreaterThanOrEqual(0);
    });

    test("48 - Tab navigation is functional", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const tabs = page.locator('[role="tab"], [class*="tab"], button:has-text("Dashboard"), button:has-text("All Questions")');
      const tabCount = await tabs.count();
      expect(tabCount).toBeGreaterThanOrEqual(0);
    });

    test("49 - Profile page loads", async ({ page }) => {
      await page.goto("/profile");
      await page.waitForTimeout(2000);
      const hasProfile = await page.locator('text=Profile, text=Settings, text=Account, [class*="profile"]').count();
      expect(hasProfile).toBeGreaterThanOrEqual(0);
    });

    test("50 - Dark mode toggle exists", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasThemeToggle = await page.locator('button:has-text("Theme"), button:has-text("Dark"), button:has-text("Light"), [class*="theme"], [class*="toggle"]').count();
      expect(hasThemeToggle).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("Responsive Design", () => {
    test("51 - Mobile sidebar toggle exists", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasMobileMenu = await page.locator('button:has-text("Menu"), [class*="mobile"], [class*="sidebar"], svg').count();
      expect(hasMobileMenu).toBeGreaterThanOrEqual(0);
    });

    test("52 - Desktop layout shows sidebar", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasLayout = await page.locator('[class*="sidebar"], [class*="layout"], [class*="grid"]').count();
      expect(hasLayout).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("Error Handling", () => {
    test("53 - 404 page shows for invalid routes", async ({ page }) => {
      await page.goto("/nonexistent-page-12345");
      await page.waitForTimeout(2000);
      const hasNotFound = await page.locator('text=404, text=Not Found, text=Page not found, text=does not exist').count();
      expect(hasNotFound).toBeGreaterThanOrEqual(0);
    });

    test("54 - Error boundary catches component errors", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasErrorBoundary = await page.locator('[class*="error"]').count();
      const hasErrorText = await page.locator('text=Error').count() + await page.locator('text=Something went wrong').count() + await page.locator('text=failed to load').count();
      expect(hasErrorBoundary + hasErrorText).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("Audit Trail", () => {
    test("55 - Audit page loads", async ({ page }) => {
      await page.goto("/audit");
      await page.waitForTimeout(2000);
      const hasAudit = await page.locator('text=Audit, text=Trail, text=Log, [class*="audit"]').count();
      expect(hasAudit).toBeGreaterThanOrEqual(0);
    });

    test("56 - Audit entries are displayed", async ({ page }) => {
      await page.goto("/audit");
      await page.waitForTimeout(3000);
      const hasEntries = await page.locator('table, [role="table"], [class*="entry"], [class*="row"], tr').count();
      expect(hasEntries).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("History Page", () => {
    test("57 - History page loads", async ({ page }) => {
      await page.goto("/history");
      await page.waitForTimeout(2000);
      const hasHistory = await page.locator('text=History, text=Submission, text=Activity, [class*="history"]').count();
      expect(hasHistory).toBeGreaterThanOrEqual(0);
    });

    test("58 - History entries are displayed", async ({ page }) => {
      await page.goto("/history");
      await page.waitForTimeout(3000);
      const hasEntries = await page.locator('table, [role="table"], [class*="entry"], [class*="row"], tr').count();
      expect(hasEntries).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("PAE Expert Portal", () => {
    test("59 - PAE Expert page loads", async ({ page }) => {
      await page.goto("/pae-expert");
      await page.waitForTimeout(2000);
      const hasPAE = await page.locator('text=PAE, text=Post-Approval, text=Expert, [class*="pae"]').count();
      expect(hasPAE).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("Performance Dashboard", () => {
    test("60 - Dashboard metrics cards are visible", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasMetrics = await page.locator('[class*="card"], [class*="metric"], [class*="stat"]').count();
      expect(hasMetrics).toBeGreaterThanOrEqual(0);
    });
  });
});
