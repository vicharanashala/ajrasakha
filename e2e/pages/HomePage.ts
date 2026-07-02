import { Page, Locator, expect } from '@playwright/test';
import { Selectors } from '../helpers/selectors';

/**
 * HomePage – encapsulates all interactions with the main /home dashboard.
 */
export class HomePage {
  readonly page: Page;

  // Nav tabs
  readonly allQuestionsTab: Locator;
  readonly agentsInterfaceTab: Locator;
  readonly myQueueTab: Locator;

  // QA panel
  readonly answerTextarea: Locator;
  readonly remarksTextarea: Locator;
  readonly translateTrigger: Locator;
  readonly translateMenu: Locator;
  readonly timerDisplay: Locator;

  constructor(page: Page) {
    this.page = page;
    this.allQuestionsTab = page.getByRole('tab', { name: /all questions/i });
    this.agentsInterfaceTab = page.getByRole('tab', { name: /agents interface/i });
    this.myQueueTab = page.getByRole('tab', { name: /my queue/i });

    this.answerTextarea = page.locator(Selectors.qa.answerTextarea);
    this.remarksTextarea = page.locator(Selectors.qa.remarksTextarea);
    this.translateTrigger = page.locator(Selectors.qa.translateTrigger);
    this.translateMenu = page.locator(Selectors.qa.translateMenu);
    this.timerDisplay = page.locator(Selectors.qa.timerDisplay);
  }

  async goto(): Promise<void> {
    await this.page.goto('/home');
    // Wait for the header logo to confirm the page has loaded
    await this.page.locator('img[alt="Annam Logo"]').waitFor({ state: 'visible', timeout: 20_000 });
  }

  async navigateToTab(tab: 'allQuestions' | 'agentsInterface' | 'myQueue'): Promise<void> {
    const tabMap = {
      allQuestions: this.allQuestionsTab,
      agentsInterface: this.agentsInterfaceTab,
      myQueue: this.myQueueTab,
    };
    await tabMap[tab].click();
    // Wait for tab content to animate in (TanStack Tabs uses CSS animations)
    await this.page.waitForTimeout(400);
  }

  /** Click a question item in the queue by matching its text */
  async selectQuestionByText(text: string | RegExp): Promise<void> {
    const item = this.page.getByText(text).first();
    await item.waitFor({ state: 'visible', timeout: 10_000 });
    await item.click();
    // Wait for the answer panel to appear
    await this.answerTextarea.waitFor({ state: 'visible', timeout: 10_000 });
  }

  /** Select the first question in the queue */
  async selectFirstQuestion(): Promise<void> {
    // Questions are rendered inside cards — click the first clickable question text
    const firstQuestion = this.page
      .locator('[class*="card"], [class*="Card"]')
      .filter({ has: this.page.locator('p, span').first() })
      .first();
    await firstQuestion.waitFor({ state: 'visible', timeout: 10_000 });
    await firstQuestion.click();
    await this.answerTextarea.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async fillAnswer(text: string): Promise<void> {
    await this.answerTextarea.fill(text);
  }

  async clearAnswer(): Promise<void> {
    await this.answerTextarea.fill('');
  }

  async submitAnswer(): Promise<void> {
    // The submit button is contextually located near the answer textarea
    const btn = this.page.getByRole('button', { name: /submit/i }).last();
    await btn.click();
  }

  /** Open the translate dropdown and pick a language by name */
  async translateQuery(languageName: string): Promise<void> {
    // Click the translate trigger button (finds the first one — query area)
    const trigger = this.page.locator(Selectors.qa.translateTrigger).first();
    await trigger.waitFor({ state: 'visible', timeout: 8_000 });
    await trigger.click();

    // Wait for dropdown menu
    const menu = this.page.locator(Selectors.qa.translateMenu).first();
    await menu.waitFor({ state: 'visible', timeout: 5_000 });

    // Click the language option
    await menu.getByText(languageName, { exact: false }).first().click();
  }

  async expectOnHomePage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/home/, { timeout: 20_000 });
    await expect(this.page.locator('img[alt="Annam Logo"]')).toBeVisible();
  }

  async expectTimerVisible(): Promise<void> {
    await expect(this.timerDisplay.first()).toBeVisible({ timeout: 10_000 });
  }

  async expectAnswerPanelVisible(): Promise<void> {
    await expect(this.answerTextarea).toBeVisible({ timeout: 10_000 });
  }

  /** Get the mobile sidebar toggle (hamburger) */
  get mobileSidebarToggle(): Locator {
    // Try by aria-label first, then by button near the header right side
    return this.page.getByRole('button', { name: /menu|sidebar|navigation/i })
      .or(this.page.locator('header button').last());
  }
}
