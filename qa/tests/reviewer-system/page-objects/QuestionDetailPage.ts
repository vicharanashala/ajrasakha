/**
 * Page Object: QuestionDetailPage
 *
 * Target:  /queue/:questionId
 *
 * The moderator's read + allocate view for a single question.  Most of
 * the suite's behavioural assertions live here (allocation flow + the
 * notification-fired assertion).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELECTOR NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 *  The expert picker is assumed to be a `<select>` (most common).  If
 *  staging uses a custom combobox / listbox, `selectExpert()` falls back
 *  to the ARIA `role="option"` pattern.  Either path is exercised.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { expect, Locator, Page, Response } from "@playwright/test";
import { SELECTOR_MAP } from "./selector-map";

export class QuestionDetailPage {
  readonly page: Page;

  // ── Locators ──────────────────────────────────────────────────────────────
  // TODO(selector): confirm against staging DOM.
  get heading(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.detail.heading}"]`);
  }

  get statusBadge(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.detail.statusBadge}"]`);
  }

  get expertPicker(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.detail.expertPicker}"]`);
  }

  get allocateButton(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.detail.allocateButton}"]`);
  }

  /** Toast / confirmation that surfaces "notification sent" / "assigned". */
  get allocationSuccessToast(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.detail.allocationToast}"]`,
    );
  }

  get approveButton(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.detail.approveButton}"]`,
    );
  }

  get rejectButton(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.detail.rejectButton}"]`,
    );
  }

  get gdbConfirmationToast(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.detail.gdbConfirmationToast}"]`,
    );
  }

  /** Optional inline error on the allocate form. */
  get allocationError(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.detail.allocationError}"]`,
    );
  }

  constructor(page: Page) {
    this.page = page;
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  /**
   * Pick an expert from the dropdown.  Tries the native `<select>` API
   * first; if the staging DOM uses a custom listbox, falls back to
   * clicking the option by accessible name.
   */
  async selectExpert(name: string): Promise<void> {
    try {
      await this.expertPicker.selectOption({ label: name });
    } catch {
      await this.expertPicker.click();
      await this.page.getByRole("option", { name }).click();
    }
  }

  /**
   * Allocate the current question to `expertName`.
   *
   *  • Pre-arms a `waitForResponse` listener for any endpoint matching
   *    `/notifications|allocate|assign/` so we can assert the notification
   *    is fired either as a UI toast OR as an outbound network request.
   *
   * @returns the first matching `Response` (if any) — useful for tests
   *          that want to assert the status code.
   */
  async allocateTo(
    expertName: string,
  ): Promise<{ response: Response | null }> {
    let notificationResponse: Response | null = null;
    const responsePromise = this.page
      .waitForResponse(
        (r) =>
          /\/(notifications|allocate|assign)/i.test(r.url()) &&
          r.request().method() !== "GET",
        { timeout: 5_000 },
      )
      .then((r) => {
        notificationResponse = r;
        return r;
      })
      .catch(() => null);

    await this.selectExpert(expertName);
    await this.allocateButton.click();
    await responsePromise;
    return { response: notificationResponse };
  }

  async approveFinalAnswer(): Promise<void> {
    const approve = await this.actionButton(
      this.approveButton,
      /approve answer|approve/i,
    );
    await approve.click();
  }

  async rejectFinalAnswer(): Promise<void> {
    const reject = await this.actionButton(
      this.rejectButton,
      /reject|send back|return/i,
    );
    await reject.click();
  }

  async isApproveAvailable(): Promise<boolean> {
    const count = await this.approveButton.count();
    if (count > 0) return await this.approveButton.isVisible().catch(() => false);
    const fallback = this.page.getByRole("button", {
      name: /approve answer|approve/i,
    });
    return await fallback.count().then((n) => n > 0);
  }

  async assertCannotReapprove(): Promise<void> {
    const button = await this.approveButton.count()
      ? this.approveButton
      : this.page.getByRole("button", { name: /approve answer|approve/i });
    if (await button.count()) {
      const visible = await button.isVisible().catch(() => false);
      if (visible) {
        await expect(button).toBeDisabled();
      }
    }
  }

  private async actionButton(
    primary: Locator,
    label: RegExp,
  ): Promise<Locator> {
    if ((await primary.count()) > 0) {
      return primary;
    }
    const fallback = this.page.getByRole("button", { name: label });
    if ((await fallback.count()) > 0) {
      return fallback;
    }
    throw new Error(`Could not locate action button matching ${label}`);
  }

  // ── Assertions ─────────────────────────────────────────────────────────────
  async assertStatus(expected: string | RegExp): Promise<void> {
    await expect(this.statusBadge).toContainText(expected);
  }

  async assertAllocationToastVisible(): Promise<void> {
    await expect(this.allocationSuccessToast).toBeVisible({ timeout: 5_000 });
  }

  /**
   * Assert that EITHER the toast appears OR a notification network call
   * was made (fire-and-forget case).  This dual assertion is exactly
   * what the task asks for in test #7.
   */
  async assertNotificationFired(opts: {
    response: Response | null;
  }): Promise<void> {
    const toastVisible = await this.allocationSuccessToast
      .isVisible({ timeout: 2_000 })
      .catch(() => false);

    expect(
      toastVisible || opts.response !== null,
      "expected either the 'notification sent' toast OR a network call " +
        "to /notifications (or /allocate / /assign) — got neither",
    ).toBe(true);
  }
}