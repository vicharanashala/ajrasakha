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
//  work without a rotation.
// -----------------------------------------------------------------------------
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, ".env.local"), override: true });

const REVIEWER_STAGING_URL: string =
  process.env.REVIEWER_STAGING_URL || process.env.REVIEWER_BASE_URL || "";
const REVIEWER_OK: boolean = !!REVIEWER_STAGING_URL;
const WEBAPP_OK: boolean = !!process.env.WEBAPP_BASE_URL;

// -----------------------------------------------------------------------------
// Playwright configuration
// -----------------------------------------------------------------------------
export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/multilingual/**", "**/node_modules/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI gets two retries to absorb flaky staging data without flunking the
  // pipeline; locally we re-run on demand (`npx playwright test --retries=2`)
  // and prefer fast feedback.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],
  outputDir: "test-results",
  use: {
    // `baseURL` is project-specific — see projects below.  The default
    // here is a safety net for any spec that forgets to override it.
    baseURL: REVIEWER_STAGING_URL || "https://desk.ajrasakha.in",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "reviewer",
      testMatch: /tests\/reviewer-system\/.*\.spec\.ts/,
      // Skip the whole project when REVIEWER_STAGING_URL / REVIEWER_BASE_URL
      // is not set.  We still want CI to *pass* (not fail) so the PR isn't
      // blocked while secrets are being rotated.
      ...(REVIEWER_OK
        ? {}
        : { testMatch: /__never_matches__reviewer__/ }),
      use: {
        ...devices["Desktop Chrome"],
        baseURL: REVIEWER_STAGING_URL,
      },
    },
    {
      // Mobile viewport (Pixel 5) — exercised as a separate project so the
      // queue/allocation flow can be regression-tested on phones when the
      // responsive story matures in later PRs.
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
  ],
});