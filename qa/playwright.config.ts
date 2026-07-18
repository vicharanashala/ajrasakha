import { defineConfig, devices } from "@playwright/test";
import * as path from "path";
import * as dotenv from "dotenv";

// -----------------------------------------------------------------------------
// Environment loading
// -----------------------------------------------------------------------------
//  • qa/.env             — committed defaults (usually empty / placeholder)
//  • qa/.env.local       — per-developer overrides, git-ignored
//
//  The stage-URL resolution prefers `REVIEWER_STAGING_URL` (per PR #1) and
//  falls back to the legacy `REVIEWER_BASE_URL` so existing CI secrets still
//  work without a rotation.  PR #5 adds `ACE_STAGING_URL` (with the
//  `ACE_BASE_URL` fallback) for the farmer-facing ACE web app.
// -----------------------------------------------------------------------------
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, ".env.local"), override: true });

const REVIEWER_STAGING_URL: string =
  process.env.REVIEWER_STAGING_URL || process.env.REVIEWER_BASE_URL || "";
const REVIEWER_OK: boolean = !!REVIEWER_STAGING_URL;
const WEBAPP_OK: boolean = !!process.env.WEBAPP_BASE_URL;
const ACE_STAGING_URL: string =
  process.env.ACE_STAGING_URL || process.env.ACE_BASE_URL || "";
const ACE_OK: boolean = !!ACE_STAGING_URL;

// -----------------------------------------------------------------------------
// Playwright configuration
// -----------------------------------------------------------------------------
export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/multilingual/**", "**/node_modules/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI gets two retries to absorb flaky staging data without flunking the
  // pipeline; locally we re-run on demand and prefer fast feedback.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: REVIEWER_STAGING_URL || "https://desk.ajrasakha.in",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "reviewer",
      testMatch: /tests\/reviewer-system\/.*\.spec\.ts/,
      ...(REVIEWER_OK
        ? {}
        : { testMatch: /__never_matches__reviewer__/ }),
      use: {
        ...devices["Desktop Chrome"],
        baseURL: REVIEWER_STAGING_URL,
      },
    },
    {
      // Mobile viewport (Pixel 5) for the reviewer-system suite.
      name: "reviewer-mobile",
      testMatch: /tests\/reviewer-system\/.*\.spec\.ts/,
      ...(REVIEWER_OK
        ? {}
        : { testMatch: /__never_matches__reviewer_mobile__/ }),
      use: {
        ...devices["Pixel 5"],
        baseURL: REVIEWER_STAGING_URL,
      },
    },
    {
      name: "webapp",
      testMatch: /tests\/web-app\/.*\.spec\.ts/,
      ...(WEBAPP_OK ? {} : { testMatch: /__never_matches__webapp__/ }),
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // PR #5 — ACE farmer web app, desktop viewport.  The
      // farmer-facing app is a separate surface from the reviewer
      // system so it gets its own baseURL (ACE_STAGING_URL) and its
      // own Playwright project.  Spec files live under
      // `tests/ace-web-app/**`.
      name: "ace-web-app",
      testMatch: /tests\/ace-web-app\/.*\.spec\.ts/,
      // Soft-skip the whole project when ACE_STAGING_URL isn't set so
      // a missing secret doesn't red-CI the PR — the suite is
      // designed to land even before the ACE staging env is
      // available.
      ...(ACE_OK ? {} : { testMatch: /__never_matches__ace_web_app__/ }),
      use: {
        ...devices["Desktop Chrome"],
        baseURL: ACE_STAGING_URL,
        // Indian English by default — the suite's primary script.  The
        // language-switch spec asserts that this locale actually
        // changes UI copy on the page.
        locale: "en-IN",
        timezoneId: "Asia/Kolkata",
      },
    },
    {
      // PR #5 — mobile / low-end viewport.  Mirrors the
      // `reviewer-mobile` pattern: Pixel 5 viewport, same baseURL, the
      // suite's CDP throttle helper is opt-in per-test so the spec
      // files stay fast by default.
      name: "ace-web-app-mobile",
      testMatch: /tests\/ace-web-app\/.*\.spec\.ts/,
      ...(ACE_OK
        ? {}
        : { testMatch: /__never_matches__ace_web_app_mobile__/ }),
      use: {
        ...devices["Pixel 5"],
        baseURL: ACE_STAGING_URL,
        locale: "hi-IN",
        timezoneId: "Asia/Kolkata",
      },
    },
  ],
});
