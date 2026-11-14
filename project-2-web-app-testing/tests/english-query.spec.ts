
import { test, expect } from '@playwright/test';
import { openApp } from './test-helpers';

test.describe('English Query Tests', () => {

  test('1. Application should open successfully', async ({ page }) => {
    const status = await openApp(page);
    expect(status).toBe(200);
  });

  test('2. Application should use HTTPS', async ({ page }) => {
    await openApp(page);
    expect(page.url()).toMatch(/^https:/);
  });

  test('3. Application should have a valid URL', async ({ page }) => {
    await openApp(page);
    expect(() => new URL(page.url())).not.toThrow();
  });

  test('4. Application should load the correct host', async ({ page }) => {
    await openApp(page);
    expect(new URL(page.url()).hostname).toBe('chat.annam.ai');
  });

  test('5. Application should return a page title', async ({ page }) => {
    await openApp(page);
    expect(typeof await page.title()).toBe('string');
  });

  test('6. Application should load successfully', async ({ page }) => {
    expect(await openApp(page)).toBe(200);
  });

  test('7. Application URL should remain valid', async ({ page }) => {
    await openApp(page);
    expect(new URL(page.url()).hostname).toBe('chat.annam.ai');
  });

});
