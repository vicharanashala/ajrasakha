import type { Page } from '@playwright/test';

export class AppPage {
  constructor(private readonly page: Page) {}

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
    await this.gotoHome();
    await this.navigationTab(name).click();
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
