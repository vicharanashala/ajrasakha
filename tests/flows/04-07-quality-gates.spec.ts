import { test, expect } from '@playwright/test';
import { AuthPage } from '../../src/pages/auth.page';
import { env } from '../../src/env';
import { AppPage } from '../../src/pages/app.page';

test.describe('Scenario 4 — stuck question indicator', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/test/reset');
  });

  test('delayed / stuck questions are distinguishable in the queue', async ({
    page,
  }) => {
    const auth = new AuthPage(page);
    await auth.login(env.moderatorEmail, env.moderatorPassword);
    const app = new AppPage(page);
    await app.gotoHome();
    await expect(page.getByText(/stuck delayed/i).first()).toBeVisible();
    await expect(page.getByText(/Stuck/).first()).toBeVisible();
  });
});

test.describe('Scenario 5 — reputation after review', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/test/reset');
  });

  test('profile score increases after a moderator approves an answer', async ({
    page,
  }) => {
    const auth = new AuthPage(page);
    await auth.login(env.moderatorEmail, env.moderatorPassword);
    const app = new AppPage(page);
    await app.gotoProfile();
    await expect(page.getByText(/reputation score/i)).toBeVisible();
    await expect(page.locator('#reputation-score')).toHaveText('120');
    await app.gotoHome();
    await page.getByRole('button', { name: /approve final answer/i }).click();
    await app.gotoProfile();
    await expect(page.locator('#reputation-score')).toHaveText('122');
  });
});

test.describe('Scenario 6 — queue details counts', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/test/reset');
  });

  test('home/queue shows numeric section counts', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.login(env.moderatorEmail, env.moderatorPassword);
    const app = new AppPage(page);
    await app.gotoHome();
    await expect(page.getByText(/Open/)).toBeVisible();
    await expect(page.getByText(/Delayed/)).toBeVisible();
    await expect(page.getByText(/Closed/)).toBeVisible();
    await expect(app.queueCounts().first()).toBeVisible();
  });
});

test.describe('Scenario 7 — analytics update', () => {
  test.beforeEach(async ({ request }) => {
    await request.post('/api/test/reset');
  });

  test('analytics GDB count updates after approve', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.login(env.moderatorEmail, env.moderatorPassword);
    await page.getByRole('link', { name: /analytics/i }).click();
    await expect(page.getByText(/analytics dashboard/i)).toBeVisible();
    await expect(page.locator('.count', { hasText: 'GDB entries' })).toContainText('2');
    await new AppPage(page).gotoHome();
    await page.getByRole('button', { name: /approve final answer/i }).click();
    await page.getByRole('link', { name: /analytics/i }).click();
    await expect(page.locator('.count', { hasText: 'GDB entries' })).toContainText('3');
  });
});
