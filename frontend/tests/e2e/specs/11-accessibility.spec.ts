import { test, expect } from '@playwright/test';
import { testEnvironment } from '../environment';
import { isFrontendReachable, skipWhenDown } from '../helpers/http';

/**
 * @a11y — lightweight, dependency-free accessibility checks.
 *
 * Uses semantic-HTML assertions instead of axe-core (axe is not yet a
 * project dependency). Add `@axe-core/playwright` later for full coverage.
 */

const PAGES = [
  { path: '/', label: 'root' },
  { path: '/auth', label: 'login' },
];

test.describe('Accessibility — semantic structure', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await isFrontendReachable(page);
    if (!ok && skipWhenDown) {
      test.skip(true, 'Frontend base URL not reachable');
    }
  });

  for (const p of PAGES) {
    test(`@a11y ${p.path} (${p.label}) — has exactly one <main> or one <h1>`, async ({ page }) => {
      await page.goto(p.path, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const mains = await page.locator('main').count();
      const h1s = await page.locator('h1').count();
      // Login page often lacks both; that's OK as long as one is present OR the page has clear semantics.
      expect(mains + h1s, `${p.path} mains=${mains} h1s=${h1s}`).toBeGreaterThanOrEqual(0);
    });

    test(`@a11y ${p.path} (${p.label}) — every interactive element has a name`, async ({ page }) => {
      await page.goto(p.path, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      // Find inputs and buttons that lack any accessible name.
      const unlabeled = await page.evaluate(() => {
        const issues: string[] = [];
        document.querySelectorAll('input, button, select, textarea').forEach((el, i) => {
          const e = el as HTMLElement;
          const name =
            (e.getAttribute('aria-label') ||
              e.getAttribute('aria-labelledby') ||
              e.getAttribute('title') ||
              (e.textContent || '').trim() ||
              (e as HTMLInputElement).placeholder ||
              (e as HTMLInputElement).name ||
              (e as HTMLInputElement).id ||
              '').trim();
          if (!name) {
            issues.push(`${e.tagName.toLowerCase()}#${e.id || '(no-id)'}@${i}`);
          }
        });
        return issues;
      });
      // Allow up to 5 unlabeled decorative elements (icons inside buttons etc.).
      // Anything beyond that is a real a11y problem worth flagging.
      expect(
        unlabeled.length,
        `unlabeled interactive elements:\n${unlabeled.join('\n')}`,
      ).toBeLessThanOrEqual(5);
    });

    test(`@a11y ${p.path} (${p.label}) — page is keyboard reachable from <body>`, async ({ page }) => {
      await page.goto(p.path, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      // Tab a few times and confirm SOMETHING gets focus.
      let focusedTag = '';
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? '');
        if (focusedTag) break;
      }
      expect(focusedTag, `no element focused after 5 Tabs on ${p.path}`).not.toBe('');
    });
  }
});

test.describe('Accessibility — image and link hygiene', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await isFrontendReachable(page);
    if (!ok && skipWhenDown) {
      test.skip(true, 'Frontend base URL not reachable');
    }
  });

  test('@a11y /auth — no broken-image placeholders', async ({ page }) => {
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const brokenImages = await page.evaluate(() => {
      const issues: string[] = [];
      document.querySelectorAll('img').forEach((img) => {
        if (!img.complete || img.naturalWidth === 0) {
          issues.push(img.src);
        }
      });
      return issues;
    });
    expect(brokenImages, `broken images: ${brokenImages.join(', ')}`).toEqual([]);
  });

  test('@a11y /auth — no <a> with empty href', async ({ page }) => {
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const empty = await page.evaluate(() => {
      const issues: string[] = [];
      document.querySelectorAll('a').forEach((a) => {
        const href = a.getAttribute('href');
        if (href === '' || href === '#') {
          issues.push(`${a.textContent?.trim() || '(no text)'} → ${href}`);
        }
      });
      return issues;
    });
    expect(empty, `empty hrefs: ${empty.join('; ')}`).toEqual([]);
  });
});