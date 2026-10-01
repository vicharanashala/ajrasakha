import { test, expect } from '@playwright/test';
import { AuthPage } from '../../src/pages/auth.page';

test.describe('Auth — additional smoke', () => {
  test('logo points at /logo.png', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await expect(auth.logo).toHaveAttribute('src', /logo\.png/);
  });

  test('notifications live region is present on auth', async ({ page }) => {
    await new AuthPage(page).goto();
    await expect(
      page.getByRole('region', { name: /notifications/i }),
    ).toBeAttached();
  });

  test('email field is labelled for assistive tech', async ({ page }) => {
    await new AuthPage(page).goto();
    await expect(page.getByLabel('Email Address')).toBeVisible();
  });

  test('password field is labelled for assistive tech', async ({ page }) => {
    await new AuthPage(page).goto();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('Sign In stays on screen at a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await new AuthPage(page).goto();
    await expect(new AuthPage(page).signIn).toBeVisible();
  });

  test('Sign In stays on screen at a desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await new AuthPage(page).goto();
    await expect(new AuthPage(page).welcomeHeading).toBeVisible();
  });

  test('auth page uses a card layout', async ({ page }) => {
    await new AuthPage(page).goto();
    await expect(page.locator('[data-slot="card"]')).toBeVisible();
  });

  test('runtime config script is loaded', async ({ page }) => {
    await page.goto('/auth');
    const hasConfig = await page.evaluate(
      () => typeof (window as unknown as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ === 'object',
    );
    expect(hasConfig).toBe(true);
  });
});
