import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const MODERATOR_EMAIL =
  process.env.E2E_MODERATOR_EMAIL ?? 'moderator@test.com';
export const MODERATOR_PASSWORD =
  process.env.E2E_MODERATOR_PASSWORD ?? 'TestPass123!';
export const EXPERT_EMAIL =
  process.env.E2E_EXPERT_EMAIL ?? 'expert@test.com';
export const EXPERT_PASSWORD =
  process.env.E2E_EXPERT_PASSWORD ?? 'TestPass123!';

/**
 * Navigate to /auth, fill credentials, submit, and wait for redirect to /home.
 * Skips if already on /home.
 */
export async function loginAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Navigate to /auth directly so we always go through the login flow.
  // Navigating via / is unreliable because the auth guard at /home runs
  // asynchronously and loginAs can catch a transient /home URL and skip login.
  await page.goto('/auth', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForLoadState('load');

  await page.waitForSelector('#email', { state: 'visible', timeout: 10_000 });
  await page.fill('#email', email);

  await page.waitForSelector('#password', { state: 'visible' });
  await page.fill('#password', password);

  // Use evaluate to dispatch a native submit event on the form.
  // React catches native submit events via event delegation.
  const submitted = await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form');
    if (!form) return 'no-form';
    const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
    const cancelled = !form.dispatchEvent(event);
    return cancelled ? 'cancelled' : 'not-cancelled';
  });

  if (submitted === 'no-form') {
    throw new Error('Could not find form element to submit');
  }

  await page.waitForURL(/\/home/, { timeout: 30_000 });
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);
}

/**
 * Convenience: log in as the default moderator account.
 */
export async function loginAsModerator(page: Page): Promise<void> {
  await loginAs(page, MODERATOR_EMAIL, MODERATOR_PASSWORD);
}

/**
 * Convenience: log in as the default expert account.
 */
export async function loginAsExpert(page: Page): Promise<void> {
  await loginAs(page, EXPERT_EMAIL, EXPERT_PASSWORD);
}

/**
 * Check that a toast notification with the given text (or part of it)
 * appeared on the page.
 */
export async function expectToast(
  page: Page,
  text: string | RegExp,
): Promise<void> {
  const toast = page.locator('[data-sonner-toast]');
  await expect(toast).toBeVisible({ timeout: 5_000 });
  await expect(toast).toContainText(text);
}

/**
 * Check that the page has settled after navigation: no spinners, no
 * loading overlays, network requests finished.
 */
export async function waitForPageReady(page: Page): Promise<void> {
  // Wait for any visible loading indicator to disappear
  const spinners = page.locator('[class*="loading"], [class*="spinner"], svg.lucide-loader');
  if (await spinners.first().isVisible({ timeout: 500 }).catch(() => false)) {
    await spinners.first().waitFor({ state: 'hidden', timeout: 10_000 });
  }
  await page.waitForLoadState('networkidle');
}

/**
 * Seed test data by posting directly to the backend API.
 * Returns the response body or null on failure.
 */
export async function seedBackend<T>(
  page: Page,
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
): Promise<T | null> {
  try {
    const res = await page.request.fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      data: body,
    });
    if (!res.ok()) {
      console.warn(`SEED ${method} /api${path} -> ${res.status()}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`SEED failed for ${method} /api${path}:`, err);
    return null;
  }
}
