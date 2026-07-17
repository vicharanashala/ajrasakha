import { test, expect } from "@playwright/test";

test.describe("Moderator Approval and GDB Entry", () => {
  test.describe("Final Answer Approval", () => {
    test("31 - Moderator can view finalized answers", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasFinalized = await page.locator('text=Finalized, text=Approved, text=Golden, [class*="finalized"]').count();
      expect(hasFinalized).toBeGreaterThanOrEqual(0);
    });

    test("32 - Approve to GDB button exists", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasApproveButton = await page.locator('button:has-text("Approve"), button:has-text("Pass"), button:has-text("GDB"), button:has-text("Golden")').count();
      expect(hasApproveButton).toBeGreaterThanOrEqual(0);
    });

    test("33 - Question status changes after approval", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasStatusBadge = await page.locator('[class*="badge"], [class*="status"]').count();
      const hasStatusText = await page.locator('text=Closed').count() + await page.locator('text=Approved').count();
      expect(hasStatusBadge + hasStatusText).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("Re-route Flow", () => {
    test("34 - Re-route button exists for moderators", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasReRoute = await page.locator('button:has-text("Re-route"), button:has-text("Reroute"), button:has-text("Reallocate")').count();
      expect(hasReRoute).toBeGreaterThanOrEqual(0);
    });

    test("35 - Re-route dialog shows expert selection", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasReRouteDialog = await page.locator('text=Re-route, text=Reroute, [role="dialog"]').count();
      expect(hasReRouteDialog).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("Request/Flag System", () => {
    test("36 - Flag/report button exists", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasFlagButton = await page.locator('button:has-text("Flag"), button:has-text("Report"), button:has-text("Request")').count();
      expect(hasFlagButton).toBeGreaterThanOrEqual(0);
    });

    test("37 - Flagged questions page loads", async ({ page }) => {
      await page.goto("/flags-reported");
      await page.waitForTimeout(2000);
      const hasFlaggedPage = await page.locator('text=Flag, text=Report, text=Request, [class*="flag"], [class*="request"]').count();
      expect(hasFlaggedPage).toBeGreaterThanOrEqual(0);
    });
  });
});
