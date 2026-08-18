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

  // Lazily-initialized CDP session used to force real cache bypass on
  // reload() — see comment there for why this exists.
  private cacheDisabled = false;

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
   * Disables the browser's HTTP cache for this page via CDP, once.
   *
   * Root cause of the "expert4 stuck disabled for 5 straight minutes,
   * every run" failure: it wasn't backend latency at all. Checking the
   * moderator's Allocation Queue view mid-run showed expert4's status
   * pill as "Waiting" (tooltip: "Expert is currently reviewing Expert's
   * answer") — i.e. the backend had already handed over the turn — and
   * manually opening the same question in a real browser showed it as
   * fully actionable. A plain `page.reload()` still honors normal
   * browser HTTP caching/revalidation, so a tight poll loop (reload
   * every 10-15s) can keep being served the exact same stale "not your
   * turn yet" response for far longer than any real backend delay,
   * while a human — who takes longer than that between manual steps
   * regardless — lets the cache entry expire naturally before they
   * check. This forces every subsequent reload() to skip cache
   * entirely (Chromium only, matches this project's single configured
   * browser), so the poll loop actually sees fresh data each time
   * instead of re-reading the same cached response.
   */
  private async ensureCacheDisabled(): Promise<void> {
    if (this.cacheDisabled) {
      return;
    }

    try {
      const client = await this.page.context().newCDPSession(this.page);
      await client.send("Network.setCacheDisabled", { cacheDisabled: true });
      this.cacheDisabled = true;
    } catch (error) {
      // Non-Chromium browsers don't support this CDP domain. Degrade
      // gracefully rather than failing the whole reload — worst case
      // we're back to the old (potentially stale) behaviour.
      console.log(
        `ExpertDashboardPage: could not disable cache via CDP (${
          (error as Error).message
        }); reload() may see cached responses.`,
      );
    }
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
   * Also bypasses HTTP cache (see ensureCacheDisabled) so repeated
   * calls during a poll loop actually observe fresh state.
   *
   * Call this right before waitForQuestion() whenever this expert's
   * fixture was resolved earlier than the action that unlocks their
   * turn in the review chain.
   */
  async reload(): Promise<void> {
    await this.ensureCacheDisabled();
    await this.page.reload();
    await this.waitForShell();
  }

  /**
   * Poll (reloading periodically, with cache bypassed) until this
   * expert's question row is both present AND enabled/clickable.
   *
   * See reload()/ensureCacheDisabled() above for why a plain reload
   * wasn't enough — this now bypasses HTTP cache on every attempt, so
   * a stale cached response can no longer make an already-unlocked
   * turn look permanently disabled. Kept as a bounded, diagnosable poll
   * (rather than one reload + a bare assertion) since some genuine
   * propagation delay on top of the cache issue is still plausible.
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
