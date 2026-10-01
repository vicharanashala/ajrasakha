import { test, expect } from '@playwright/test';
import { AuthPage } from '../../src/pages/auth.page';
import { env } from '../../src/env';
import { AppPage } from '../../src/pages/app.page';

test.describe('Notifications', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/test/reset');
  });

  test('notifications page is reachable after login', async ({ page }) => {
    await new AuthPage(page).login(env.moderatorEmail, env.moderatorPassword);
    const app = new AppPage(page);
    await app.gotoNotifications();
    await app.expectAuthenticatedShell();
    await expect(page).toHaveURL(/\/notifications\/?/);
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  });
});

test.describe('History and flags', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/test/reset');
  });

  test('history page loads for a signed-in reviewer', async ({ page }) => {
    await new AuthPage(page).login(env.moderatorEmail, env.moderatorPassword);
    await new AppPage(page).gotoHistory();
    await expect(page).not.toHaveURL(/\/auth\/?$/);
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  });

  test('flags-reported page loads for a signed-in reviewer', async ({
    page,
  }) => {
    await new AuthPage(page).login(env.moderatorEmail, env.moderatorPassword);
    await page.goto('/flags-reported/');
    await expect(page).not.toHaveURL(/\/auth\/?$/);
    await expect(page.getByRole('heading', { name: 'Flags reported' })).toBeVisible();
  });
});
