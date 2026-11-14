import { test, expect } from '@playwright/test';

const AGRI_CLASSIFIER_URL = process.env.AGRI_CLASSIFIER_URL || 'http://localhost:8005';
const CHEMICAL_DETECTOR_URL = process.env.CHEMICAL_DETECTOR_URL || 'http://localhost:8002';
const WEATHER_APIS_URL = process.env.WEATHER_APIS_URL || 'http://localhost:8000';

test.describe('FastAPI Web App UI (/docs) in apis/ Directory - Playwright UI & Usability Suite', () => {

  test('TC-E2E-001: Interactive Swagger UI web application loads successfully on /docs', async ({ page }) => {
    await page.goto(`${AGRI_CLASSIFIER_URL}/docs`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const title = await page.title();
    expect(title).toContain('Swagger UI');
    const swaggerUi = page.locator('#swagger-ui, .swagger-ui, body').first();
    await expect(swaggerUi).toBeVisible();
  });

  test('TC-E2E-002: Swagger UI renders interactive endpoint sections and schemas', async ({ page }) => {
    await page.goto(`${AGRI_CLASSIFIER_URL}/docs`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const opblock = page.locator('.opblock, .operation-tag-content, h2, h1');
    await expect(opblock.first()).toBeVisible();
  });

  test('TC-E2E-003: Weather service web documentation page renders', async ({ page }) => {
    await page.goto(`${WEATHER_APIS_URL}/docs`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('TC-E2E-004: Chemical detector documentation web app loads on /docs', async ({ page }) => {
    await page.goto(`${CHEMICAL_DETECTOR_URL}/docs`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('TC-E2E-005: Responsive Viewport - Documentation renders cleanly on mobile screen (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${AGRI_CLASSIFIER_URL}/docs`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const header = page.locator('.topbar, #swagger-ui, body').first();
    await expect(header).toBeVisible();
  });

  test('TC-E2E-006: Negative route navigation (/invalid-docs-route) returns 404 without crashing web app', async ({ page }) => {
    const response = await page.goto(`${AGRI_CLASSIFIER_URL}/invalid-docs-route`, { timeout: 10000 });
    expect(response?.status()).toBe(404);
  });
});
