import { test, expect } from "../../fixtures";

/**
 * COM-* — common header flows. These run once per role project (admin,
 * moderator, expert) because shared tests in tests/common are not ignored by
 * any role project, so every saved session is proven against the same flows.
 * Keep every case role-agnostic: nothing here may depend on a specific role.
 */
test.describe("COM common header", () => {
  test("COM-01 header renders with tabs, bell and profile", async ({ page, header }) => {
    await page.goto("/home");
    await expect(page.locator("header")).toBeVisible();
    await expect(header.tabBar).toBeVisible();
    await expect(header.notificationBell).toBeVisible();
    await expect(header.profileTrigger).toBeVisible();
  });

  test("COM-02 notification bell opens the Notifications sheet", async ({ page, header }) => {
    await page.goto("/home");
    await expect(page.locator("header")).toBeVisible();
    await header.openNotifications();
    await expect(
      header.notificationsDialog.getByRole("heading", { name: "Notifications", exact: true }),
    ).toBeVisible();
  });

  test("COM-03 profile menu opens with Profile and Logout", async ({ page, header }) => {
    await page.goto("/home");
    await expect(page.locator("header")).toBeVisible();
    await header.openProfileMenu();
    await expect(header.profileMenuItem("Profile")).toBeVisible();
    await expect(header.profileMenuItem("Logout")).toBeVisible();
  });

  test("COM-04 logout returns to the auth screen", async ({ page, header }) => {
    await page.goto("/home");
    await header.logout();
    await expect(page).toHaveURL(/\/auth/, { timeout: 30_000 });
  });
});
