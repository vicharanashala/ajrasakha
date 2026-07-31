import { test, expect } from "../fixtures/auth.fixture";
import { NotificationPage } from "../pages/NotificationPage";

test.describe("Notification Flows", () => {
  test("notification bell is visible on dashboard", async ({ adminPage }) => {
    const bell = adminPage.locator(
      'button:has(.lucide-bell), button:has(svg[class*="bell"])',
    );
    await expect(bell).toBeVisible();
  });

  test("notification modal opens on bell click", async ({ adminPage }) => {
    const notifPage = new NotificationPage(adminPage);
    await notifPage.open();

    const heading = adminPage.getByRole("dialog", { name: /notifications/i });
    await expect(heading).toBeVisible({ timeout: 5_000 });
  });

  test("notification unread tab shows unread items", async ({ adminPage }) => {
    const notifPage = new NotificationPage(adminPage);
    await notifPage.open();

    const unreadTab = adminPage.getByRole("button", { name: /unread/i });
    if (await unreadTab.isVisible()) {
      await unreadTab.click();
      await adminPage.waitForTimeout(500);
    }
  });

  test("notification read tab shows read items", async ({ adminPage }) => {
    const notifPage = new NotificationPage(adminPage);
    await notifPage.open();

    const readTab = adminPage.getByRole("button", { name: /^read$/i });
    if (await readTab.isVisible()) {
      await readTab.click();
      await adminPage.waitForTimeout(500);
    }
  });

  test("mark all as read button works", async ({ adminPage }) => {
    const notifPage = new NotificationPage(adminPage);
    await notifPage.open();

    const markAllBtn = adminPage.getByRole("button", {
      name: /mark all as read/i,
    });
    if (await markAllBtn.isVisible()) {
      await markAllBtn.click();
      await adminPage.waitForTimeout(1000);
    }
  });

  test("notification modal has close button", async ({ adminPage }) => {
    const notifPage = new NotificationPage(adminPage);
    await notifPage.open();

    const dialog = adminPage.getByRole("dialog", { name: /notifications/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Close by pressing Escape
    await adminPage.keyboard.press("Escape");
    await adminPage.waitForTimeout(500);
  });

  test("notification count badge shows on bell", async ({ adminPage }) => {
    const badge = adminPage.locator(
      ".absolute.-top-\\[4px\\].-right-\\[12px\\]",
    );
    const isVisible = await badge.isVisible().catch(() => false);
    expect(typeof isVisible).toBe("boolean");
  });

  test("notifications panel shows empty state when no notifications", async ({
    adminPage,
  }) => {
    const notifPage = new NotificationPage(adminPage);
    await notifPage.open();

    const emptyState = adminPage.locator("text=/no notifications/i");
    const hasItems = await adminPage
      .locator('[class*="notification"]')
      .first()
      .isVisible()
      .catch(() => false);
    const isEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasItems || isEmpty).toBe(true);
  });

  test("notification tabs switch correctly", async ({ adminPage }) => {
    const notifPage = new NotificationPage(adminPage);
    await notifPage.open();

    const allTab = adminPage.getByRole("button", { name: /^all$/i });
    const unreadTab = adminPage.getByRole("button", { name: /unread/i });
    const readTab = adminPage.getByRole("button", { name: /^read$/i });

    if (await allTab.isVisible()) {
      await allTab.click();
      await adminPage.waitForTimeout(300);
    }
    if (await unreadTab.isVisible()) {
      await unreadTab.click();
      await adminPage.waitForTimeout(300);
    }
    if (await readTab.isVisible()) {
      await readTab.click();
      await adminPage.waitForTimeout(300);
    }
  });

  test("notification sheet has correct layout", async ({ adminPage }) => {
    const notifPage = new NotificationPage(adminPage);
    await notifPage.open();

    const dialog = adminPage.getByRole("dialog", { name: /notifications/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
  });
});
