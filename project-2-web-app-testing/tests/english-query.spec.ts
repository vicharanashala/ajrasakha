import { test, expect } from '@playwright/test';

test.describe('English Query Tests', () => {

  test.describe.configure({ timeout: 60000 });

  test('1. AjraSakha page should open successfully', async ({ page }) => {
    const response = await page.goto('/', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.ok()).toBeTruthy();
  });

  test('2. Page should have a title', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveTitle(/.+/);
  });

  test('3. Page body should be visible', async ({ page }) => {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.locator('body')).toBeVisible();
  });

});