/**
 * Mobile auth tests — login page on a Pixel 5 viewport (393×851).
 * Tests that the form is usable on small screens.
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';

// Override storageState — auth tests start logged out
test.use({ storageState: { cookies: [], origins: [] } });

// Use mobile viewport for all tests in this file
test.use({ viewport: { width: 393, height: 851 } });

test.describe('Mobile — auth page', () => {
  test('TEST-44: login page renders correctly on mobile (393×851)', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.expectLoginFormVisible();

    // The card should not overflow the viewport
    const card = page.locator('[class*="Card"], .card, form').first();
    const box = await card.boundingBox();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(393 + 16); // allow 16px overflow for shadows
    }
  });

  test('TEST-45: email and password inputs are tappable on mobile', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Tap (mobile) on email input
    await page.touchscreen.tap(
      (await loginPage.emailInput.boundingBox())!.x + 10,
      (await loginPage.emailInput.boundingBox())!.y + 10
    );
    await loginPage.emailInput.type('mobile@test.com');
    await expect(loginPage.emailInput).toHaveValue('mobile@test.com');
  });
});
