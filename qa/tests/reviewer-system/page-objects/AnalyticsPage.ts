/**
 * Page Object: AnalyticsPage
 *
 * Target:  /analytics  (moderator + coordinator analytics dashboard)
 *
 * PR #4 adds coverage for the analytics dashboard: metric cards render real
 * numbers (not "undefined" / "[object Object]"), values update after a
 * relevant action, and the date-range filter narrows the data correctly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELECTOR NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 *  The dashboard exposes a stable `data-testid="analytics-metric-${name}"`
 *  wrapper per metric, with `…-value` and `…-label` children.  Metric names
 *  are declared in SELECTOR_MAP.analyticsMetrics so a rename is one line.
 *
 *  Date-range inputs are assumed to be `<input type="date">` elements (the
 *  most common a11y-friendly staging choice); if the frontend uses a
 *  custom listbox the apply() helper falls back to clicking the apply
 *  button after typing.
 *
 *  Block-level helpers also accept a network-level fallback: if a metric's
 *  number is computed client-side from /analytics API responses, we listen
 *  for the matching response so a failed fetch surfaces clearly.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { expect, Locator, Page, Response } from "@playwright/test";
import { SELECTOR_MAP, Routes, AnalyticsMetricName } from "./selector-map";

/** Metric value parsed into its canonical JS form. */
export interface ParsedMetric {
  raw: string;
  /** Integer / float when the rendered text is purely numeric. */
  number: number | null;
  /** True iff the dashboard rendered "undefined", "[object Object]", or "NaN". */
  isPlaceholder: boolean;
  /** True iff the rendered value is negative. */
  isNegative: boolean;
}

export class AnalyticsPage {
  readonly page: Page;

