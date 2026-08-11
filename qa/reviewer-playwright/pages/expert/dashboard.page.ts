import {
  expect,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";

export type OpenedQuestion = {
  id: string;
  question: string;
  responseBody: Record<string, unknown>;
};

export class ExpertDashboardPage {
  readonly allQuestionsTab: Locator;
  readonly questionTable: Locator;
  readonly emptyState: Locator;

  constructor(private readonly page: Page) {
    this.allQuestionsTab = page.getByRole("tab", { name: "All Questions" });
    this.questionTable = page.getByRole("table");
    this.emptyState = page.getByText("No questions found", { exact: true });
  }
  async pause(): Promise<void> {
    await this.page.pause();
  }

  async waitForShell(): Promise<void> {
    await expect(this.page).toHaveURL(/\/home(?:[/?#]|$)/);
    await expect(this.allQuestionsTab).toBeVisible();
  }

  async openAllQuestions(): Promise<void> {
    await this.allQuestionsTab.click();
    await expect(
      this.page
        .getByRole("columnheader", { name: "Question" })
        .or(this.emptyState.first()),
    ).toBeVisible();
  }

  questionRows(): Locator {
    return this.page
      .locator("tbody tr")
      .filter({ has: this.page.locator("td") });
  }

  firstQuestionTrigger(): Locator {
    // The production row exposes the question as a clickable span, without a link,
    // button, accessible name, or test id. This is the narrowest stable fallback.
    return this.questionRows().first().locator("span.cursor-pointer").first();
  }

  async openFirstQuestion(): Promise<OpenedQuestion> {
    const trigger = this.firstQuestionTrigger();
    await expect(trigger).toBeVisible();

    const responsePromise = this.page.waitForResponse((response) =>
      /\/questions\/[^/]+\/full(?:\?|$)/.test(new URL(response.url()).pathname),
    );
    await trigger.click();
    const response = await responsePromise;
    expect(
      response.ok(),
      `Full question request failed: ${response.status()}`,
    ).toBeTruthy();

    const responseBody = (await response.json()) as Record<string, unknown>;
    const data = responseBody.data as Record<string, unknown> | undefined;
    expect(data?._id).toEqual(expect.any(String));
    expect(data?.question).toEqual(expect.any(String));

    return {
      id: data?._id as string,
      question: data?.question as string,
      responseBody,
    };
  }

  async clickFirstQuestionAndWaitFor(
    responsePredicate: (response: Response) => boolean,
  ): Promise<Response> {
    const trigger = this.firstQuestionTrigger();
    await expect(trigger).toBeVisible();
    const responsePromise = this.page.waitForResponse(responsePredicate);
    await trigger.click();
    return responsePromise;
  }
  private queueContainer(): Locator {
    return this.page
      .locator('[data-slot="card-content"]')
      .filter({ has: this.page.getByRole("radiogroup") });
  }

  private questionLabel(question: string): Locator {
    return this.queueContainer().getByText(question, { exact: true });
  }

  async waitForQuestion(question: string, timeout = 30_000): Promise<void> {
    const label = this.questionLabel(question);
    const container = this.queueContainer();
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      if (await label.count()) {
        await expect(label).toBeVisible();
        return;
      }

      await container.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });

      await this.page.waitForTimeout(500);
    }

    await expect(label).toBeVisible({ timeout: 1000 });
  }

  async openQuestion(question: string): Promise<void> {
    const label = this.questionLabel(question);

    await expect(label).toBeVisible();
    await label.click();
  }

  private detailsContainer(): Locator {
    return this.page.locator('[data-slot="card-content"]').filter({
      has: this.page.locator("#new-answer"),
    });
  }

  async scrollQuestionDetailsToTop(): Promise<void> {
    const details = this.detailsContainer();

    await expect(details).toBeVisible();

    await details.evaluate((el) => {
      el.scrollTop = 0;
    });

    await this.page.waitForTimeout(200);
  }
  async expectQuestionRemoved(question: string): Promise<void> {
    await expect(this.questionLabel(question)).toHaveCount(0);
  }
  async expectQuestionNotPresent(question: string): Promise<void> {
    await expect(this.questionLabel(question)).toHaveCount(0);
  }
}
