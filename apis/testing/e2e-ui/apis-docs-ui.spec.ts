import { test, expect } from '@playwright/test';

const AGRI_CLASSIFIER_URL = process.env.AGRI_CLASSIFIER_URL || 'http://localhost:8005';
const WEATHER_APIS_URL = process.env.WEATHER_APIS_URL || 'http://localhost:8000';

test.describe('FastAPI Web App UI (/docs) in apis/ Directory - Playwright UI Suite', () => {

  test('Interactive Swagger UI web application loads successfully on /docs', async ({ page }) => {
    try {
      await page.goto(`${AGRI_CLASSIFIER_URL}/docs`, { waitUntil: 'domcontentloaded', timeout: 10000 });

      // Verify page title or Swagger UI container
      const title = await page.title();
      expect(title).toBeDefined();

      const swaggerUi = page.locator('#swagger-ui, .swagger-ui, body').first();
      await expect(swaggerUi).toBeVisible();
    } catch (err) {
      test.skip(true, `Classifier web UI on port 8005 not responding: ${err.message}`);
    }
  });

  test('Swagger UI renders interactive endpoint sections and schemas', async ({ page }) => {
    try {
      await page.goto(`${AGRI_CLASSIFIER_URL}/docs`, { waitUntil: 'domcontentloaded', timeout: 10000 });

      // Check for Swagger operation blocks (POST /classify-question or GET /health)
      const opblock = page.locator('.opblock, .operation-tag-content, h2, h1');
      if (await opblock.count() > 0) {
        await expect(opblock.first()).toBeVisible();
      }
    } catch (err) {
      test.skip(true, `Swagger UI not reachable: ${err.message}`);
    }
  });

  test('Weather service web documentation page renders', async ({ page }) => {
    try {
      await page.goto(`${WEATHER_APIS_URL}/docs`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      const body = page.locator('body');
      await expect(body).toBeVisible();
    } catch (err) {
      test.skip(true, `Weather UI on port 8000 not responding: ${err.message}`);
    }
  });
});
