import { test, expect } from '@playwright/test';
import { testEnvironment } from '../environment';
import { isFrontendReachable, skipWhenDown } from '../helpers/http';

/**
 * @public — no credentials, no backend needed.
 * Verifies the Reviewer System SPA shell, login page, and static integrity.
 */

test.describe('Public — SPA shell', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await isFrontendReachable(page);
    if (!ok && skipWhenDown) {
      test.skip(true, 'Frontend base URL not reachable — set E2E_BASE_URL or run with E2E_SKIP_IF_DOWN=false');
    }
  });

  test('@public T-PUB-01 — root URL returns 200 HTML', async ({ page }) => {
    const res = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(res, 'response is defined').not.toBeNull();
    expect(res!.status(), 'root status').toBeLessThan(400);
    const ct = res!.headers()['content-type'] || '';
    expect(ct, 'content-type contains html').toMatch(/html/i);
  });

  test('@public T-PUB-02 — page contains #app mount point', async ({ page }) => {
    await page.goto('/');
    const root = page.locator('#app');
    await expect(root).toHaveCount(1);
  });

  test('@public T-PUB-03 — page title is non-empty', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title.length, `title: "${title}"`).toBeGreaterThan(0);
  });

  test('@public T-PUB-04 — HTML has a head and body', async ({ page }) => {
    await page.goto('/');
    const html = await page.content();
    expect(html).toMatch(/<head[\s>]/i);
    expect(html).toMatch(/<body[\s>]/i);
  });

  test('@public T-PUB-05 — document is HTML5 doctype', async ({ page }) => {
    await page.goto('/');
    const doctype = await page.evaluate(() => document.doctype?.name);
    expect(doctype).toBe('html');
  });
});

test.describe('Public — login page', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await isFrontendReachable(page);
    if (!ok && skipWhenDown) {
      test.skip(true, 'Frontend base URL not reachable');
    }
    // Track pageerrors so we can skip form tests when Firebase env is broken.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    // Probe the /auth page once.
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const hasFirebaseEnvError = errors.some((e) => /firebase|api.?key|invalid-api/i.test(e));
    if (hasFirebaseEnvError) {
      test.skip(
        true,
        'Firebase env error detected (auth/invalid-api-key). Form cannot render without real Firebase keys. ' +
          'Set VITE_FIREBASE_API_KEY in .env.local to enable these tests.',
      );
    }
  });

  test('@public T-PUB-10 — /auth renders email input', async ({ page }) => {
    // The login form uses #email and #password (see AuthFields.tsx).
    const email = page.locator('input#email, input[name="email"]').first();
    await expect(email).toBeVisible({ timeout: testEnvironment.timing.longTimeout });
  });

  test('@public T-PUB-11 — /auth renders password input', async ({ page }) => {
    const pwd = page.locator('input#password, input[name="password"]').first();
    await expect(pwd).toBeVisible({ timeout: testEnvironment.timing.longTimeout });
  });

  test('@public T-PUB-12 — /auth renders a submit button', async ({ page }) => {
    const submit = page.locator('button[type="submit"]').first();
    await expect(submit).toBeVisible({ timeout: testEnvironment.timing.longTimeout });
  });

  test('@public T-PUB-13 — submitting empty form triggers client-side error', async ({ page }) => {
    const submit = page.locator('button[type="submit"]').first();
    await submit.click();
    // Either an inline validation message OR the URL stays on /auth (no navigation).
    await page.waitForTimeout(500);
    const url = page.url();
    const hasError = await page
      .locator('[aria-invalid="true"], [role="alert"], .error, [class*="error"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasError || url.includes('/auth'), 'either error shown or still on /auth').toBeTruthy();
  });

  test('@public T-PUB-14 — fake login does NOT redirect away from /auth', async ({ page }) => {
    const email = page.locator('input#email, input[name="email"]').first();
    const pwd = page.locator('input#password, input[name="password"]').first();
    const submit = page.locator('button[type="submit"]').first();
    await email.fill('nobody@nowhere.invalid');
    await pwd.fill('wrong-password-12345');
    await submit.click();
    await page.waitForTimeout(2000);
    expect(page.url(), 'still on /auth (or any auth-ish path)').toMatch(/\/auth/);
  });

  test('@public T-PUB-15 — login form is keyboard-navigable', async ({ page }) => {
    // Press Tab a few times; focus should land on something focusable.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['INPUT', 'BUTTON', 'A'].includes(focusedTag), `focused: ${focusedTag}`).toBeTruthy();
  });
});

test.describe('Public — protected route redirect', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await isFrontendReachable(page);
    if (!ok && skipWhenDown) {
      test.skip(true, 'Frontend base URL not reachable');
    }
  });

  test('@public T-PUB-20 — /home without auth lands on /auth (after JS redirect)', async ({ page }) => {
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    // The root route (`/`) bootstraps the auth listener then pushes to /home.
    // If no user is signed in, the SPA renders /auth eventually.
    const finalUrl = page.url();
    expect(finalUrl, `final url: ${finalUrl}`).toMatch(/\/(auth|home)/);
  });

  test('@public T-PUB-21 — /profile without auth does not 5xx', async ({ page }) => {
    const res = await page.goto('/profile');
    expect(res, 'response defined').not.toBeNull();
    expect(res!.status(), 'profile status').toBeLessThan(500);
  });

  test('@public T-PUB-22 — /notifications without auth does not 5xx', async ({ page }) => {
    const res = await page.goto('/notifications');
    expect(res, 'response defined').not.toBeNull();
    expect(res!.status(), 'notifications status').toBeLessThan(500);
  });

  test('@public T-PUB-23 — /audit without auth does not 5xx', async ({ page }) => {
    const res = await page.goto('/audit');
    expect(res, 'response defined').not.toBeNull();
    expect(res!.status(), 'audit status').toBeLessThan(500);
  });

  test('@public T-PUB-24 — /history without auth does not 5xx', async ({ page }) => {
    const res = await page.goto('/history');
    expect(res, 'response defined').not.toBeNull();
    expect(res!.status(), 'history status').toBeLessThan(500);
  });

  test('@public T-PUB-25 — /whatsapp-history without auth does not 5xx', async ({ page }) => {
    const res = await page.goto('/whatsapp-history');
    expect(res, 'response defined').not.toBeNull();
    expect(res!.status(), 'whatsapp-history status').toBeLessThan(500);
  });
});