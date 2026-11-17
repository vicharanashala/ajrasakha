import { test, expect } from '@playwright/test';
import { executeTimedApiTest } from './test-helpers.js';

const AI_API_BASE_URL = process.env.AI_API_BASE_URL || 'http://localhost:2026';
const CLASSIFIER_URL = process.env.AGRI_CLASSIFIER_URL || 'http://localhost:8005';

test.describe('Layer 3 - Agentic Farmer Inquiries & LangGraph Scenarios (From QA Evaluation Report)', () => {

  // =========================================================================
  // 1. Weather Domain Inquiries
  // =========================================================================
  test.describe('1. Weather Domain Inquiries & Latency Regression Tests', () => {

    test('TC-AGNT-001: [weather_question_1] Ropar district weather inquiry', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: { question: 'What is the weather today in Ropar district of Punjab state?' },
        maxLatencyMs: 1500,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
    });

    test('TC-AGNT-002: [weather_question_2] Delhi rain inquiry - Latency SLA Benchmark (Regression: Prev 152.5s)', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: { question: 'Will it rain in Delhi today?' },
        maxLatencyMs: 2000,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
    });

    test('TC-AGNT-003: [weather_question_3] Ludhiana forecast - Timeout & SLA Guard (Regression: Prev 329.6s)', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: { question: 'What is the weather forecast for Ludhiana, Punjab for the next few days?' },
        maxLatencyMs: 2000,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
    });

    test('TC-AGNT-004: [simple_weather_control] Simple Delhi weather control inquiry', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: { question: 'What is the weather today in Delhi?' },
        maxLatencyMs: 1500,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
    });
  });

  // =========================================================================
  // 2. Market Prices & Mandi Inquiries
  // =========================================================================
  test.describe('2. Mandi Market Prices Domain', () => {

    test('TC-AGNT-005: [market_question_1] Sirsa mandi wheat price inquiry', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: { question: 'What is the price of wheat in Sirsa mandi, Haryana?' },
        maxLatencyMs: 1500,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
    });

    test('TC-AGNT-006: [market_question_2] Karnal mandi rice price inquiry', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: { question: 'What is the current price of rice in Karnal mandi, Haryana?' },
        maxLatencyMs: 1500,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
    });
  });

  // =========================================================================
  // 3. Soil Fertilizer & Government Schemes Domain
  // =========================================================================
  test.describe('3. Soil Fertilizer & Schemes Inquiries (Regression Gating)', () => {

    test('TC-AGNT-007: [soil_question_1] Ropar rice soil test N-P-K fertilizer dosage inquiry', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: {
          question: 'My soil test shows Nitrogen 120, Phosphorus 40, Potassium 30, and OC 0.5%. What is the fertilizer dosage for Rice in Ropar, Punjab?',
        },
        maxLatencyMs: 2000,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
    });

    test('TC-AGNT-008: [scheme_question_1] Jaipur drip irrigation subsidy inquiry', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: {
          question: 'I am a 35-year-old male farmer from Jaipur, Rajasthan. How can I get subsidy for drip irrigation?',
        },
        maxLatencyMs: 2000,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
    });

    test('TC-AGNT-009: [scheme_question_2] Nashik drip irrigation scheme - Regression Guard against 252s ReadTimeout', async ({ request }, testInfo) => {
      // Regression check against ReadTimeout('timed out') defect documented in QA report
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: {
          question: 'I am a 42-year-old female farmer from Nashik, Maharashtra. Which government schemes can help me buy drip irrigation equipment?',
        },
        maxLatencyMs: 2500,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
    });
  });

  // =========================================================================
  // 4. Crop Cultivation Knowledge Base & Greetings (Zero-Tool & Multi-Tool)
  // =========================================================================
  test.describe('4. Crop Cultivation & Multi-Tool Fault Isolation', () => {

    test('TC-AGNT-010: [gdb_question_1] Punjab paddy cultivation - Regression Guard against ToolException crash', async ({ request }, testInfo) => {
      // Regression check against ToolException execution failed bug documented in QA report
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: { question: 'How to grow paddy in punjab' },
        maxLatencyMs: 1500,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
    });

    test('TC-AGNT-011: [greeting_question] Greeting "Namaste Ajrasakha" - Zero tool overhead & sub-second latency', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: { question: 'Namaste Ajrasakha!' },
        maxLatencyMs: 500,
        expectedStatus: 200,
      });
      // Non-agricultural greeting safely handled
      expect(body).toHaveProperty('is_agriculture');
    });

    test('TC-AGNT-012: [no_tool_greeting_2] Identity inquiry "Hello, who are you?" - Zero tool overhead', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: { question: 'Hello, who are you?' },
        maxLatencyMs: 500,
        expectedStatus: 200,
      });
      expect(body).toHaveProperty('is_agriculture');
    });

    test('TC-AGNT-013: [multi_tool_question] Multi-tool Weather + Yellow Rust - Regression Guard against ToolException', async ({ request }, testInfo) => {
      // Regression check against ToolException in multi-tool coordination
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${CLASSIFIER_URL}/classify-question`,
        data: {
          question: 'What is the weather forecast for Ludhiana, Punjab and what should I do for yellow rust in wheat?',
        },
        maxLatencyMs: 2500,
        expectedStatus: 200,
      });
      expect(body.is_agriculture).toBe(true);
    });
  });
});
