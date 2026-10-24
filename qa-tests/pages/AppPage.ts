import { expect, type BrowserContext, type Page } from '@playwright/test';

export class AppPage {
  constructor(private readonly page: Page) {}

  async seedActiveTab(context: BrowserContext, email: string, tabValue: string) {
    await context.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      { key: `playground_active_tab_${email}`, value: tabValue },
    );
  }

  async gotoHome() {
    await this.page.goto('/');
    await this.waitForAppReady();
  }

  async waitForAppReady() {
    const startedAt = performance.now();
    await this.page.getByRole('banner').getByRole('tablist').waitFor({ state: 'visible' });
    return performance.now() - startedAt;
  }

  async gotoHomeTab(name: string) {
    const moderatorTabValues: Record<string, string> = {
      'All Questions': 'all_questions',
      'My Dashboard': 'moderatorDashboard',
    };
    const tabValue = moderatorTabValues[name];

    if (tabValue) {
      const email = process.env.MODERATOR_EMAIL;
      if (!email) {
        throw new Error('MODERATOR_EMAIL is required to seed the moderator navigation tab.');
      }
      await this.seedActiveTab(this.page.context(), email, tabValue);
    }

    await this.page.goto('/');
    await this.waitForAppReady();

    if (tabValue) {
      await this.navigationTab('My Dashboard').waitFor({ state: 'visible' });
    }

    const tab = this.navigationTab(name);
    if ((await tab.getAttribute('aria-selected')) !== 'true') {
      await tab.click();
    }
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }

  navigationTab(name: string) {
    return this.page.getByRole('tab', { name, exact: true });
  }

  notificationButton() {
    return this.page.getByRole('button', { name: 'Notifications', exact: true });
  }

  notificationsPanel() {
    return this.page.getByRole('dialog', { name: 'Notifications' });
  }

  profileMenuButton() {
    return this.page.getByRole('button', { name: 'Profile menu', exact: true });
  }

  profileMenuItem(name: string) {
    return this.page.getByRole('menuitem', { name, exact: true });
  }
}
