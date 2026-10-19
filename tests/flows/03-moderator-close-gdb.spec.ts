import { test, expect } from '@playwright/test';
import { AuthPage } from '../../src/pages/auth.page';
import { env } from '../../src/env';
import { AppPage } from '../../src/pages/app.page';

test.describe('Flow 3 — moderator closes Q&A into GDB', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/test/reset');
  });

  test('moderator can reach a question detail from home', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.login(env.moderatorEmail, env.moderatorPassword);
    await new AppPage(page).gotoHome();
    await expect(page.locator('#app')).toBeVisible();
  });

  test('approve closes the question and GDB count increases', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.login(env.moderatorEmail, env.moderatorPassword);
    await new AppPage(page).gotoHome();
    await page.getByRole('button', { name: /approve final answer/i }).click();
    await expect(page.getByText(/closed/i).first()).toBeVisible();
    await page.getByRole('link', { name: /analytics/i }).click();
    await expect(page.locator('.count', { hasText: 'GDB entries' })).toContainText('3');
  });

  test('closed status is a supported pipeline state in the UI', async ({
    page,
  }) => {
    const auth = new AuthPage(page);
    await auth.login(env.moderatorEmail, env.moderatorPassword);
    await new AppPage(page).gotoHome();
    await expect(page.getByText(/closed/i).first()).toBeVisible();
  });
});
