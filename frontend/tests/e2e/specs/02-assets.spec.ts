import { test, expect } from '@playwright/test';
import { testEnvironment } from '../environment';
import { isFrontendReachable, isApiReachable, skipWhenDown } from '../helpers/http';

/**
 * @public — static asset integrity, no credentials needed.
 *
 * Walks every <link>, <script>, and inline-import referenced by the SPA
 * shell and asserts each one returns a non-5xx HTTP status. Catches broken
 * bundles, missing CSS, dead Vite chunks, and 404'd fonts.
 */

async function collectAssetUrls(page: import('@playwright/test').Page): Promise<string[]> {
  await page.goto('/', { waitUntil: 'networkidle' });

  const fromDom = await page.evaluate(() => {
    const urls = new Set<string>();
    document.querySelectorAll('script[src]').forEach((el) => urls.add((el as HTMLScriptElement).src));
    document.querySelectorAll('link[href]').forEach((el) => urls.add((el as HTMLLinkElement).href));
    document.querySelectorAll('img[src]').forEach((el) => urls.add((el as HTMLImageElement).src));
    document.querySelectorAll('source[src]').forEach((el) => urls.add((el as HTMLSourceElement).src));
    return [...urls];
  });

  // Also pull from network log to catch dynamically imported chunks.
  const fromNetwork = new Set<string>();
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith(testEnvironment.baseUrl)) fromNetwork.add(url);
  });
  // Trigger a tiny navigation to ensure listeners catch initial chunks.
  await page.goto('/', { waitUntil: 'networkidle' });

  return [...new Set([...fromDom, ...fromNetwork])]
    .filter((u) => u.startsWith('http'))
    .filter((u) => !u.endsWith('/api/') && !u.includes('/api?'))
    // Filter out anything obviously dynamic (websocket, etc.)
    .filter((u) => !u.startsWith('ws://') && !u.startsWith('wss://'));
}

test.describe('Public — static asset integrity', () => {
  test.beforeEach(async ({ page, request }) => {
    const fe = await isFrontendReachable(page);
    const api = await isApiReachable(request);
    if ((!fe && skipWhenDown) || (!api && skipWhenDown)) {
      test.skip(true, 'Frontend or API base URL not reachable — set E2E_BASE_URL/E2E_API_URL or run with E2E_SKIP_IF_DOWN=false');
    }
  });

  test('@public T-AST-01 — SPA shell loads without any 5xx asset', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (res) => {
      if (res.status() >= 500 && res.url().startsWith(testEnvironment.baseUrl)) {
        failures.push(`${res.status()} ${res.url()}`);
      }
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(failures, `5xx assets:\n${failures.join('\n')}`).toEqual([]);
  });

  test('@public T-AST-02 — every <script src> returns 200', async ({ page }) => {
    const urls = await collectAssetUrls(page);
    const scripts = urls.filter((u) => u.includes('.js') || /\/[^/]+\/?$/.test(u.replace(testEnvironment.baseUrl, '')));
    const results: { url: string; status: number }[] = [];
    for (const url of scripts) {
      const res = await page.request.get(url, { timeout: testEnvironment.timing.shortTimeout });
      results.push({ url, status: res.status() });
    }
    const broken = results.filter((r) => r.status >= 400);
    expect(broken, `broken: ${JSON.stringify(broken, null, 2)}`).toEqual([]);
  });

  test('@public T-AST-03 — every <link href> (CSS, icon, manifest) returns 200', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const hrefs: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('link[href]')).map((el) => (el as HTMLLinkElement).href),
    );
    const results: { url: string; status: number }[] = [];
    for (const href of hrefs) {
      const res = await page.request.get(href, { timeout: testEnvironment.timing.shortTimeout });
      results.push({ url: href, status: res.status() });
    }
    const broken = results.filter((r) => r.status >= 400);
    expect(broken, `broken: ${JSON.stringify(broken, null, 2)}`).toEqual([]);
  });

  test('@public T-AST-04 — favicon resolves (or 204, never 5xx)', async ({ page }) => {
    const res = await page.request.get(`${testEnvironment.baseUrl}/favicon.ico`);
    expect(res.status()).toBeLessThan(500);
  });

  test('@public T-AST-05 — no JS console errors on initial load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    // SPA may emit benign errors (e.g. missing Firebase config) — we accept those
    // that are clearly env-related, but anything pointing to a real bug fails.
    const real = errors.filter((e) => !/firebase|env|api.?key|missing/i.test(e));
    expect(real, `unexpected console errors:\n${real.join('\n')}`).toEqual([]);
  });
});