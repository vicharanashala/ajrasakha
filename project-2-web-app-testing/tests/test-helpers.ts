
import { Page, Locator, expect } from '@playwright/test';

export async function openApp(page: Page) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await page.goto('/', {
        waitUntil: 'commit',
        timeout: 30000,
      });

      if (!response || !response.ok()) {
        throw new Error(
          `Application returned status: ${response?.status() ?? 'No response'}`
        );
      }

      await expect(page.locator('body')).toBeVisible({
        timeout: 15000,
      });

      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(
          `Application could not be opened after ${maxAttempts} attempts. ` +
          `Check staging server availability and network connection. ` +
          `Original error: ${String(error)}`
        );
      }

      await page.waitForTimeout(2000);
    }
  }
}

export function queryInput(page: Page): Locator {
  return page.locator(
    'textarea, input[type="text"], input:not([type])'
  ).first();
}

export function submitButton(page: Page): Locator {
  return page.getByRole('button', {
    name: /send|submit|ask|search/i,
  }).or(
    page.locator('button[type="submit"]')
  ).first();
}

export function languageControl(page: Page): Locator {
  return page.locator('select').first().or(
    page.getByRole('button', {
      name: /language|english|hindi|हिंदी/i,
    }).first()
  );
}

export function voiceControl(page: Page): Locator {
  return page.getByRole('button', {
    name: /voice|microphone|mic|speak/i,
  }).first().or(
    page.locator(
      'button[aria-label*="mic" i], button[aria-label*="voice" i]'
    ).first()
  );
}
