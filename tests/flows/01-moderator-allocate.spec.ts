import { test, expect } from '@playwright/test';
import { AuthPage } from '../../src/pages/auth.page';
import { env } from '../../src/env';
import { AppPage } from '../../src/pages/app.page';

test.describe('Flow 1 — moderator allocates an expert', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/test/reset');
  });

  test('moderator signs in on the local desk, not the live portal', async ({
    page,
  }) => {
    const auth = new AuthPage(page);
    await auth.login(env.moderatorEmail, env.moderatorPassword);
    await auth.expectLoggedIn();
    expect(page.url()).toMatch(/127\.0\.0\.1|localhost/);
    expect(page.url()).not.toMatch(/vicharanashala\.ai/);
  });

  test('moderator can open the question queue (home)', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.login(env.moderatorEmail, env.moderatorPassword);
    const app = new AppPage(page);
    await app.gotoHome();
    await app.expectAuthenticatedShell();
    await expect(page).toHaveURL(/\/home\/?/);
    await expect(page.getByRole('heading', { name: 'Question queue' })).toBeVisible();
  });

  test('queue lists at least one question or an empty-state message', async ({
    page,
  }) => {
    const auth = new AuthPage(page);
    await auth.login(env.moderatorEmail, env.moderatorPassword);
    const app = new AppPage(page);
    await app.gotoHome();
    await app.expectAuthenticatedShell();
    const questionRow = page.getByRole('row').nth(1);
    const empty = page.getByText(/no questions|empty|nothing to review/i);
    await expect(questionRow.or(empty).first()).toBeVisible();
  });

  test('allocate expert notifies the expert', async ({ page, browser }) => {
    const auth = new AuthPage(page);
    await auth.login(env.moderatorEmail, env.moderatorPassword);
    await new AppPage(page).gotoHome();
    await page.getByRole('button', { name: /allocate expert/i }).first().click();
    await expect(page.getByText(/in-review/i).first()).toBeVisible();

    const expertPage = await browser.newPage();
    await new AuthPage(expertPage).login(env.expertEmail, env.expertPassword);
    await new AppPage(expertPage).gotoNotifications();
    await expect(
      expertPage.getByText(/you were assigned/i),
    ).toBeVisible();
    await expertPage.close();
  });
});
