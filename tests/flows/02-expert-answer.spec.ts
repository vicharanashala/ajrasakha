import { test, expect } from '@playwright/test';
import { AuthPage } from '../../src/pages/auth.page';
import { env } from '../../src/env';
import { AppPage } from '../../src/pages/app.page';

test.describe('Flow 2 — expert answers an assigned question', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/test/reset');
  });

  test('expert can sign in on the local desk', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.login(env.expertEmail, env.expertPassword);
    await auth.expectLoggedIn();
    expect(page.url()).not.toMatch(/vicharanashala\.ai/);
  });

  test('expert home shows assigned work', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.login(env.expertEmail, env.expertPassword);
    const app = new AppPage(page);
    await app.gotoHome();
    await app.expectAuthenticatedShell();
    await expect(page.getByText(/assigned questions/i)).toBeVisible();
    await expect(page.getByText(/ragi/i)).toBeVisible();
  });

  test('expert submits an answer and the next reviewer is notified', async ({
    page,
    browser,
  }) => {
    await new AuthPage(page).login(env.moderatorEmail, env.moderatorPassword);
    await new AppPage(page).gotoHome();
    await page.getByRole('button', { name: /allocate expert/i }).click();

    const expertPage = await browser.newPage();
    await new AuthPage(expertPage).login(env.expertEmail, env.expertPassword);
    await new AppPage(expertPage).gotoHome();
    await expertPage.getByPlaceholder('Write the farmer-facing answer').fill(
      'Treat seed and remove infected leaves.',
    );
    await expertPage.locator('#submit-answer').click();
    await expect(expertPage.getByText(/pae_submitted/i).first()).toBeVisible();
    await expertPage.close();

    await page.getByRole('link', { name: /notifications/i }).click();
    await expect(page.getByText(/next reviewer: answer submitted/i)).toBeVisible();
  });
});
