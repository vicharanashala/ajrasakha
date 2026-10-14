import { test, expect } from '@playwright/test';

test.describe('Visual Regression Tests', () => {
  test('homepage visual snapshot', async ({ page }) => {
    // Navigate to the frontend page you want to test
    // Assuming the local frontend runs on localhost:5173
    await page.goto('http://localhost:5173');

    // Wait for a specific element or just network idle to ensure everything is loaded
    await page.waitForLoadState('networkidle');

    // Take a full page screenshot and compare it with the golden image
    // The first time this runs, it will create the baseline image.
    // Subsequent runs will compare against the baseline.
    await expect(page).toHaveScreenshot('homepage-snapshot.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01 // allow small percentage difference
    });
  });

  // Example of capturing just a specific component
  test('navigation bar snapshot', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Select the component you want to test visually
    // const navbar = page.locator('nav');
    // await expect(navbar).toHaveScreenshot('navbar-snapshot.png');
  });
});
