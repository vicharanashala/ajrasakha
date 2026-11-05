import { test, expect } from '@playwright/test';

test.describe('Mobile View Tests', () => {

  test.describe.configure({ timeout: 60000 });

  test('1. Application should open on mobile', async ({ page }) => {
    const response = await page.goto('/', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.ok()).toBeTruthy();
  });

  test('2. Page body should be visible on mobile', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.locator('body')).toBeVisible();
  });

  test('3. Page should have a title on mobile', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveTitle(/.+/);
  });

});