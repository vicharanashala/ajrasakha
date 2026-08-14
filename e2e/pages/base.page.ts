import { type Page, type Locator } from '@playwright/test';

/**
 * Base Page Object — shared navigation and utility helpers.
 * All page objects extend this class.
 */
export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ── Navigation ──────────────────────────────────────────────

  async navigateTo(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }

  async currentPath(): Promise<string> {
    return new URL(this.page.url()).pathname;
  }

  async waitForPath(path: string, timeout = 15_000): Promise<void> {
    await this.page.waitForURL((url) => url.pathname.startsWith(path), { timeout });
  }

  // ── Common locators ─────────────────────────────────────────

  /** Toast / notification messages (react-hot-toast or sonner) */
  get toastMessage(): Locator {
    return this.page.locator('[data-sonner-toast], [role="status"]').first();
  }

  /** Any loading spinner / skeleton visible on page */
  get loadingIndicator(): Locator {
    return this.page.locator('[class*="animate-pulse"], [class*="skeleton"], [class*="loading"]').first();
  }

  // ── Utility ─────────────────────────────────────────────────

  async waitForNetworkIdle(timeout = 10_000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout });
  }

  async waitForApiResponse(urlPattern: string | RegExp, timeout = 15_000) {
    return this.page.waitForResponse(
      (res) => {
        if (typeof urlPattern === 'string') {
          return res.url().includes(urlPattern) && res.status() < 400;
        }
        return urlPattern.test(res.url()) && res.status() < 400;
      },
      { timeout },
    );
  }

  /** Click a navigation link or sidebar item by text */
  async clickNavLink(text: string): Promise<void> {
    await this.page.getByRole('link', { name: text }).click();
  }

  /** Get text content of an element, trimmed */
  async getTextContent(locator: Locator): Promise<string> {
    return ((await locator.textContent()) ?? '').trim();
  }
}
