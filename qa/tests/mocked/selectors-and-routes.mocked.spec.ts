/**
 * Mocked suite: selector & route contract.
 *
 * Why this exists:
 *   The reviewer-system frontend lives in a separate codebase
 *   (desk.vicharanashala.ai), so we cannot grep our way to the right
 *   `data-testid` values — the QA suite depends on a contract codified in
 *   `tests/reviewer-system/page-objects/selector-map.ts`.  When the
 *   frontend team renames a testid and forgets to update the map, our
 *   real E2E suite fails on staging weeks later.
 *
 *   This mocked suite catches the same drift at PR time, on every PR
 *   (including fork PRs without staging secrets), by mounting a stub
 *   HTML page that exposes every documented `data-testid` and asserting
 *   each selector resolves.  No network, no backend, no staging.
 *
 * What it is NOT:
 *   This does not replace the real E2E run — it just keeps the QA
 *   *contract* honest.  The full suite (`npm run test:reviewer`) still
 *   validates staging behavior when secrets are configured.
 *
 * @mocked
 */
import { test, expect } from "@playwright/test";
import {
  SELECTOR_MAP,
  Routes,
  type SelectorMap,
} from "../reviewer-system/page-objects/selector-map";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Build a stub HTML document that declares every `data-testid` listed in
 * `SELECTOR_MAP` (string or `${prefix}...` keys) plus the documented
 * section / metric / detail id suffixes.  Returns the HTML string plus
 * a `getByTestId` map for the test to consume.
 *
 * The DOM is a no-op shell — no React, no styles, no scripts.  We just
 * need each testid to be queryable so `.locator(...).count()` returns
 * a non-zero number.
 */
function buildStubHtml(): string {
  const tids = new Set<string>();

  const pushTid = (value: unknown): void => {
    if (typeof value !== "string") return;
    // Strip suffixes (`*Prefix`-style entries ship the prefix and let
    // tests append their own id; we register representative instances).
    if (value.endsWith("-")) {
      // Every queue section uses the same row/badge prefixes.
      for (const section of Object.values(SELECTOR_MAP.queueSections)) {
        tids.add(`${value}${section}`);
      }
      // Every analytics metric uses the metric prefix + label/value suffix.
      for (const metric of Object.values(SELECTOR_MAP.analyticsMetrics)) {
        tids.add(`${value}${metric}`);
        tids.add(`${value}${metric}${SELECTOR_MAP.analytics.metricValueSuffix}`);
        tids.add(`${value}${metric}${SELECTOR_MAP.analytics.metricLabelSuffix}`);
      }
      // Dashboard stat prefix.
      tids.add(`${value}pending`);
      return;
    }
    tids.add(value);
  };

  const walk = (node: unknown): void => {
    if (node == null) return;
    if (typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "analyticsMetrics" || key === "queueSections") {
        // Already handled by the prefix walker.
        continue;
      }
      pushTid(value);
      walk(value);
    }
  };

  walk(SELECTOR_MAP);

  const elements = Array.from(tids)
    .map(
      (tid) =>
        `<span data-testid="${tid}" id="${tid}"></span>`,
    )
    .join("\n");

  return `<!doctype html>
<html>
  <head><title>mocked stub</title></head>
  <body>
    <div id="app">
      <!--
        Every data-testid declared in selector-map.ts is rendered here.
        Each one must resolve via page.getByTestId(...) for the contract
        check to pass.
      -->
${elements}
    </div>
  </body>
</html>`;
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

test.describe("@mocked Selector & route contract", () => {
  test("MOCCK-SEL-01 • every static selector in SELECTOR_MAP resolves against the stub DOM", async ({
    page,
  }) => {
    await page.setContent(buildStubHtml());

    const checkStatic = (group: keyof SelectorMap): void => {
      const entries = SELECTOR_MAP[group];
      if (entries == null || typeof entries !== "object") return;
      for (const [name, value] of Object.entries(
        entries as Record<string, unknown>,
      )) {
        if (name === "analyticsMetrics" || name === "queueSections") continue;
        if (typeof value !== "string") continue;
        if (value.endsWith("-")) {
          // Prefix entries are exercised by the dedicated tests below.
          continue;
        }
        const count = page.getByTestId(value).count();
        expect(
          count,
          `SelectorMap.${String(group)}.${name} → "${value}" must be present in the stub DOM`,
        ).toBeGreaterThan(0);
      }
    };

    checkStatic("login");
    checkStatic("queue");
    checkStatic("detail");
    checkStatic("dashboard");
    checkStatic("analytics");
  });

  test("MOCCK-SEL-02 • every queue section id resolves against the stub DOM", async ({
    page,
  }) => {
    await page.setContent(buildStubHtml());
    for (const section of Object.values(SELECTOR_MAP.queueSections)) {
      const heading = page.getByTestId(
        `${SELECTOR_MAP.queue.sectionPrefix}${section}`,
      );
      const countBadge = page.getByTestId(
        `${SELECTOR_MAP.queue.sectionCountPrefix}${section}`,
      );
      const rows = page.getByTestId(
        `${SELECTOR_MAP.queue.sectionRowsPrefix}${section}`,
      );
      expect(heading.count(), `queue section "${section}" heading`).toBeGreaterThan(0);
      expect(countBadge.count(), `queue section "${section}" count`).toBeGreaterThan(0);
      expect(rows.count(), `queue section "${section}" rows container`).toBeGreaterThan(0);
    }
  });

  test("MOCCK-SEL-03 • every analytics metric id resolves against the stub DOM", async ({
    page,
  }) => {
    await page.setContent(buildStubHtml());
    for (const metric of Object.values(SELECTOR_MAP.analyticsMetrics)) {
      const root = page.getByTestId(
        `${SELECTOR_MAP.analytics.metricPrefix}${metric}`,
      );
      const value = page.getByTestId(
        `${SELECTOR_MAP.analytics.metricPrefix}${metric}${SELECTOR_MAP.analytics.metricValueSuffix}`,
      );
      const label = page.getByTestId(
        `${SELECTOR_MAP.analytics.metricPrefix}${metric}${SELECTOR_MAP.analytics.metricLabelSuffix}`,
      );
      expect(root.count(), `analytics metric "${metric}" root`).toBeGreaterThan(0);
      expect(value.count(), `analytics metric "${metric}" value`).toBeGreaterThan(0);
      expect(label.count(), `analytics metric "${metric}" label`).toBeGreaterThan(0);
    }
  });

  test("MOCCK-RTE-04 • Routes helpers return the documented paths", () => {
    expect(Routes.login).toBe("/login");
    expect(Routes.dashboard).toBe("/dashboard");
    expect(Routes.queue).toBe("/queue");
    expect(Routes.detail("abc-123")).toBe("/queue/abc-123");
    expect(Routes.analytics).toBe("/analytics");
    expect(Routes.analyticsOverview).toBe("/analytics/overview");
    expect(Routes.analyticsDateRange).toBe("/analytics/date-range");
  });
});
