
import { Page } from '@playwright/test';

export async function openApp(page: Page): Promise<number> {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await page.goto('/', {
        waitUntil: 'commit',
        timeout: 20000,
      });

      if (!response) {
        throw new Error('No response received from the application.');
      }

      if (!response.ok()) {
        throw new Error(
          `Application returned HTTP ${response.status()}.`
        );
      }

      return response.status();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(
          `Application navigation failed after ${maxAttempts} attempts: ${String(error)}`
        );
      }

      await page.waitForTimeout(1000);
    }
  }

  throw new Error('Application could not be opened.');
}

export async function reloadApp(page: Page): Promise<number> {
  const response = await page.reload({
    waitUntil: 'commit',
    timeout: 20000,
  });

  if (!response || !response.ok()) {
    throw new Error(
      `Reload failed. HTTP status: ${response?.status() ?? 'No response'}`
    );
  }

  return response.status();
}
