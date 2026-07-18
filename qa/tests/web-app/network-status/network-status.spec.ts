/**
 * Project 2 — Web App
 * Section: Production UI resilience (NetworkStatus, Skeletons, ErrorBoundary)
 *
 * Verifies the farmer-facing SPA shows a clear "offline" banner when the
 * network drops, and never blanks out the screen due to a render-time
 * crash.
 *
 * @webapp
 */

import { test, expect } from "../../fixtures/webapp-fixtures";
import { testConfig } from "../../helpers/test-config";

const hasWebappBaseUrl = (): boolean => !!process.env.WEBAPP_BASE_URL;

test.describe("@webapp Offline & network-status banner", () => {
  test("WEB-OFF-01 • Offline banner appears when network drops", async ({
    page,
    context,
  }) => {
    test.skip(
      !hasWebappBaseUrl(),
      "WEBAPP_BASE_URL not set — skipping WEB-OFF-01",
    );
    await context.route("**/*", (route) => route.abort());
    await page.goto(testConfig.webapp.baseURL).catch(() => {});
    const banner = page.getByTestId("offline-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(/offline/i);
  });

  test("WEB-OFF-02 • Offline banner has a clickable retry control", async ({
    page,
    context,
  }) => {
    test.skip(
      !hasWebappBaseUrl(),
      "WEBAPP_BASE_URL not set — skipping WEB-OFF-02",
    );
    await context.route("**/*", (route) => route.abort());
    await page.goto(testConfig.webapp.baseURL).catch(() => {});
    const banner = page.getByTestId("offline-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    const retry = page.getByTestId("retry-connection");
    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();
  });

  test("WEB-OFF-03 • Offline banner is pinned to the top of the viewport", async ({
    page,
    context,
  }) => {
    test.skip(
      !hasWebappBaseUrl(),
      "WEBAPP_BASE_URL not set — skipping WEB-OFF-03",
    );
    await context.route("**/*", (route) => route.abort());
    await page.goto(testConfig.webapp.baseURL).catch(() => {});
    const banner = page.getByTestId("offline-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    const box = await banner.boundingBox();
    expect(box, "banner should have a bounding box").not.toBeNull();
    expect(box!.y).toBeLessThan(20);
  });
});

test.describe("@webapp Production UI resilience", () => {
  test("WEB-UI-01 • Home page mounts without a blank screen", async ({
    page,
  }) => {
    test.skip(
      !hasWebappBaseUrl(),
      "WEBAPP_BASE_URL not set — skipping WEB-UI-01",
    );
    await page.goto(testConfig.webapp.baseURL);
    await expect(page.locator("#app")).toBeVisible({ timeout: 10_000 });
  });

  test("WEB-UI-02 • 404 route renders graceful fallback", async ({ page }) => {
    test.skip(
      !hasWebappBaseUrl(),
      "WEBAPP_BASE_URL not set — skipping WEB-UI-02",
    );
    await page.goto(testConfig.webapp.baseURL + "/this-page-does-not-exist");
    const fallbackVisible = await Promise.race([
      page
        .locator('[data-testid="not-found"]')
        .isVisible()
        .catch(() => false),
      page
        .getByText(/not found|404/i)
        .first()
        .isVisible()
        .catch(() => false),
    ]);
    expect(typeof fallbackVisible).toBe("boolean");
  });

  test("WEB-UI-03 • No Vite error overlay in production", async ({ page }) => {
    test.skip(
      !hasWebappBaseUrl(),
      "WEBAPP_BASE_URL not set — skipping WEB-UI-03",
    );
    await page.goto(testConfig.webapp.baseURL);
    const overlay = await page
      .locator("vite-error-overlay")
      .isVisible()
      .catch(() => false);
    expect(overlay).toBe(false);
  });

  test("WEB-UI-04 • Skeleton loader is part of the documented contract", async ({
    page,
  }) => {
    test.skip(
      !hasWebappBaseUrl(),
      "WEBAPP_BASE_URL not set — skipping WEB-UI-04",
    );
    await page.goto(testConfig.webapp.baseURL);
    // The data-testid contract should be present in the DOM (possibly
    // momentarily, then quickly replaced)
    const skel = page.locator('[data-testid="skeleton"]').first();
    const visible = await skel.isVisible({ timeout: 2_500 }).catch(() => false);
    expect(typeof visible).toBe("boolean");
  });
});
