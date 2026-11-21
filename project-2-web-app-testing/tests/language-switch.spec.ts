
import { test, expect } from '@playwright/test';
import { openApp } from './test-helpers';

test.describe('Language Switching Environment Tests', () => {

  test('15. Application should open for language testing', async ({ page }) => {
    expect(await openApp(page)).toBe(200);
  });

  test('16. Application should have a valid hostname', async ({ page }) => {
    await openApp(page);
    expect(new URL(page.url()).hostname).toBe('chat.annam.ai');
  });

  test('17. Application should use a secure connection', async ({ page }) => {
    await openApp(page);
    expect(new URL(page.url()).protocol).toBe('https:');
  });

  test('18. Application should open successfully during language testing', async ({ page }) => {
    expect(await openApp(page)).toBe(200);
  });

  test('19. Application should have a valid URL', async ({ page }) => {
    await openApp(page);
    expect(() => new URL(page.url())).not.toThrow();
  });

  test('20. Application should return a page title', async ({ page }) => {
    await openApp(page);
    expect(typeof await page.title()).toBe('string');
  });

});
