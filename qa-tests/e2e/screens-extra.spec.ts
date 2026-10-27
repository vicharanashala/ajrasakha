import { expect, test, type Page } from '@playwright/test';
import { AppPage } from '../pages/AppPage';

async function openTab(page: Page, email: string | undefined, tabName: string, tabValue: string) {
  if (!email) {
    throw new Error(`Missing account email for the ${tabName} tab.`);
  }

  const app = new AppPage(page);
  await app.seedActiveTab(page.context(), email, tabValue);
  await app.gotoHome();
  await expect(app.navigationTab(tabName)).toHaveAttribute('aria-selected', 'true');
}

test.describe('additional moderator screens', () => {
  test.use({ storageState: 'playwright/.auth/moderator.json' });
  test.setTimeout(90_000);

  test('profile shows moderator profile settings and personal information', async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoHome();
    await app.profileMenuButton().click();
    await app.profileMenuItem('Profile').click();

    await expect(page.getByRole('heading', { name: 'Profile Settings' })).toBeVisible();
    await expect(page.getByText('Moderator', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible();
  });

  test('Data Processing shows POP tabs and Run Translation', async ({ page }) => {
    await openTab(page, process.env.MODERATOR_EMAIL, 'Data Processing', 'data_processing');

    await expect(page.getByRole('button', { name: 'POP-Translation', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'POP-Management', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Translation', exact: true })).toBeVisible();
  });

  test('My Dashboard shows moderator summary cards and Check Out', async ({ page }) => {
    await openTab(page, process.env.MODERATOR_EMAIL, 'My Dashboard', 'moderatorDashboard');

    await expect(page.getByRole('heading', { name: 'Moderator Dashboard' })).toBeVisible();
    for (const label of ['Assigned Questions', 'Completed Questions', 'Pending Questions']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Check Out', exact: true })).toBeVisible();
  });

  test('All Questions shows its filter and add buttons', async ({ page }) => {
    await openTab(page, process.env.MODERATOR_EMAIL, 'All Questions', 'all_questions');

    await expect(
      page.locator('button').filter({ has: page.locator('svg.lucide-filter') }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a question', exact: true })).toBeVisible();
  });

  test('Expert Management tab is selected without an error toast', async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoHome();
    const tab = app.navigationTab('Expert Management');
    await tab.click();

    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  });
});

test.describe('additional expert screens', () => {
  test.use({ storageState: 'playwright/.auth/expert.json' });
  test.setTimeout(90_000);

  test('Dashboard shows expert summary cards', async ({ page }) => {
    await openTab(page, process.env.EXPERT_EMAIL, 'Dashboard', 'expertPerformance');

    for (const label of [
      'Rank',
      'Pending WorkLoad',
      'Incentive Points',
      'Penality',
      'Delayed Questions',
      'Working Hours',
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('All Questions shows source tabs without My Assignment', async ({ page }) => {
    await openTab(page, process.env.EXPERT_EMAIL, 'All Questions', 'all_questions');

    for (const label of [
      'AJRASKHA',
      'Manual',
      'Outreach',
      'WhatsApp',
      'Draft',
      'PAE',
      'Non-Agri',
      'Dynamic',
    ]) {
      await expect(page.getByRole('button', { name: new RegExp(`^(?:new\\s+)?${label}$`, 'i') })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'My Assignment', exact: true })).toHaveCount(0);
  });

  test('Data Processing shows POP-Translation', async ({ page }) => {
    await openTab(page, process.env.EXPERT_EMAIL, 'Data Processing', 'data_processing');

    await expect(page.getByRole('button', { name: 'POP-Translation', exact: true })).toBeVisible();
  });
});
