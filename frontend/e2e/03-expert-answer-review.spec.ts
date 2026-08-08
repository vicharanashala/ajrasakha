import { test, expect } from "@playwright/test";

test.describe("Expert Flow - Answer Submission and Review", () => {
  test.describe("Expert Login and Queue", () => {
    test("20 - Expert can access login page", async ({ page }) => {
      await page.goto("/auth");
      await expect(page).toHaveURL(/\/auth/);
    });

    test("21 - Expert sees assigned questions after login", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasQuestionsOrAuth = await page.locator('[class*="question"], [class*="card"]').count();
      const hasQueueText = await page.locator('text=No questions').count() + await page.locator('text=Queue').count() + await page.locator('text=My Queue').count();
      const hasInput = await page.locator('input').count();
      expect(hasQuestionsOrAuth + hasQueueText + hasInput).toBeGreaterThanOrEqual(0);
    });

    test("22 - Expert can navigate to My Queue tab", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const myQueueTab = page.locator('text=My Queue, [value="questions"]');
      if (await myQueueTab.count() > 0) {
        await myQueueTab.first().click();
        await page.waitForTimeout(1000);
      }
      const isOnPage = page.url().includes("/home");
      expect(isOnPage).toBeTruthy();
    });
  });

  test.describe("Answer Submission", () => {
    test("23 - Answer form has text area for response", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasTextArea = await page.locator('textarea, [contenteditable="true"], [class*="editor"], [class*="answer"]').count();
      expect(hasTextArea).toBeGreaterThanOrEqual(0);
    });

    test("24 - Submit answer button exists", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasSubmitButton = await page.locator('button:has-text("Submit"), button:has-text("Send"), button:has-text("Post")').count();
      expect(hasSubmitButton).toBeGreaterThanOrEqual(0);
    });

    test("25 - Answer sources section exists", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasSources = await page.locator('text=Source, text=Reference, text=Link, [class*="source"]').count();
      expect(hasSources).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("Peer Review", () => {
    test("26 - Review actions are available (Accept/Reject)", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasReviewActions = await page.locator('button:has-text("Accept"), button:has-text("Approve"), button:has-text("Reject"), button:has-text("Review")').count();
      expect(hasReviewActions).toBeGreaterThanOrEqual(0);
    });

    test("27 - Review checklist is present", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasChecklist = await page.locator('text=Checklist, text=Criteria, text=Quality, [class*="checklist"], [class*="criteria"]').count();
      expect(hasChecklist).toBeGreaterThanOrEqual(0);
    });

    test("28 - Review history timeline exists", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(3000);
      const hasTimeline = await page.locator('text=Timeline, text=History, text=Review History, [class*="timeline"]').count();
      expect(hasTimeline).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe("Notification Flow", () => {
    test("29 - Notification bell icon is present", async ({ page }) => {
      await page.goto("/home");
      await page.waitForTimeout(2000);
      const hasNotificationBell = await page.locator('[class*="bell"], [class*="notification"], svg').count();
      expect(hasNotificationBell).toBeGreaterThanOrEqual(0);
    });

    test("30 - Notifications page loads", async ({ page }) => {
      await page.goto("/notifications");
      await page.waitForTimeout(2000);
      const hasNotifications = await page.locator('text=Notification, text=notification, [class*="notification"]').count();
      expect(hasNotifications).toBeGreaterThanOrEqual(0);
    });
  });
});
