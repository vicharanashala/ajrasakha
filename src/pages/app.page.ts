import { type Locator, type Page, expect } from '@playwright/test';

export class AppPage {
  readonly page: Page;
  readonly notificationsNav: Locator;
  readonly analyticsNav: Locator;

  constructor(page: Page) {
    this.page = page;
    this.notificationsNav = page.getByRole('link', { name: /notifications/i });
    this.analyticsNav = page.getByRole('link', { name: /analytics/i });
  }

  async gotoHome() {
    await this.page.goto('/home/');
  }

  async gotoNotifications() {
    await this.page.goto('/notifications/');
  }

  async gotoHistory() {
    await this.page.goto('/history/');
  }

  async gotoAudit() {
    await this.page.goto('/audit/');
  }

  async gotoPaeExpert() {
    await this.page.goto('/pae-expert/');
  }

  async gotoCoordinator() {
    await this.page.goto('/coordinator/');
  }

  async gotoProfile() {
    await this.page.goto('/profile/');
  }

  async expectAuthenticatedShell() {
    await expect(this.page).not.toHaveURL(/\/auth\/?$/);
    await expect(this.page.locator('#app')).toBeVisible();
  }

  stuckIndicator() {
    return this.page.getByText(/stuck|delayed|overdue|sla/i).first();
  }

  statusChip(status: string) {
    return this.page.getByText(new RegExp(status, 'i')).first();
  }

  queueCounts() {
    return this.page.getByText(/\b\d+\b/);
  }

  reputationScore() {
    return this.page.getByText(/reputation|score/i).first();
  }
}
