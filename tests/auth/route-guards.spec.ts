import { test, expect } from '@playwright/test';

const protectedPaths = [
  '/home/',
  '/notifications/',
  '/history/',
  '/flags-reported/',
  '/audit/',
  '/coordinator/',
  '/coordinator/profile',
  '/pae-expert/',
  '/profile/',
  '/chatbot/',
  '/whatsapp-history',
  '/user/demo-user',
  '/user-history/demo-user',
];

test.describe('Route guards (unauthenticated)', () => {
  for (const path of protectedPaths) {
    test(`redirects ${path} to /auth`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/?$/, { timeout: 15_000 });
      await expect(
        page.getByRole('textbox', { name: 'Email Address' }),
      ).toBeVisible();
    });
  }

  test('root path does not expose the reviewer queue', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('textbox', { name: 'Email Address' }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Welcome Back|Join Annam/i)).toBeVisible();
  });

  test('unauthenticated session has no reviewer queue chrome', async ({
    page,
  }) => {
    await page.goto('/home/');
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });
});
