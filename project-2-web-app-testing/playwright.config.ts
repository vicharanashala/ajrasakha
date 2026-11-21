
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/example.spec.ts'],

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  timeout: 60000,
  reporter: 'html',

  projects: [
    {
      name: 'chromium',
      testIgnore: ['**/database.api.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://chat.annam.ai',
      },
    },
    {
      name: 'firefox',
      testIgnore: ['**/database.api.spec.ts'],
      use: {
        ...devices['Desktop Firefox'],
        baseURL: 'https://chat.annam.ai',
      },
    },
    {
      name: 'webkit',
      testIgnore: ['**/database.api.spec.ts'],
      use: {
        ...devices['Desktop Safari'],
        baseURL: 'https://chat.annam.ai',
      },
    },
    {
      name: 'Mobile Chrome',
      testIgnore: ['**/database.api.spec.ts'],
      use: {
        ...devices['Pixel 5'],
        baseURL: 'https://chat.annam.ai',
      },
    },
    {
      name: 'Mobile Safari',
      testIgnore: ['**/database.api.spec.ts'],
      use: {
        ...devices['iPhone 12'],
        baseURL: 'https://chat.annam.ai',
      },
    },
    {
      name: 'API',
      testMatch: ['**/database.api.spec.ts'],
      use: {
        baseURL: 'http://localhost:3001',
      },
    },
  ],
});
