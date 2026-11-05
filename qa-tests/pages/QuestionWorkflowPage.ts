import type { Locator, Page } from '@playwright/test';
import { AppPage } from './AppPage';

export class QuestionWorkflowPage {
  constructor(private readonly page: Page) {}

  async openManualQuestions() {
    await new AppPage(this.page).gotoHomeTab('All Questions');
    await this.page.getByRole('button', { name: /^(?:new\s+)?Manual$/i }).click();
  }

  async createQuestion(questionText: string) {
    await this.openManualQuestions();
    await this.page.getByRole('button', { name: 'Add a question' }).click();

    const dialog = this.page.getByRole('dialog', { name: 'Add New Question' });
    await dialog.getByLabel('Question Text*').fill(questionText);
    await this.selectFieldOption(dialog, 'Priority*', 'High');
    await this.selectFieldOption(dialog, 'State*', 'Tamil Nadu');

    const district = await this.selectFirstFieldOption(dialog, 'District*');

    await this.selectFieldOption(dialog, 'Crop*', 'Tomato');
    await this.selectFieldOption(dialog, 'Season*', 'Kharif');
    await this.selectFieldOption(dialog, 'Domain*', 'Agricultural Schemes & Subsidies');

    await dialog.getByRole('button', { name: 'Add Question', exact: true }).click();
    return district;
  }

  async searchQuestion(questionText: string) {
    await this.openManualQuestions();
    await this.page.getByRole('textbox', { name: 'Search questions' }).fill(questionText);
    return this.page.getByRole('row').filter({ hasText: questionText });
  }

  private async selectFieldOption(dialog: Locator, label: string, option: string) {
    await this.fieldControl(dialog, label).click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
  }

  private async selectFirstFieldOption(dialog: Locator, label: string) {
    await this.fieldControl(dialog, label).click();
    const option = this.page.getByRole('listbox').getByRole('option').first();
    const value = (await option.innerText()).trim();
    await option.click();
    return value;
  }

  private fieldControl(dialog: Locator, label: string) {
    return dialog
      .getByText(label, { exact: true })
      .locator('xpath=../..')
      .getByRole('combobox')
      .first();
  }
}
