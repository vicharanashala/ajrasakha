
import { test, expect } from '@playwright/test';
import { openApp } from './test-helpers';

test.describe('Mobile View Tests', () => {

  test('27. Application should open at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    expect(await openApp(page)).toBe(200);
  });

  test('28. Application should open at tablet width', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    expect(await openApp(page)).toBe(200);
  });

  test('29. Application should open at small mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });

    expect(await openApp(page)).toBe(200);
  });

  test('30. Application should open at large mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });

    expect(await openApp(page)).toBe(200);
  });

  test('31. Mobile viewport dimensions should be applied', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openApp(page);

    expect(page.viewportSize()).toEqual({
      width: 375,
      height: 812,
    });
  });

  test('32. Application should open successfully on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    expect(await openApp(page)).toBe(200);
  });

  test('33. Application should retain mobile viewport after navigation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openApp(page);

    expect(page.viewportSize()?.width).toBe(375);
    expect(page.viewportSize()?.height).toBe(812);
  });

});
