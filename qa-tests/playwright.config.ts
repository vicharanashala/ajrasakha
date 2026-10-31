import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './e2e',
  expect: {
    timeout: 15_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'setup',
      testDir: './fixtures',
      testMatch: 'auth.setup.ts',
    },
    {
      name: 'chromium',
      testDir: './e2e',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
