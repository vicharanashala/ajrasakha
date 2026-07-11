import { defineConfig, devices } from "@playwright/test";
import * as path from "path";
import * as dotenv from "dotenv";

// Load qa/.env (and a local qa/.env.local if present).
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, ".env.local"), override: true });

// Run only when the matching *BASE_URL* is configured. Otherwise Playwright
// will discover 0 tests because every spec calls `test.skip(...)` when the
// corresponding BASE_URL is missing.  This keeps "no creds" runs green
// instead of producing a confusing "0 tests ran" outcome.
const REVIEWER_OK = !!process.env.REVIEWER_BASE_URL;
const WEBAPP_OK = !!process.env.WEBAPP_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/multilingual/**", "**/node_modules/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: process.env.WEBAPP_BASE_URL || "https://ajrasakha.in",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "reviewer",
      testMatch: /tests\/reviewer-system\/.*\.spec\.ts/,
      // Skip the whole project when REVIEWER_BASE_URL is not set.
      // We still want CI to *pass* (not fail) so the PR isn't blocked
      // while secrets are being rotated.
      ...(REVIEWER_OK
        ? {}
        : { testMatch: /__never_matches__reviewer__/ }),
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webapp",
      testMatch: /tests\/web-app\/.*\.spec\.ts/,
      ...(WEBAPP_OK ? {} : { testMatch: /__never_matches__webapp__/ }),
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
