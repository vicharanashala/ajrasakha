/**
 * Playwright fixtures for the ACE farmer web app (@ace-web-app tag).
 *
 * Extends the base Playwright `test` with a pre-built `QueryPage` and
 * an automatic low-end-device profile for the `mobile-chromium`
 * project.  The latter applies 4× CPU throttling + Slow 3G through a
 * Chromium CDP session and tears it down after every test.
 */
import { test as base, expect } from "@playwright/test";
import { QueryPage } from "../page-objects";
import { aceMocks } from "./ace-mock-helpers";

type AceFixtures = {
  queryPage: QueryPage;
  /** Internal auto fixture; not consumed directly by spec files. */
  _lowEndEmulation: void;
};

export const test = base.extend<AceFixtures>({
  queryPage: async ({ page }, use) => {
    await use(new QueryPage(page));
  },
  _lowEndEmulation: [
    async ({ page, browserName }, use, testInfo) => {
      const shouldThrottle =
        browserName === "chromium" && testInfo.project.name === "mobile-chromium";
      const throttle = shouldThrottle
        ? await aceMocks.throttleAsLowEnd(page)
        : null;
      try {
        await use();
      } finally {
        await throttle?.teardown();
      }
    },
    { auto: true },
  ],
});

/**
 * Single-line predicate so specs can soft-skip when the ACE staging
 * URL is not configured.  `ACE_BASE_URL` is retained as the migration
 * alias used by the shared config loader.
 */
export function aceStagingAvailable(): boolean {
  return !!(process.env.ACE_STAGING_URL || process.env.ACE_BASE_URL);
}

export { expect };
export default test;
