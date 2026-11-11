import { expect, test } from '@playwright/test';
import { QuestionDetailPage } from '../pages/QuestionDetailPage';
import { QuestionWorkflowPage } from '../pages/QuestionWorkflowPage';

const questionText = `e2e-pest-${Date.now()}`;
let questionDistrict = '';

test.describe('moderator creates, allocates, and receives an expert answer', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: 'playwright/.auth/moderator.json' });
  test.setTimeout(120_000);

  test('moderator creates a Manual question', async ({ page }) => {
    questionDistrict = await new QuestionWorkflowPage(page).createQuestion(questionText);
    expect(questionDistrict).not.toBe('');
  });

  test('the Manual list shows the new question and its initial values', async ({ page }) => {
    const questions = new QuestionWorkflowPage(page);
    const row = await questions.searchQuestion(questionText);

    await expect(row).toBeVisible();
    await expect(row.getByText('open', { exact: true })).toBeVisible();
    await expect(row.getByText('Tamil Nadu', { exact: true })).toBeVisible();
    await expect(row.getByText('Tomato', { exact: true })).toBeVisible();
  });

  test('the question detail shows its title and Details values', async ({ page }) => {
    const questions = new QuestionWorkflowPage(page);
    const row = await questions.searchQuestion(questionText);
    await row.getByText(questionText, { exact: true }).click();

    const detail = new QuestionDetailPage(page);
    await expect(detail.title(questionText)).toBeVisible();
    await expect(detail.detailValue('State', 'Tamil Nadu')).toBeVisible();
    await expect(detail.detailValue('District', questionDistrict)).toBeVisible();
    await expect(detail.detailValue('Crop', 'Tomato')).toBeVisible();
    await expect(detail.detailValue('Season', 'Kharif')).toBeVisible();
    await expect(detail.detailValue('Domain', 'Agricultural Schemes & Subsidies')).toBeVisible();
  });

  test('moderator allocates the question to only the configured expert', async ({ page }) => {
    const expertEmail = process.env.EXPERT_EMAIL;
    if (!expertEmail) {
      throw new Error('Missing EXPERT_EMAIL in qa-tests/.env');
    }

    const questions = new QuestionWorkflowPage(page);
    const row = await questions.searchQuestion(questionText);
    await row.getByText(questionText, { exact: true }).click();

    const detail = new QuestionDetailPage(page);
    await expect(detail.title(questionText)).toBeVisible();
    await detail.openAllocationTab();
    const autoAllocateSwitch = page.getByRole('switch', { name: 'Auto-allocate Experts' });
    if (await autoAllocateSwitch.isChecked()) {
      await autoAllocateSwitch.click();
    }
    await expect(autoAllocateSwitch).not.toBeChecked();
    await detail.selectExpertsButton().click();
    const dialog = detail.expertsDialog();
    await detail.expertSearchInput().fill(expertEmail);
    await expect(dialog.getByText(expertEmail, { exact: true })).toBeVisible();
    const expertCheckbox = dialog.getByRole('checkbox', { name: expertEmail });
    await expect(expertCheckbox).toHaveCount(1);
    await expertCheckbox.check();
    await dialog.getByRole('button', { name: 'Submit (1 selected)', exact: true }).click();

    await expect(detail.allocationQueueCount()).toHaveText('1 expert in queue');
  });
});