  // ── Locators ──────────────────────────────────────────────────────────────
  // TODO(selector): confirm against staging DOM.
  get heading(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.analytics.heading}"]`);
  }

  get errorBanner(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.analytics.errorBanner}"]`);
  }

  get emptyState(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.analytics.emptyState}"]`);
  }

  get loadingIndicator(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.analytics.loadingIndicator}"]`);
  }

  get dateRangeStart(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.analytics.dateRangeStart}"]`);
  }

  get dateRangeEnd(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.analytics.dateRangeEnd}"]`);
  }

  get dateRangeApply(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.analytics.dateRangeApply}"]`);
  }

  get dateRangeError(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.analytics.dateRangeError}"]`);
  }

  constructor(page: Page) {
    this.page = page;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  async goto(path: string = Routes.analytics): Promise<void> {
    await this.page.goto(path);
  }

  // ── Metric helpers ────────────────────────────────────────────────────────
  /** Outer metric wrapper `analytics-metric-${name}`. */
  metricCard(name: AnalyticsMetricName | string): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.analytics.metricPrefix}${name}"]`,
    );
  }

  /** Numeric value rendered inside a metric card. */
  metricValue(name: AnalyticsMetricName | string): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.analytics.metricPrefix}${name}${SELECTOR_MAP.analytics.metricValueSuffix}"]`,
    );
  }

  /** Optional label rendered above the value (e.g. "Questions reviewed"). */
  metricLabel(name: AnalyticsMetricName | string): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.analytics.metricPrefix}${name}${SELECTOR_MAP.analytics.metricLabelSuffix}"]`,
    );
  }

  /**
   * Read the metric card and return a parsed object — raw text plus
   * the numeric form when applicable, and a flag for the common
   * "undefined / [object Object] / NaN" rendering bugs.
   */
  async readMetric(name: AnalyticsMetricName | string): Promise<ParsedMetric> {
    const value = this.metricValue(name);
    const raw = (await value.innerText().catch(() => "")).trim();
    const placeholderPattern = /^(undefined|null|nan|\[object\s+\w+\]|\s*)$/i;
    const isPlaceholder = placeholderPattern.test(raw);
    const numericCandidate = raw.replace(/[,\s]/g, "").replace(/[^\d.\-eE+]/g, "");
    const number =
      numericCandidate.length === 0 || isPlaceholder
        ? null
        : Number(numericCandidate);
    const isNegative = !!number && number < 0;
    return {
      raw,
      number: number !== null && Number.isFinite(number) ? number : null,
      isPlaceholder,
      isNegative,
    };
  }

  /**
   * Wait for the dashboard to finish loading.  Resolves as soon as the
   * loading indicator disappears (or, if absent, the heading + first
   * metric become visible).
   */
  async waitForLoaded(): Promise<void> {
    const hasLoading = (await this.loadingIndicator.count()) > 0;
    if (hasLoading) {
      await this.loadingIndicator
        .first()
        .waitFor({ state: "hidden", timeout: 15_000 })
        .catch(() => undefined);
    }
    await this.heading.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  }

  // ── Date-range filter ─────────────────────────────────────────────────────
  /**
   * Apply a date-range filter.  Returns the `Response` of the underlying
   * network call (if any) so tests can assert it fired.
   */
  async applyDateRange(opts: {
    start: string; // ISO date YYYY-MM-DD
    end: string; // ISO date YYYY-MM-DD
  }): Promise<{ response: Response | null }> {
    let response: Response | null = null;
    const listener = this.page
      .waitForResponse(
        (r) =>
          /\/analytics/i.test(r.url()) &&
          r.request().method() === "GET" &&
          !r.url().includes("static"),
        { timeout: 15_000 },
      )
      .then((r) => {
        response = r;
        return r;
      })
      .catch(() => null);

    await this.dateRangeStart.fill(opts.start).catch(() => undefined);
    await this.dateRangeEnd.fill(opts.end).catch(() => undefined);
    // Trigger applies via either the explicit apply button OR a filter event
    // (e.g. blur, change) keyed off the inputs.
    if ((await this.dateRangeApply.count()) > 0) {
      await this.dateRangeApply.click();
    } else {
      await this.dateRangeEnd.press("Enter").catch(() => undefined);
    }
    await listener;
    return { response };
  }

  /**
   * Apply a default 14-day window ending today — useful when a test only
   * cares that "some non-default range narrows the data".
   */
  async applyRollingWindow(days: number = 14): Promise<{ response: Response | null }> {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const fmt = (d: Date): string => d.toISOString().slice(0, 10);
    return this.applyDateRange({ start: fmt(start), end: fmt(end) });
  }

  // ── Assertions ─────────────────────────────────────────────────────────────
  async assertOnAnalyticsPage(): Promise<void> {
    await expect(this.page).toHaveURL(
      new RegExp(`${Routes.analytics}(\\?|$|/)`),
    );
  }

  /**
   * The dashboard must not show an error banner.  The error banner is
   * the user's signal that the analytics endpoint failed — surfacing
   * this in CI catches outages (or 401 / 403 expired-session bugs).
   */
  async assertNoErrorBanner(): Promise<void> {
    if ((await this.errorBanner.count()) > 0) {
      await expect(this.errorBanner).not.toBeVisible({ timeout: 1_000 });
    }
  }

  /**
   * Assert a metric is present and rendered as a real number (not
   * "undefined" / "[object Object]" / NaN).  Tolerance is set to allow
   * zero values — empty data is not the same as broken rendering.
   */
  async assertMetricRendersRealNumber(name: AnalyticsMetricName | string): Promise<void> {
    const parsed = await this.readMetric(name);
    expect(
      parsed.isPlaceholder,
      `metric "${name}" rendered a placeholder: "${parsed.raw}"`,
    ).toBe(false);
    expect(
      parsed.raw,
      `metric "${name}" rendered an empty cell`,
    ).not.toMatch(/^\s*$/);
    expect(
      parsed.raw.toLowerCase(),
      `metric "${name}" rendered NaN`,
    ).not.toBe("nan");
    if (parsed.number !== null) {
      expect(parsed.isNegative, `metric "${name}" is negative: ${parsed.number}`).toBe(
        false,
      );
    }
  }
}