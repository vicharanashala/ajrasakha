
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Test settings
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Give each test 60 seconds
  timeout: 60000,

  // HTML report
  reporter: 'html',

  // Common settings for all browsers
  use: {
    baseURL: 'https://chat.annam.ai',
    navigationTimeout: 60000,
    actionTimeout: 15000,
    trace: 'on-first-retry',
  },

  // Browser configurations
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
});
