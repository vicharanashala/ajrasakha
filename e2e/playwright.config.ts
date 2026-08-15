import { defineConfig, devices } from "@playwright/test";
import { env } from "./support/config";

const baseURL = env.baseURL;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : env.localMode ? 1 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "on-failure" }]],
  outputDir: "test-results",

  // The local dev stack (Vite on-demand transform + Firebase Auth emulator
  // sign-in + reload + IndexedDB session snapshot) regularly exceeds Playwright's
  // 30s default test timeout even when warm. Give each test a generous budget so
  // the role projects don't flake out on a slow-but-successful sign-in.
  // NOTE: this is a top-level runner option (must not live in `use`).
  timeout: 120_000,

  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  // The local stack (Vite on-demand transform of the heavy dashboard module
  // graph) renders the header/tabs ~5-8s after navigation even when warm.
  // Give assertions the same budget as navigation/actions so role projects
  // don't flake out on a still-initializing shell.
  expect: { timeout: 30_000 },

  projects: [
    // Signs each role in through the real UI once and snapshots the session to
    // `.auth/<role>.json` (gitignored). Fails loudly when env credentials are missing.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { baseURL, ...devices["Desktop Chrome"] },
    },

    // Role projects. Shared flows under tests/common run once per role so each
    // saved session is proven. Auth/config flows are excluded from roles.
    {
      name: "admin",
      testIgnore: /tests\/(moderator|expert|auth|config)\//,
      use: {
        baseURL,
        ...devices["Desktop Chrome"],
        storageState: env.storageState.admin,
      },
      dependencies: ["setup"],
    },
    {
      name: "moderator",
      testIgnore: /tests\/(admin|expert|auth|config)\//,
      use: {
        baseURL,
        ...devices["Desktop Chrome"],
        storageState: env.storageState.moderator,
      },
      dependencies: ["setup"],
    },
    {
      name: "expert",
      testIgnore: /tests\/(admin|moderator|auth|config)\//,
      use: {
        baseURL,
        ...devices["Desktop Chrome"],
        storageState: env.storageState.expert,
      },
      dependencies: ["setup"],
    },

    // No-session project: login/signup/forgot-password and harness-config checks.
    // Deliberately has NO dependency on `setup`, so a missing-credential run still
    // reports passes/failures here instead of being silently skipped.
    {
      name: "unauthenticated",
      testMatch: /tests\/(auth|config)\//,
      use: { baseURL, ...devices["Desktop Chrome"] },
    },
  ],
});
