import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  timeout: 30 * 1000,
  expect: {
    timeout: 8 * 1000,
  },
  fullyParallel: false,
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/apis-test-results.json' }],
  ],
  projects: [
    {
      name: 'api',
      testDir: './e2e-api',
      use: {
        extraHTTPHeaders: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      },
    },
    {
      name: 'ui',
      testDir: './e2e-ui',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
