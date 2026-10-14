import type { Page, Locator } from "@playwright/test";

export class NotificationPage {
  readonly page: Page;
  readonly bellButton: Locator;
  readonly unreadTab: Locator;
  readonly readTab: Locator;
  readonly allTab: Locator;
  readonly notificationItems: Locator;
  readonly markAllReadButton: Locator;
  readonly closeButton: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.bellButton = page.locator(
      'button:has(.lucide-bell), button:has(svg[class*="bell"])',
    );
    this.unreadTab = page.getByRole("button", { name: /unread/i });
    this.readTab = page.getByRole("button", { name: /^read$/i });
    this.allTab = page.getByRole("button", { name: /^all$/i });
    this.notificationItems = page.locator(
      '[class*="notification-item"], [data-testid*="notification"]',
    );
    this.markAllReadButton = page.getByRole("button", {
      name: /mark all as read/i,
    });
    this.closeButton = page.locator('button:has(.lucide-x), [class*="close"]');
    this.emptyState = page.locator("text=/no notifications/i");
  }

  async open() {
    await this.bellButton.click();
    await this.page.waitForTimeout(500);
  }

  async switchToTab(name: "all" | "unread" | "read") {
    const tab = name === "all" ? this.allTab : name === "unread" ? this.unreadTab : this.readTab;
    await tab.click();
    await this.page.waitForTimeout(300);
  }

  async getNotificationCount(): Promise<number> {
    return this.notificationItems.count();
  }

  async clickNotification(index: number) {
    await this.notificationItems.nth(index).click();
  }
}
