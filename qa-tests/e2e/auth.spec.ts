import { expect, test } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { QuestionsPage } from '../pages/QuestionsPage';

test.describe('unauthenticated visitors', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login page shows the welcome text and both fields', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();

    await expect(loginPage.welcomeBackText()).toBeVisible();
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('wrong password shows an error and stays on the login page', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.signIn(process.env.MODERATOR_EMAIL ?? '', 'incorrect-password');

    await expect(page.getByText(/invalid credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/auth(?:[/?#]|$)/);
  });
});

test.describe('moderator session', () => {
  test.use({ storageState: 'playwright/.auth/moderator.json' });

  test('lands outside /auth and shows All Questions navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/home/, { timeout: 30_000 });

    await expect(page).not.toHaveURL(/\/auth(?:[/?#]|$)/);
    await expect(
      new QuestionsPage(page).allQuestionsTab(),
      'Expected the moderator session to show the All Questions tab on the home page.',
    ).toBeVisible();
  });
});

test.describe('expert session', () => {
  test.use({ storageState: 'playwright/.auth/expert.json' });

  test('shows My Queue and does not show Expert Management', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/home/, { timeout: 30_000 });

    const questionsPage = new QuestionsPage(page);
    await expect(
      questionsPage.myQueueTab(),
      'Expected the expert session to show the My Queue tab on the home page.',
    ).toBeVisible();
    await expect(
      questionsPage.expertManagementTab(),
      'Expected the expert session not to show the Expert Management tab.',
    ).toHaveCount(0);
  });
});
