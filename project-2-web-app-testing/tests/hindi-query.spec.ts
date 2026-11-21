
import { test, expect } from '@playwright/test';
import { openApp, reloadApp } from './test-helpers';

test.describe('Hindi Query Environment Tests', () => {

  test('8. Application should open for Hindi testing', async ({ page }) => {
    expect(await openApp(page)).toBe(200);
  });

  test('9. Hindi testing page should use HTTPS', async ({ page }) => {
    await openApp(page);
    expect(page.url()).toMatch(/^https:/);
  });

  test('10. Hindi testing page should have a valid URL', async ({ page }) => {
    await openApp(page);
    expect(() => new URL(page.url())).not.toThrow();
  });

  test('11. Application should remain available after reload', async ({ page }) => {
    await openApp(page);
    expect(await reloadApp(page)).toBe(200);
  });

  test('12. Application should retain its hostname', async ({ page }) => {
    await openApp(page);
    expect(new URL(page.url()).hostname).toBe('chat.annam.ai');
  });

  test('13. Application should provide a page title', async ({ page }) => {
    await openApp(page);
    expect(typeof await page.title()).toBe('string');
  });

  test('14. Application URL should remain valid after reload', async ({ page }) => {
    await openApp(page);
    await reloadApp(page);
    expect(() => new URL(page.url())).not.toThrow();
  });

});
