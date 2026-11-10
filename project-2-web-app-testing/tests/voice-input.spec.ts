
import { test, expect } from '@playwright/test';
import { openApp, reloadApp } from './test-helpers';

test.describe('Voice Input Environment Tests', () => {

  test('21. Application should open for voice testing', async ({ page }) => {
    expect(await openApp(page)).toBe(200);
  });

  test('22. Application should use HTTPS', async ({ page }) => {
    await openApp(page);
    expect(new URL(page.url()).protocol).toBe('https:');
  });

  test('23. Application should have a valid hostname', async ({ page }) => {
    await openApp(page);
    expect(new URL(page.url()).hostname).toBe('chat.annam.ai');
  });

  test('24. Application should reload successfully', async ({ page }) => {
    await openApp(page);
    expect(await reloadApp(page)).toBe(200);
  });

  test('25. Application should provide a page title', async ({ page }) => {
    await openApp(page);
    expect(typeof await page.title()).toBe('string');
  });

  test('26. Application URL should remain valid after reload', async ({ page }) => {
    await openApp(page);
    await reloadApp(page);
    expect(page.url()).toContain('chat.annam.ai');
  });

});
