import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load e2e environment variables
dotenv.config({ path: path.resolve(__dirname, 'e2e', '.env.e2e') });

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false, // Sequential to avoid conflicts on shared staging data
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['html', { open: 'on-failure' }]],

  timeout: 60_000, // 60s per test — Firebase auth + API latency
  expect: {
    timeout: 15_000,
  },

  use: {
    baseURL: process.env.STAGING_BASE_URL || 'https://desk.vicharanashala.ai',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
