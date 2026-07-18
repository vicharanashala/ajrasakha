/**
 * Playwright fixtures for the ACE farmer web app (@ace-web-app tag).
 *
 * A custom fixture that extends the base Playwright `test` with the
 * pre-built `QueryPage` page object so spec files don't have to `new`
 * it every test.
 *
 *   import { test, expect } from "../fixtures";
 *
 *   test("...", async ({ page, queryPage }) => { ... });
 *
 * Mirrors the per-suite fixture pattern from
 * `tests/reviewer-system/fixtures/auth-fixtures.ts`.
 *
 * The mobile viewport project runs the same suite on a Pixel 5
 * profile, but the production app also has to work on low-spec
 * Android devices.  The fixture exposes a {@link throttleAsLowEnd}
 * helper that attaches a CDP session and applies 4× CPU throttling +
 * Slow 3G so the test exercises the same render-time shivers a farmer
 * with a low-spec phone sees in the field.  Apply per-test only when
 * relevant (some behavioural assertions are too timing-sensitive
 * for a 4× CPU throttle).
 */
import { test as base, expect, CDPSession } from "@playwright/test";
import { QueryPage } from "../page-objects";

type AceFixtures = {
  queryPage: QueryPage;
  /**
   * Optional helper that toggles CDP-level low-end emulation.  Most
   * tests don't need it (the Pixel 5 viewport already exercises the
   * small-screen path); opt-in via `throttleAsLowEnd(page)` at the
   * top of a `test.step()` block.
   */
  lowEndSession: CDPSession | null;
};

export const test = base.extend<AceFixtures>({
  queryPage: async ({ page }, use) => {
    await use(new QueryPage(page));
  },
  lowEndSession: async (_args, use) => {
    // The session itself is opt-in (set by {@link throttleAsLowEnd})
    // so the default fixture value is just a stable null handle.
    const session: CDPSession | null = null;
    await use(session);
  },
});

/**
 * Attach a CDP session to the current page and apply the
 * `throttleAsLowEnd` emulation.  Call once at the start of a test
 * that needs the low-end path; the session is automatically
 * detached when the test ends.
 */
export async function throttleAsLowEnd(page: import("@playwright/test").Page): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
  });
  return session;
}

/**
 * Single-line predicate so a spec can `test.skip()` when the ACE
 * staging URL is missing from the environment.
 */
export function aceStagingAvailable(): boolean {
  return !!process.env.ACE_STAGING_URL;
}

export { expect };
export default test;