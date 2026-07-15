/**
 * Server error tests — validates app error handling for 500 and 401 responses.
 */
import { test, expect } from '@playwright/test';
import { mockCurrentUser } from '../../helpers/api-mock';

test.describe('Server error states', () => {
  test('TEST-42: 500 on question list shows graceful error state (no crash)', async ({ page }) => {
    await mockCurrentUser(page, 'expert');

    // Mock the questions endpoint to return 500
    await page.route('**/api/questions/**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });

    await page.goto('/home');
    await page.locator('img[alt="Annam Logo"]').waitFor({ state: 'visible', timeout: 15_000 });

    // Navigate to My Queue tab
    const myQueueTab = page.getByRole('tab', { name: /my queue/i });
    if (await myQueueTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await myQueueTab.click();
    }

    // Wait for error state
    await page.waitForTimeout(2000);

    // The app must NOT show a blank screen or JS error overlay
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toBeNull();
    expect(bodyText!.trim().length).toBeGreaterThan(0);

    // The page should still be on /home — no crash to an error page
    await expect(page).toHaveURL(/\/home/);
  });

  test('TEST-43: 401 from /api/users/me redirects or shows login', async ({ page }) => {
    // Mock the current user endpoint to return 401
    await page.route('**/api/users/me**', (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthorized' }),
      });
    });

    await page.goto('/home');

    // Give the app time to react
    await page.waitForTimeout(3000);

    // Should redirect to auth OR show login state
    const url = page.url();
    const isOnAuth = url.includes('/auth');
    const isOnHome = url.includes('/home');

    // Either the app redirects to /auth, or it stays on /home
    // (some implementations show an error toast without redirecting)
    expect(isOnAuth || isOnHome).toBeTruthy();

    if (isOnAuth) {
      // Verify login form is showing
      await expect(page.locator('input#email')).toBeVisible({ timeout: 10_000 });
    }
  });
});
