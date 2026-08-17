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

  /**
   * Force a refetch of this expert's "My Queue" panel.
   *
   * Playwright resolves every fixture listed in a test's parameter list
   * up front, before the test body runs (destructuring the fixtures
   * object triggers each one). That means when a test asks for both
   * `expert2Dashboard` and `expert3Dashboard`, expert3's page is loaded
   * — and its queue fetched — before the test body ever gets a chance
   * to have expert2 accept the answer that's supposed to hand the
   * question to expert3 next. The queue view doesn't poll for updates
   * (same staleness already documented on the moderator side in
   * ERW-R011 / ERW-M015), so without a reload here expert3/expert4 will
   * never see a question that became available to them *after* their
   * page first loaded.
   *
   * Call this right before waitForQuestion() whenever this expert's
   * fixture was resolved earlier than the action that unlocks their
   * turn in the review chain.
   */
  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForShell();
  }

  /**
   * Poll (reloading periodically) until this expert's question row is
   * both present AND enabled/clickable.
   *
   * A single reload() is enough for a row that just became visible for
   * the first time (see above) — but for a reviewer further down a
   * multi-reviewer chain, the row can appear immediately after the
   * prior reviewer accepts and yet stay disabled
   * (`cursor-not-allowed` / `aria-disabled`) for a while. This is
   * confirmed real backend behaviour, not a bug in this helper or a
   * product limitation: inspecting the Response History panel for
   * other, already-completed 3-reviewer chains in this same
   * environment shows the third reviewer's Accept/Reject/Modify
   * controls do become live once their turn arrives — it just isn't
   * instant, and the third hop in the chain has been observed to take
   * noticeably longer than the second. A single page snapshot never
   * updates itself (no live polling in the UI), so a plain click()
   * retry just hammers a frozen disabled element until the test times
   * out. This reloads repeatedly until the row is enabled, or gives up
   * after `timeout` so the failure is loud and diagnosable instead of
   * silently eating the whole test budget.
   *
   * Pass a larger `timeout` explicitly for reviewers further down the
   * chain (e.g. the third of three) rather than raising the default
   * for everyone — see call sites in
   * expert-triple-acceptance-workflow.spec.ts.
   */
  async waitForQuestionEnabled(
    question: string,
    timeout = 60_000,
    pollInterval = 5_000,
  ): Promise<void> {
    const deadline = Date.now() + timeout;
    const startedAt = Date.now();
    let attempt = 0;

    while (Date.now() < deadline) {
      attempt += 1;

      try {
        await this.reload();

        const remaining = Math.max(1, deadline - Date.now());

        await this.waitForQuestion(question, Math.min(5_000, remaining));

        const label = this.questionLabel(question);

        if (await label.isEnabled()) {
          console.log(
            `waitForQuestionEnabled: "${question}" became enabled after ` +
              `${attempt} attempt(s), ${Date.now() - startedAt}ms`,
          );

          return;
        }

        console.log(
          `waitForQuestionEnabled: "${question}" still disabled after ` +
            `${attempt} attempt(s), ${Date.now() - startedAt}ms elapsed ` +
            `(budget ${timeout}ms)`,
        );
      } catch (error) {
        // Never retry against a page that Playwright has already closed.
        if (this.page.isClosed()) {
          throw error;
        }

        console.log(
          `waitForQuestionEnabled: "${question}" not ready on attempt ` +
            `${attempt}, retrying...`,
        );
      }

      const remaining = deadline - Date.now();

      if (remaining <= 0) {
        break;
      }

      await this.page.waitForTimeout(Math.min(pollInterval, remaining));
    }

    throw new Error(
      `Question "${question}" did not become enabled within ` + `${timeout}ms.`,
    );
  }
  // async waitForQuestionEnabled(
  //   question: string,
  //   timeout = 120_000,
  //   pollInterval = 5_000,
  // ): Promise<void> {
  //   const label = this.questionLabel(question);
  //   const deadline = Date.now() + timeout;
  //   const startedAt = Date.now();
  //   let attempt = 0;

  //   while (Date.now() < deadline) {
  //     attempt += 1;

  //     await this.reload();
  //     await this.waitForQuestion(question);

  //     if (await label.isEnabled()) {
  //       console.log(
  //         `waitForQuestionEnabled: "${question}" became enabled after ` +
  //           `${attempt} attempt(s), ${Date.now() - startedAt}ms`,
  //       );
  //       return;
  //     }

  //     console.log(
  //       `waitForQuestionEnabled: "${question}" still disabled after ` +
  //         `${attempt} attempt(s), ${Date.now() - startedAt}ms elapsed ` +
  //         `(budget ${timeout}ms)`,
  //     );

  //     await this.page.waitForTimeout(pollInterval);
  //   }

  //   // Final attempt — let this assertion produce the real failure
  //   // message instead of a generic loop timeout.
  //   await expect(label).toBeEnabled({ timeout: 1000 });
  // }

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
