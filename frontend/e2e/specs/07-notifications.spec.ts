import { test, expect } from "@playwright/test";
import { setupAuth, mockUsers } from "../fixtures/auth";
import { mockNotificationsApi } from "../fixtures/notifications";
import { PlaygroundPage } from "../pages/PlaygroundPage";
import { NotificationPage } from "../pages/NotificationPage";

const FIREBASE_TIMEOUT = 15000;

test.describe("Notifications", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page, mockUsers.admin);
    await mockNotificationsApi(page);
  });

  test("notification sheet opens from bell icon", async ({ page }) => {
    test.slow(); // cold Vite compilation on first test
    const playground = new PlaygroundPage(page);
    await playground.goto();

    const notifications = new NotificationPage(page);
    await expect(notifications.bellTrigger).toBeVisible({ timeout: 30000 });
    await notifications.bellTrigger.click();
    await expect(notifications.sheetTitle).toHaveText("Notifications", { timeout: 30000 });
  });

  test("notification list renders", async ({ page }) => {
    const playground = new PlaygroundPage(page);
    await playground.goto();

    const notifications = new NotificationPage(page);
    await notifications.open();
    await expect(notifications.notificationCards.first()).toBeVisible({ timeout: FIREBASE_TIMEOUT });
    const count = await notifications.notificationCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("mark all notifications as read", async ({ page }) => {
    const playground = new PlaygroundPage(page);
    await playground.goto();

    const notifications = new NotificationPage(page);
    await notifications.open();
    await expect(notifications.markAllReadButton).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    await notifications.markAllReadButton.click();
    await expect(notifications.notificationCards.first()).toBeVisible();
  });

  test("delete a notification", async ({ page }) => {
    const playground = new PlaygroundPage(page);
    await playground.goto();

    const notifications = new NotificationPage(page);
    await notifications.open();
    await expect(notifications.notificationCards.first()).toBeVisible({ timeout: FIREBASE_TIMEOUT });

    await notifications.deleteFirstNotification();
    await expect(notifications.notificationCards.first()).toBeVisible();
  });
});
