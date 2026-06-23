import { Page, Locator } from '@playwright/test';

/**
 * Reliable wait helpers that avoid arbitrary sleeps.
 * Always wait for an observable DOM change, not a fixed timeout.
 */

/**
 * Wait for a network request matching the URL pattern to complete.
 */
export async function waitForRequest(
  page: Page,
  urlPattern: string | RegExp,
  timeout = 15_000
): Promise<void> {
  await page.waitForRequest(urlPattern, { timeout });
}

/**
 * Wait for a response matching the URL pattern.
 */
export async function waitForResponse(
  page: Page,
  urlPattern: string | RegExp,
  timeout = 15_000
): Promise<void> {
  await page.waitForResponse(urlPattern, { timeout });
}

/**
 * Wait for element to be both visible and stable (no layout shift).
 */
export async function waitForStable(locator: Locator, timeout = 10_000): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout });
}

/**
 * Wait for a toast message matching the given text to appear.
 */
export async function waitForToast(page: Page, textOrPattern: string | RegExp): Promise<void> {
  // Toasts typically appear in an aria-live region or role="status"
  const toast = page.locator('[role="status"], [aria-live], .toast, [data-sonner-toast]')
    .filter({ hasText: textOrPattern });
  await toast.first().waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Wait for the page navigation to complete (URL changes).
 */
export async function waitForNavigation(page: Page, urlPattern: string | RegExp): Promise<void> {
  await page.waitForURL(urlPattern, { timeout: 20_000 });
}

/**
 * Wait for element text content to change from the initial value.
 * Useful for watching translation results appear.
 */
export async function waitForTextChange(
  locator: Locator,
  initialText: string,
  timeout = 10_000
): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout });
  await locator.page().waitForFunction(
    ({ selector, oldText }: { selector: string; oldText: string }) => {
      const el = document.querySelector(selector);
      return el ? el.textContent !== oldText : false;
    },
    { selector: await locator.evaluate((el) => {
        // Build a simple unique selector for the polling function
        const tag = el.tagName.toLowerCase();
        const testId = el.getAttribute('data-testid');
        return testId ? `[data-testid="${testId}"]` : tag;
      }), oldText: initialText },
    { timeout }
  );
}

/**
 * Type into a field and wait for the value to appear — avoids race conditions
 * with async controlled inputs.
 */
export async function fillAndVerify(locator: Locator, value: string): Promise<void> {
  await locator.fill(value);
  await locator.page().waitForFunction(
    (args: { testId: string | null; expectedValue: string }) => {
      const el = args.testId
        ? document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-testid="${args.testId}"]`)
        : null;
      return el ? el.value === args.expectedValue : true;
    },
    {
      testId: await locator.getAttribute('data-testid'),
      expectedValue: value,
    },
    { timeout: 5000 }
  );
}
