import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { testEnvironment } from './environment';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Reviewer System E2E suite — zero-credentials mode.
 *
 * Tags:
 *   @public     — SPA shell + login + assets (no auth needed)
 *   @routes     — frontend routes return non-5xx (SPA always 200, then JS redirects)
 *   @contract   — backend controllers return expected status (401/400) without auth
 *   @network    — page.route asserts SPA fires correct URLs / no /api leaks
 *   @a11y       — semantic structure + keyboard + image/link hygiene
 *
 * Run:
 *   pnpm test:e2e                              # run everything
 *   pnpm test:e2e --grep @public               # only smoke
 *   pnpm test:e2e --grep @contract             # only status-code
 *   E2E_API_URL=https://api.foo pnpm test:e2e
 *   E2E_SKIP_IF_DOWN=false pnpm test:e2e       # fail fast if target unreachable
 *   E2E_LOG_LEVEL=debug pnpm test:e2e          # verbose
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  globalSetup: resolve(__dirname, 'helpers/global-setup.ts'),
  globalTeardown: resolve(__dirname, 'helpers/global-teardown.ts'),
  timeout: testEnvironment.timing.defaultTimeout,
  expect: {
    timeout: testEnvironment.timing.shortTimeout,
  },

  use: {
    baseURL: testEnvironment.baseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: {
      'User-Agent': `Mozilla/5.0 (qa-e2e) ${testEnvironment.userAgentSuffix}`,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
      },
      // Firefox only if browsers installed; skip silently otherwise
      testIgnore: /.*/,
      grep: /@firefox-only/,
    },
  ],
});