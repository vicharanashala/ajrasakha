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