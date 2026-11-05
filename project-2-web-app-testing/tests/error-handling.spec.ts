import { test, expect } from '@playwright/test';

test.describe('Error Handling Tests', () => {

  test.describe.configure({ timeout: 60000 });

  test('1. Application should open successfully', async ({ page }) => {
    const response = await page.goto('/', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.ok()).toBeTruthy();
  });

  test('2. Page should remain visible after loading', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.locator('body')).toBeVisible();
  });

  test('3. Page should have a title', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveTitle(/.+/);
  });

});