import type { Page } from '@playwright/test';
import { AppPage } from './AppPage';

export class ExpertQueuePage {
  constructor(private readonly page: Page) {}

  async openMyQueue() {
    await new AppPage(this.page).gotoHomeTab('My Queue');
    await this.page.getByRole('heading', { name: 'Question Queues', exact: true }).waitFor({
      state: 'visible',
    });
  }

  question(questionText: string) {
    return this.page.getByRole('radio', { name: questionText, exact: true });
  }

  answerInput() {
    return this.page.getByLabel('Draft Response:', { exact: true });
  }

  submitButton() {
    return this.page.getByRole('button', { name: 'Submit', exact: true });
  }

  confirmSubmitButton() {
    return this.page.getByRole('button', { name: 'Submit Response', exact: true });
  }

  sourceTypeSelector() {
    return this.page.getByRole('combobox').filter({ hasText: 'Select Source Type' });
  }

  sourceNameInput() {
    return this.page.getByPlaceholder('State Source Name', { exact: true });
  }

  sourceUrlInput() {
    return this.page.getByPlaceholder('State Source Link URL', { exact: true });
  }

  async addStateSource(url: string) {
    const sourceType = this.sourceTypeSelector();
    if (await sourceType.isVisible()) {
      await sourceType.click();
      await this.page.getByRole('option', { name: 'State', exact: true }).click();
    }
    await this.sourceNameInput().fill('E2E reference');
    const sourceUrl = this.sourceUrlInput();
    await sourceUrl.fill(url);
    await sourceUrl.press('Enter');
  }
}
