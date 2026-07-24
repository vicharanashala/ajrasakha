import { expect, type Locator, type Page, type Response } from "@playwright/test";

export type OpenedQuestion = {
  id: string;
  question: string;
  responseBody: Record<string, unknown>;
};

export class DashboardPage {
  readonly allQuestionsTab: Locator;
  readonly questionTable: Locator;
  readonly emptyState: Locator;

  constructor(private readonly page: Page) {
    this.allQuestionsTab = page.getByRole("tab", { name: "All Questions" });
    this.questionTable = page.getByRole("table");
    this.emptyState = page.getByText("No questions found", { exact: true });
  }

  async waitForShell(): Promise<void> {
    await expect(this.page).toHaveURL(/\/home(?:[/?#]|$)/);
    await expect(this.allQuestionsTab).toBeVisible();
  }

  async openAllQuestions(): Promise<void> {
    await this.allQuestionsTab.click();
    await expect(
      this.page.getByRole("columnheader", { name: "Question" }).or(this.emptyState.first()),
    ).toBeVisible();
  }

  questionRows(): Locator {
    return this.page.locator("tbody tr").filter({ has: this.page.locator("td") });
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
    expect(response.ok(), `Full question request failed: ${response.status()}`).toBeTruthy();

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

  async clickFirstQuestionAndWaitFor(responsePredicate: (response: Response) => boolean): Promise<Response> {
    const trigger = this.firstQuestionTrigger();
    await expect(trigger).toBeVisible();
    const responsePromise = this.page.waitForResponse(responsePredicate);
    await trigger.click();
    return responsePromise;
  }
}
