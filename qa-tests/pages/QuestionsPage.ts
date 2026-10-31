import type { Page } from '@playwright/test';

export class QuestionsPage {
  constructor(private readonly page: Page) {}

  async openAllQuestions() {
    await this.allQuestionsTab().click();
  }

  dashboardTab() {
    return this.page.getByRole('tab', { name: 'Dashboard', exact: true });
  }

  myDashboardTab() {
    return this.page.getByRole('tab', { name: 'My Dashboard', exact: true });
  }

  allQuestionsTab() {
    return this.page.getByRole('tab', { name: 'All Questions', exact: true });
  }

  myQueueTab() {
    return this.page.getByRole('tab', { name: 'My Queue', exact: true });
  }

  expertManagementTab() {
    return this.page.getByRole('tab', { name: 'Expert Management', exact: true });
  }

  sourceModeButton(name: string) {
    return this.page.getByRole('button', { name: new RegExp(`^(?:new\\s+)?${name}$`, 'i') });
  }

  questionsSearchInput() {
    return this.page.getByRole('textbox', { name: 'Search questions' });
  }

  async openAddQuestionDialog() {
    await this.page.getByRole('button', { name: 'Add a question' }).click();
  }

  addQuestionDialog() {
    return this.page.getByRole('dialog', { name: 'Add New Question' });
  }

  questionTextLabel() {
    return this.page.getByLabel('Question Text*');
  }

  questionTextInput() {
    return this.addQuestionDialog().getByLabel('Question Text*');
  }

  addQuestionButton() {
    return this.addQuestionDialog().getByRole('button', { name: 'Add Question' });
  }

  cancelAddQuestionButton() {
    return this.addQuestionDialog().getByRole('button', { name: 'Cancel' });
  }

  tableHeader(name: string) {
    return this.page.getByRole('table').getByRole('columnheader', { name, exact: true });
  }

  noQuestionsFoundText() {
    return this.page.getByRole('cell', { name: 'No questions found' });
  }

  questionQueuesHeading() {
    return this.page.getByText('Question Queues', { exact: true });
  }

  allocatedQuestionsSelector() {
    return this.page.getByRole('combobox').filter({ hasText: 'Allocated Questions' });
  }

  preferencesButton() {
    return this.page.getByRole('button', { name: 'Preferences', exact: true });
  }

  queueEmptyState() {
    return this.page.getByText(/No questions are available at the moment/);
  }

  allocatedQuestionOptions() {
    return this.page.getByRole('radio');
  }
}
