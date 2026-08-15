import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Playground header (PlaygroundHeader.tsx). The header renders the role-aware
 * tab bar, the notification bell, and the profile/logout menu.
 */
export class HeaderPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get tabBar(): Locator {
    return this.page.locator("header").getByRole("tablist").first();
  }

  tab(name: string): Locator {
    return this.page
      .locator("header")
      .getByRole("tab", { name, exact: true })
      .first();
  }

  get logoutButton(): Locator {
    return this.page.getByRole("button", { name: /logout/i }).first();
  }

  /** Notification bell with unread badge (rendered when notifications > 0). */
  get notificationBell(): Locator {
    return this.page.locator("header button", { has: this.page.locator("svg.lucide-bell") });
  }

  get notificationBadge(): Locator {
    return this.page.locator("header span.bg-destructive");
  }

  /** The avatar button in the header that opens the profile dropdown menu. */
  get profileTrigger(): Locator {
    return this.page.locator("header button:has([data-slot='avatar'])");
  }

  /** The notifications sheet (Radix Sheet renders role="dialog"). */
  get notificationsDialog(): Locator {
    return this.page
      .getByRole("dialog")
      .filter({ has: this.page.getByRole("heading", { name: "Notifications" }) });
  }

  profileMenuItem(name: string): Locator {
    return this.page.getByRole("menuitem", { name, exact: true });
  }

  async openProfileMenu(): Promise<void> {
    await this.profileTrigger.click();
    await expect(this.page.getByRole("menu")).toBeVisible();
  }

  async openNotifications(): Promise<void> {
    await this.notificationBell.click();
    await expect(this.notificationsDialog).toBeVisible();
  }

  /**
   * Log out through the profile dropdown and its confirmation alert dialog.
   * The logout button in the menu is a DropdownMenuItem wrapping an
   * AlertDialogTrigger (user-profile-actions.tsx:191-224).
   */
  async logout(): Promise<void> {
    await this.openProfileMenu();
    await this.profileMenuItem("Logout").click();
    const confirm = this.page.getByRole("alertdialog", {
      name: "Are you sure you want to log out?",
    });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Logout", exact: true }).click();
    await expect(this.page).toHaveURL(/\/auth/, { timeout: 30_000 });
  }

  get mobileSidebarButton(): Locator {
    return this.page.locator("header").getByRole("button").last();
  }

  async switchToTab(name: string): Promise<void> {
    const tab = this.tab(name);
    await tab.click();
    await expect(tab).toHaveAttribute("data-state", "active");
  }

  async expectTabVisible(name: string): Promise<void> {
    await expect(this.tab(name)).toBeVisible();
  }

  async expectTabHidden(name: string): Promise<void> {
    await expect(this.tab(name)).toHaveCount(0);
  }
}
