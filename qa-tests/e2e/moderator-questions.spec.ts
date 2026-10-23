import { expect, test } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { QuestionsPage } from '../pages/QuestionsPage';

test.describe('moderator questions', () => {
  test.use({ storageState: 'playwright/.auth/moderator.json' });

  test.beforeEach(async ({ page }) => {
    await new AppPage(page).gotoHomeTab('All Questions');
  });

  test('All Questions displays the questions table headers', async ({ page }) => {
    const questions = new QuestionsPage(page);

    for (const header of [
      'Sl.No',
      'Question',
      'State',
      'Crop',
      'Domain',
      'Status',
      'Answers',
      'Review Level',
      'Created',
    ]) {
      await expect(
        questions.tableHeader(header),
        `Expected the questions table to include the ${header} column.`,
      ).toBeVisible();
    }
  });

  test('shows all question source tabs and My Assignment', async ({ page }) => {
    const questions = new QuestionsPage(page);

    for (const mode of [
      'AJRASKHA',
      'Manual',
      'Outreach',
      'WhatsApp',
      'Draft',
      'PAE',
      'Non-Agri',
      'Dynamic',
      'My Assignment',
    ]) {
      await expect(
        questions.sourceModeButton(mode),
        `Expected the ${mode} question source tab to be visible.`,
      ).toBeVisible();
    }
  });

  test('selects Manual and Outreach source tabs', async ({ page }) => {
    const questions = new QuestionsPage(page);

    for (const mode of ['Manual', 'Outreach']) {
      const button = questions.sourceModeButton(mode);
      await button.click();
      await expect(
        button,
        `Expected ${mode} to be selected after clicking it.`,
      ).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('opens the Add New Question dialog and Cancel closes it', async ({ page }) => {
    const questions = new QuestionsPage(page);

    await questions.openAddQuestionDialog();
    await expect(questions.addQuestionDialog()).toBeVisible();

    await questions.cancelAddQuestionButton().click();
    await expect(questions.addQuestionDialog()).toBeHidden();
  });

  test('does not submit an empty question and keeps the dialog open', async ({ page }) => {
    const questions = new QuestionsPage(page);

    await questions.openAddQuestionDialog();
    await expect(questions.questionTextLabel()).toBeVisible();
    await expect(questions.questionTextInput()).toHaveValue('');
    await expect(questions.addQuestionButton()).toBeDisabled();
    await expect(questions.addQuestionDialog()).toBeVisible();
  });

  test('search filters the list to no matching questions', async ({ page }) => {
    const questions = new QuestionsPage(page);

    await questions.questionsSearchInput().fill(`e2e-no-match-${crypto.randomUUID()}`);

    await expect(questions.noQuestionsFoundText()).toBeVisible();
  });
});
