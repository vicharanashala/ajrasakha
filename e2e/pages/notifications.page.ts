import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Notifications Page Object — /notifications route.
 *
 * Maps to the notification center and the <NotificationModal> component.
 */
export class NotificationsPage extends BasePage {
  // ── Locators ────────────────────────────────────────────────

  /** Notification list container */
  readonly notificationList: Locator;

  /** Individual notification items */
  readonly notificationItems: Locator;

  /** Unread notification items */
  readonly unreadNotifications: Locator;

  /** Read notification items */
  readonly readNotifications: Locator;

  /** Mark as read button (individual) */
  readonly markAsReadButton: Locator;

  /** Mark all as read button */
  readonly markAllAsReadButton: Locator;

  /** Empty state message */
  readonly emptyState: Locator;

  /** Notification title text */
  readonly notificationTitles: Locator;

  /** Notification message text */
  readonly notificationMessages: Locator;

  constructor(page: Page) {
    super(page);
    this.notificationList = page.locator('[class*="notification"], [class*="Notification"]').first();
    this.notificationItems = page.locator('[class*="notification-item"], [class*="NotificationItem"], [class*="notification"] [class*="item"], [class*="notification"] li, [class*="notification"] [class*="card"]');
    this.unreadNotifications = page.locator('[class*="unread"], [class*="Unread"]');
    this.readNotifications = page.locator('[class*="read"]:not([class*="unread"])');
    this.markAsReadButton = page.getByRole('button', { name: /mark.*read/i });
    this.markAllAsReadButton = page.getByRole('button', { name: /mark all/i });
    this.emptyState = page.locator(':text("No notifications"), :text("no notifications"), :text("empty")');
    this.notificationTitles = page.locator('[class*="notification"] h3, [class*="notification"] h4, [class*="notification"] [class*="title"]');
    this.notificationMessages = page.locator('[class*="notification"] p, [class*="notification"] [class*="message"]');
  }

  // ── Actions ─────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.navigateTo('/notifications');
  }

  async getNotificationCount(): Promise<number> {
    await this.page.waitForTimeout(2000);
    return this.notificationItems.count();
  }

  async markFirstAsRead(): Promise<void> {
    await this.markAsReadButton.first().click();
  }

  async markAllAsRead(): Promise<void> {
    await this.markAllAsReadButton.click();
  }

  async isOnNotificationsPage(): Promise<boolean> {
    const path = await this.currentPath();
    return path.startsWith('/notifications');
  }
}
