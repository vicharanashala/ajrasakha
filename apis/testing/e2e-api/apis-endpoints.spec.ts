import { test, expect } from '@playwright/test';
import { executeTimedApiTest } from './test-helpers.js';

const APIS_PORTS = {
  agricultureClassifier: process.env.AGRI_CLASSIFIER_URL || 'http://localhost:8005',
  chemicalDetector: process.env.CHEMICAL_DETECTOR_URL || 'http://localhost:8002',
  writingAssistant: process.env.WRITING_ASSISTANT_URL || 'http://localhost:8004',
  weatherApis: process.env.WEATHER_APIS_URL || 'http://localhost:8000',
};

test.describe('Microservices in apis/ Directory - Backend API E2E & Adversarial QA Suite', () => {

  // =========================================================================
  // 1. Agriculture Question Classifier (apis/agriculture_classifier)
  // =========================================================================
  test.describe('1. Agriculture Classifier: Contracts, Boundary & Adversarial Tests', () => {

    test('TC-API-001: [HEALTH-CHECK] GET /health verifies classifier is operational', async ({ request }, testInfo) => {
      const { status, body } = await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${APIS_PORTS.agricultureClassifier}/health`,
        maxLatencyMs: 500,
        expectedStatus: 200,
      });
      expect(body).toHaveProperty('status', 'ok');
    });

    test('TC-API-002: [INPUT-VALIDATION] POST /classify-question rejects empty string with 400', async ({ request }, testInfo) => {
      const { status, body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${APIS_PORTS.agricultureClassifier}/classify-question`,
        data: { question: '' },
        maxLatencyMs: 500,
        expectedStatus: 400,
      });
      expect(body.detail).toContain('must not be empty');
    });

    test('TC-API-003: [BOUNDARY-TEST] POST /classify-question rejects whitespace-only string with 400', async ({ request }, testInfo) => {
      const { status, body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${APIS_PORTS.agricultureClassifier}/classify-question`,
        data: { question: '   \n\t   ' },
        maxLatencyMs: 500,
        expectedStatus: 400,
      });
      expect(body.detail).toContain('must not be empty');
    });

    test('TC-API-004: [TYPE-CONFUSION] POST /classify-question rejects numeric type with 422 validation error', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${APIS_PORTS.agricultureClassifier}/classify-question`,
        data: { question: 99999 },
        maxLatencyMs: 500,
        expectedStatus: [400, 422],
      });
    });

    test('TC-API-005: [TYPE-CONFUSION] POST /classify-question rejects array payload with 422 validation error', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${APIS_PORTS.agricultureClassifier}/classify-question`,
        data: { question: ['invalid', 'nested', 'array'] },
        maxLatencyMs: 500,
        expectedStatus: [400, 422],
      });
    });

    test('TC-API-006: [MALFORMED-JSON] POST /classify-question rejects invalid JSON payload with 400', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${APIS_PORTS.agricultureClassifier}/classify-question`,
        headers: { 'Content-Type': 'application/json' },
        data: '{"question": corrupted_json_syntax',
        maxLatencyMs: 500,
        expectedStatus: [400, 422],
      });
    });

    test('TC-API-007: [SECURITY-SQLI] POST /classify-question safely handles SQL injection vector without crashing', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${APIS_PORTS.agricultureClassifier}/classify-question`,
        data: { question: "paddy'; DROP TABLE crops; SELECT * FROM users WHERE '1'='1" },
        maxLatencyMs: 800,
        expectedStatus: 200,
      });
      expect(body).toHaveProperty('is_agriculture');
    });

    test('TC-API-008: [SECURITY-XSS] POST /classify-question safely sanitizes and handles script tags without crashing', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${APIS_PORTS.agricultureClassifier}/classify-question`,
        data: { question: '<script>alert("XSS_VULNERABILITY")</script> Wheat rust fungicide' },
        maxLatencyMs: 800,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
    });

    test('TC-API-009: [HTTP-METHOD-GUARD] DELETE /classify-question rejects unsupported method with 405 Method Not Allowed', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'DELETE',
        url: `${APIS_PORTS.agricultureClassifier}/classify-question`,
        maxLatencyMs: 500,
        expectedStatus: [404, 405],
      });
    });

    test('TC-API-010: [CONTRACT-SCHEMA] POST /classify-question correctly classifies agricultural query', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${APIS_PORTS.agricultureClassifier}/classify-question`,
        data: { question: 'How to manage stem borer in paddy crop?' },
        maxLatencyMs: 1000,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
      expect(body.disclaimer).toBe('NA');
    });

    test('TC-API-011: [OPENAPI-SCHEMA] GET /openapi.json returns valid API specification schema', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${APIS_PORTS.agricultureClassifier}/openapi.json`,
        maxLatencyMs: 600,
        expectedStatus: 200,
      });
      expect(body).toHaveProperty('openapi');
      expect(body).toHaveProperty('paths');
    });
  });

  // =========================================================================
  // 2. Banned Chemical Detector (apis/chemical_detector)
  // =========================================================================
  test.describe('2. Banned Chemical Detector: Contracts & Evasion Defense', () => {

    test('TC-API-012: [HEALTH-CHECK] GET /health checks chemical detector readiness', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${APIS_PORTS.chemicalDetector}/health`,
        maxLatencyMs: 500,
        expectedStatus: 200,
      });
    });

    test('TC-API-013: [SAFETY-DETECTION] POST /detect-chemicals flags hazardous prohibited pesticides', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${APIS_PORTS.chemicalDetector}/detect-chemicals`,
        data: { text: 'Apply Aldrin 10G and Endosulfan to safeguard the crop from insects.' },
        maxLatencyMs: 1000,
        expectedStatus: 200,
      });
      expect(body.detected).toEqual(expect.arrayContaining(['aldrin', 'endosulfan']));
      expect(body.count).toBe(2);
    });

    test('TC-API-014: [EVASION-CASE-INSENSITIVE] POST /detect-chemicals catches mixed-case obfuscation (e.g. aLdRiN)', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${APIS_PORTS.chemicalDetector}/detect-chemicals`,
        data: { text: 'Farmer advised to use aLdRiN and ENDOSULFAN powder.' },
        maxLatencyMs: 800,
        expectedStatus: 200,
      });
      expect(body.detected).toContain('aldrin');
    });

    test('TC-API-015: [EVASION-LEETSPEAK] POST /detect-chemicals catches leetspeak obfuscation (e.g. 4ldr1n)', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${APIS_PORTS.chemicalDetector}/detect-chemicals`,
        data: { text: 'Farmer advised to use 4ldr1n.' },
        maxLatencyMs: 800,
        expectedStatus: 200,
      });
      expect(body.detected).toContain('aldrin');
    });

    test('TC-API-016: [NEGATIVE-FALSE-POSITIVE] POST /detect-chemicals does not flag permitted legal agrochemicals', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${APIS_PORTS.chemicalDetector}/detect-chemicals`,
        data: { text: 'Spray Mancozeb 75 WP or Neem Oil at 3ml per liter of water.' },
        maxLatencyMs: 800,
        expectedStatus: 200,
      });
      expect(body.detected).toEqual([]);
      expect(body.count).toBe(0);
    });
  });

  // =========================================================================
  // 3. Writing Assistant & Weather APIs
  // =========================================================================
  test.describe('3. Supporting Microservices Contracts & Negative Routing', () => {

    test('TC-API-017: [HEALTH-CHECK] GET /health checks writing assistant status', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${APIS_PORTS.writingAssistant}/health`,
        maxLatencyMs: 500,
        expectedStatus: 200,
      });
    });

    test('TC-API-018: [HEALTH-CHECK] GET /health verifies weather station cache and health', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${APIS_PORTS.weatherApis}/health`,
        maxLatencyMs: 500,
        expectedStatus: 200,
      });
    });

    test('TC-API-019: [NEGATIVE-404] Accessing non-existent microservice route returns HTTP 404', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${APIS_PORTS.agricultureClassifier}/non-existent-api-endpoint`,
        maxLatencyMs: 500,
        expectedStatus: 404,
      });
    });
  });
});
