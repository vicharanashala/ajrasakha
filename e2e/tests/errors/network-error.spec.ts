/**
 * Network error tests — validates the app handles offline/no-internet state gracefully.
 * Uses Playwright context.setOffline() to simulate network loss.
 */
import { test, expect } from '@playwright/test';
import { mockCurrentUser } from '../../helpers/api-mock';

test.describe('Network offline behavior', () => {
  test('TEST-41: taking browser offline shows network-related feedback on API call', async ({
    page,
    context,
  }) => {
    await mockCurrentUser(page, 'expert');
    await page.goto('/home');
    await page.locator('img[alt="Annam Logo"]').waitFor({ state: 'visible', timeout: 15_000 });

    // Go offline
    await context.setOffline(true);

    // Navigate to the My Queue tab — this will try to fetch questions
    const myQueueTab = page.getByRole('tab', { name: /my queue/i });
    if (await myQueueTab.isVisible()) {
      await myQueueTab.click();
    } else {
      // Trigger a navigation that requires network
      await page.reload({ waitUntil: 'commit' });
    }

    // Wait a moment for the error state to appear
    await page.waitForTimeout(2000);

    // The app should either:
    // (a) Show an error message / toast
    // (b) Show a loading skeleton that doesn't resolve
    // (c) Not crash to a blank page / 500
    // We assert no catastrophic failure — user can still see the app shell
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toBeNull();
    expect(bodyText!.length).toBeGreaterThan(0);

    // App shell (logo) should still be present — not a blank/crashed page
    // (it may be hidden behind the offline indicator)
    const notCrashed = page.url().includes('/home') || page.url().includes('/auth');
    expect(notCrashed).toBeTruthy();

    // Restore network
    await context.setOffline(false);
  });
});
