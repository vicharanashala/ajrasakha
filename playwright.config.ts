import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const isLocalDesk = /127\.0\.0\.1|localhost/.test(baseURL);

export default defineConfig({
  testDir: './tests',
  fullyParallel: !isLocalDesk,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI || isLocalDesk ? 1 : undefined,
  reporter: process.env.CI
    ? [['html'], ['github'], ['list']]
    : [['html'], ['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  webServer: isLocalDesk
    ? {
        command: 'npm run app',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      }
    : undefined,
  projects: [
    {
      name: 'chromium',
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
