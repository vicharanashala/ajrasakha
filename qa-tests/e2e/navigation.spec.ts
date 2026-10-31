import { expect, test } from '@playwright/test';
import { AppPage } from '../pages/AppPage';

test.describe('moderator navigation', () => {
  test.use({ storageState: 'playwright/.auth/moderator.json' });
  // The moderator home page can take longer to become ready.
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await new AppPage(page).gotoHome();
  });

  test('shows the moderator navigation tabs', async ({ page }) => {
    const app = new AppPage(page);

    for (const tab of ['Dashboard', 'My Dashboard', 'All Questions', 'Expert Management']) {
      await expect(
        app.navigationTab(tab),
        `Expected the moderator navigation to show the ${tab} tab.`,
      ).toBeVisible();
    }
  });

  test('opens the Notifications panel from the bell', async ({ page }) => {
    const app = new AppPage(page);

    await app.notificationButton().click();
    await expect(app.notificationsPanel()).toBeVisible();
  });

  test('profile menu shows Profile and Logout; Logout returns to auth', async ({ page }) => {
    const app = new AppPage(page);

    await app.profileMenuButton().click();
    await expect(app.profileMenuItem('Profile')).toBeVisible();
    await expect(app.profileMenuItem('Logout')).toBeVisible();

    await app.profileMenuItem('Logout').click();
    await page.getByRole('alertdialog', { name: 'Are you sure you want to log out?' }).getByRole(
      'button',
      { name: 'Logout', exact: true },
    ).click();
    await page.waitForURL(/\/auth(?:[/?#]|$)/, { timeout: 30_000 });
  });
});

test.describe('expert navigation', () => {
  test.use({ storageState: 'playwright/.auth/expert.json' });

  test('does not show Expert Management', async ({ page }) => {
    await new AppPage(page).gotoHome();

    await expect(
      new AppPage(page).navigationTab('Expert Management'),
      'Expected the expert navigation not to show Expert Management.',
    ).toHaveCount(0);
  });
});
