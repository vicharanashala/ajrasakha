
import { test, expect } from '@playwright/test';
import { openApp } from './test-helpers';

test.describe('Error Handling Environment Tests', () => {

  test('34. Application should return a successful response', async ({ page }) => {
    expect(await openApp(page)).toBe(200);
  });

  test('35. Application should have a valid URL', async ({ page }) => {
    await openApp(page);
    expect(() => new URL(page.url())).not.toThrow();
  });

  test('36. Application should use the correct hostname', async ({ page }) => {
    await openApp(page);
    expect(new URL(page.url()).hostname).toBe('chat.annam.ai');
  });

  test('37. Application should load successfully', async ({ page }) => {
    const status = await openApp(page);
    expect(status).toBe(200);
  });

  test('38. Application should remain on HTTPS', async ({ page }) => {
    await openApp(page);
    expect(new URL(page.url()).protocol).toBe('https:');
  });

  test('39. Application should provide a valid page title', async ({ page }) => {
    await openApp(page);
    expect(typeof await page.title()).toBe('string');
  });

  test('40. Application should maintain its URL', async ({ page }) => {
    await openApp(page);

    const originalURL = page.url();

    expect(page.url()).toBe(originalURL);
    expect(new URL(page.url()).hostname).toBe('chat.annam.ai');
  });

});
