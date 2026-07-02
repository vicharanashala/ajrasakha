import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

// Load .env from e2e directory
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '.env') });

const STAGING_URL = process.env.STAGING_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,         // Run sequentially so login state sharing works
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  timeout: 60_000,              // 60s per test — Firebase auth + API calls can be slow
  expect: { timeout: 15_000 }, // 15s for element assertions

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    baseURL: STAGING_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Allow geolocation and media — fake mic/camera for voice tests
    permissions: ['microphone', 'camera'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    },
  },

  projects: [
    // ────── Setup project: log in and save auth state ──────
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
    },

    // ────── Desktop Chrome ──────
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // ────── Mobile Chrome (iPhone 12) ──────
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Global setup/teardown
  globalSetup: undefined,
  outputDir: 'test-results',
});
