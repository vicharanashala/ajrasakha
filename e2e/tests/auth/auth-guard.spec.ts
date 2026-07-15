/**
 * Auth guard — unauthenticated users must be redirected to /auth.
 */
import { test, expect } from '@playwright/test';

// Ensure NO auth state for this file
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth guard', () => {
  test('TEST-10: unauthenticated user visiting /home is redirected to /auth', async ({ page }) => {
    await page.goto('/home');
    // The app should redirect to /auth since there is no user in authStore
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
  });

  test('TEST-11: unauthenticated user visiting / lands on /auth', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
  });
});
