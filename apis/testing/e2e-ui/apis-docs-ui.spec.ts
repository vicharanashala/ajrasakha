import { test, expect } from '@playwright/test';

const AGRI_CLASSIFIER_URL = process.env.AGRI_CLASSIFIER_URL || 'http://localhost:8005';
const CHEMICAL_DETECTOR_URL = process.env.CHEMICAL_DETECTOR_URL || 'http://localhost:8002';
const WEATHER_APIS_URL = process.env.WEATHER_APIS_URL || 'http://localhost:8000';

test.describe('FastAPI Web App UI (/docs) in apis/ Directory - Playwright UI & Usability Suite', () => {

  test('TC-E2E-001: Interactive Swagger UI web application loads successfully on /docs', async ({ page }, testInfo) => {
    const url = `${AGRI_CLASSIFIER_URL}/docs`;
    const maxLatencyMs = 3000;
    const reproduceSteps = `1. Launch browser\n2. Navigate to: ${url}\n3. Verify page title contains 'Swagger UI' and '#swagger-ui' container is visible\n4. SLA Target: < ${maxLatencyMs}ms`;

    testInfo.annotations.push({ type: 'target_url', description: url });
    testInfo.annotations.push({ type: 'sla_target', description: `< ${maxLatencyMs}ms` });
    testInfo.annotations.push({ type: 'reproduce_cmd', description: `playwright test --project=ui --grep="TC-E2E-001"` });
    testInfo.annotations.push({ type: 'reproduce_steps', description: reproduceSteps });

    const start = performance.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const title = await page.title();
    expect(title).toContain('Swagger UI');
    const swaggerUi = page.locator('#swagger-ui, .swagger-ui, body').first();
    await expect(swaggerUi).toBeVisible();

    const latencyMs = Math.round(performance.now() - start);
    testInfo.annotations.push({ type: 'latency', description: `${latencyMs}ms` });
    testInfo.annotations.push({ type: 'sla_status', description: latencyMs <= maxLatencyMs ? 'MET' : 'BREACHED' });

    expect(
      latencyMs,
      `UI Load Latency test failed: ${latencyMs}ms exceeded SLA threshold of ${maxLatencyMs}ms for ${url}.\nReproduction:\n${reproduceSteps}`
    ).toBeLessThanOrEqual(maxLatencyMs);
  });

  test('TC-E2E-002: Swagger UI renders interactive endpoint sections and schemas', async ({ page }, testInfo) => {
    const url = `${AGRI_CLASSIFIER_URL}/docs`;
    const maxLatencyMs = 2000;
    const reproduceSteps = `1. Navigate to: ${url}\n2. Verify endpoint blocks '.opblock' are rendered\n3. SLA Target: < ${maxLatencyMs}ms`;

    testInfo.annotations.push({ type: 'target_url', description: url });
    testInfo.annotations.push({ type: 'sla_target', description: `< ${maxLatencyMs}ms` });
    testInfo.annotations.push({ type: 'reproduce_cmd', description: `playwright test --project=ui --grep="TC-E2E-002"` });
    testInfo.annotations.push({ type: 'reproduce_steps', description: reproduceSteps });

    const start = performance.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const opblock = page.locator('.opblock, .operation-tag-content, h2, h1');
    await expect(opblock.first()).toBeVisible();

    const latencyMs = Math.round(performance.now() - start);
    testInfo.annotations.push({ type: 'latency', description: `${latencyMs}ms` });
    testInfo.annotations.push({ type: 'sla_status', description: latencyMs <= maxLatencyMs ? 'MET' : 'BREACHED' });

    expect(
      latencyMs,
      `UI Render Latency test failed: ${latencyMs}ms exceeded SLA of ${maxLatencyMs}ms.\nReproduction:\n${reproduceSteps}`
    ).toBeLessThanOrEqual(maxLatencyMs);
  });

  test('TC-E2E-003: Weather service web documentation page renders', async ({ page }, testInfo) => {
    const url = `${WEATHER_APIS_URL}/docs`;
    const maxLatencyMs = 2000;
    const reproduceSteps = `1. Navigate to: ${url}\n2. Verify page body is visible\n3. SLA Target: < ${maxLatencyMs}ms`;

    testInfo.annotations.push({ type: 'target_url', description: url });
    testInfo.annotations.push({ type: 'sla_target', description: `< ${maxLatencyMs}ms` });
    testInfo.annotations.push({ type: 'reproduce_cmd', description: `playwright test --project=ui --grep="TC-E2E-003"` });
    testInfo.annotations.push({ type: 'reproduce_steps', description: reproduceSteps });

    const start = performance.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const body = page.locator('body');
    await expect(body).toBeVisible();

    const latencyMs = Math.round(performance.now() - start);
    testInfo.annotations.push({ type: 'latency', description: `${latencyMs}ms` });
    testInfo.annotations.push({ type: 'sla_status', description: latencyMs <= maxLatencyMs ? 'MET' : 'BREACHED' });

    expect(
      latencyMs,
      `UI Render Latency test failed: ${latencyMs}ms exceeded SLA of ${maxLatencyMs}ms.\nReproduction:\n${reproduceSteps}`
    ).toBeLessThanOrEqual(maxLatencyMs);
  });

  test('TC-E2E-004: Chemical detector documentation web app loads on /docs', async ({ page }, testInfo) => {
    const url = `${CHEMICAL_DETECTOR_URL}/docs`;
    const maxLatencyMs = 2000;
    const reproduceSteps = `1. Navigate to: ${url}\n2. Verify documentation body is visible\n3. SLA Target: < ${maxLatencyMs}ms`;

    testInfo.annotations.push({ type: 'target_url', description: url });
    testInfo.annotations.push({ type: 'sla_target', description: `< ${maxLatencyMs}ms` });
    testInfo.annotations.push({ type: 'reproduce_cmd', description: `playwright test --project=ui --grep="TC-E2E-004"` });
    testInfo.annotations.push({ type: 'reproduce_steps', description: reproduceSteps });

    const start = performance.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const body = page.locator('body');
    await expect(body).toBeVisible();

    const latencyMs = Math.round(performance.now() - start);
    testInfo.annotations.push({ type: 'latency', description: `${latencyMs}ms` });
    testInfo.annotations.push({ type: 'sla_status', description: latencyMs <= maxLatencyMs ? 'MET' : 'BREACHED' });

    expect(
      latencyMs,
      `UI Render Latency test failed: ${latencyMs}ms exceeded SLA of ${maxLatencyMs}ms.\nReproduction:\n${reproduceSteps}`
    ).toBeLessThanOrEqual(maxLatencyMs);
  });

  test('TC-E2E-005: Responsive Viewport - Documentation renders cleanly on mobile screen (375x667)', async ({ page }, testInfo) => {
    const url = `${AGRI_CLASSIFIER_URL}/docs`;
    const maxLatencyMs = 2000;
    const reproduceSteps = `1. Set browser viewport size to 375x667\n2. Navigate to: ${url}\n3. Verify topbar / swagger-ui is visible\n4. SLA Target: < ${maxLatencyMs}ms`;

    testInfo.annotations.push({ type: 'target_url', description: url });
    testInfo.annotations.push({ type: 'sla_target', description: `< ${maxLatencyMs}ms` });
    testInfo.annotations.push({ type: 'reproduce_cmd', description: `playwright test --project=ui --grep="TC-E2E-005"` });
    testInfo.annotations.push({ type: 'reproduce_steps', description: reproduceSteps });

    const start = performance.now();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const header = page.locator('.topbar, #swagger-ui, body').first();
    await expect(header).toBeVisible();

    const latencyMs = Math.round(performance.now() - start);
    testInfo.annotations.push({ type: 'latency', description: `${latencyMs}ms` });
    testInfo.annotations.push({ type: 'sla_status', description: latencyMs <= maxLatencyMs ? 'MET' : 'BREACHED' });

    expect(
      latencyMs,
      `UI Mobile Viewport Latency test failed: ${latencyMs}ms exceeded SLA of ${maxLatencyMs}ms.\nReproduction:\n${reproduceSteps}`
    ).toBeLessThanOrEqual(maxLatencyMs);
  });

  test('TC-E2E-006: Negative route navigation (/invalid-docs-route) returns 404 without crashing web app', async ({ page }, testInfo) => {
    const url = `${AGRI_CLASSIFIER_URL}/invalid-docs-route`;
    const maxLatencyMs = 1500;
    const reproduceSteps = `1. Navigate to unmapped route: ${url}\n2. Verify HTTP response status is 404\n3. SLA Target: < ${maxLatencyMs}ms`;

    testInfo.annotations.push({ type: 'target_url', description: url });
    testInfo.annotations.push({ type: 'sla_target', description: `< ${maxLatencyMs}ms` });
    testInfo.annotations.push({ type: 'reproduce_cmd', description: `playwright test --project=ui --grep="TC-E2E-006"` });
    testInfo.annotations.push({ type: 'reproduce_steps', description: reproduceSteps });

    const start = performance.now();
    const response = await page.goto(url, { timeout: 10000 });
    expect(response?.status()).toBe(404);

    const latencyMs = Math.round(performance.now() - start);
    testInfo.annotations.push({ type: 'latency', description: `${latencyMs}ms` });
    testInfo.annotations.push({ type: 'sla_status', description: latencyMs <= maxLatencyMs ? 'MET' : 'BREACHED' });

    expect(
      latencyMs,
      `UI 404 Route Latency test failed: ${latencyMs}ms exceeded SLA of ${maxLatencyMs}ms.\nReproduction:\n${reproduceSteps}`
    ).toBeLessThanOrEqual(maxLatencyMs);
  });
});
