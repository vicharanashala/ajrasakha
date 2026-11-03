import { test, expect } from '@playwright/test';

test('AjraSakha website should open successfully', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/.+/);
});