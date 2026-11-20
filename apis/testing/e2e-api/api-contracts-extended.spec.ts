import { test, expect } from '@playwright/test';
import { executeTimedApiTest } from './test-helpers.js';

const AI_API_BASE_URL = process.env.AI_API_BASE_URL || 'http://localhost:2026';
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://localhost:3000';
const WHATSAPP_BASE_URL = process.env.WHATSAPP_BASE_URL || 'http://localhost:4000';
const REMOTE_IP = process.env.REMOTE_IP || 'localhost';

test.describe('Layer 1 & Layer 2 - API Contracts & MCP Connectivity Suite (From QA Stable Report)', () => {

  // =========================================================================
  // Layer 1 - Part 1: AI API Agent Contracts (5 checks)
  // =========================================================================
  test.describe('Layer 1.1: AI API Agent Contracts', () => {

    test('TC-API-AI-001: [CONTRACT] GET /health verifies AI API agent health and database', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${AI_API_BASE_URL}/health`,
        maxLatencyMs: 500,
        expectedStatus: 200,
      });
      expect(body).toHaveProperty('status', 'ok');
    });

    test('TC-API-AI-002: [CONTRACT] GET /ready verifies AI API readiness', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${AI_API_BASE_URL}/ready`,
        maxLatencyMs: 500,
        expectedStatus: 200,
      });
    });

    test('TC-API-AI-003: [CONTRACT] GET /info verifies service metadata and version', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${AI_API_BASE_URL}/info`,
        maxLatencyMs: 500,
        expectedStatus: 200,
      });
    });

    test('TC-API-AI-004: [CONTRACT] GET /assistants lists available assistant agents', async ({ request }, testInfo) => {
      const { body } = await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${AI_API_BASE_URL}/assistants`,
        maxLatencyMs: 500,
        expectedStatus: 200,
      });
      expect(Array.isArray(body)).toBe(true);
    });

    test('TC-API-AI-005: [CONTRACT] POST /runs/stream verifies agent stream endpoint', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${AI_API_BASE_URL}/runs/stream`,
        data: {
          assistant_id: 'ajrasakha_agent',
          input: { messages: [{ role: 'user', content: 'Hello' }] },
          stream: true,
          stream_mode: 'values',
        },
        maxLatencyMs: 2500,
        expectedStatus: 200,
      });
    });
  });

  // =========================================================================
  // Layer 1 - Part 2: Backend Desk Questions Contracts (4 checks)
  // =========================================================================
  test.describe('Layer 1.2: Backend Desk Questions Auth Contracts', () => {

    test('TC-API-BKQ-001: [AUTH-GUARD] GET /questions/ enforces authentication requirement', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${BACKEND_BASE_URL}/questions/`,
        maxLatencyMs: 600,
        expectedStatus: [401, 403],
      });
    });

    test('TC-API-BKQ-002: [AUTH-GUARD] POST /questions/status-summary enforces authentication requirement', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${BACKEND_BASE_URL}/questions/status-summary`,
        data: {},
        maxLatencyMs: 600,
        expectedStatus: [401, 403],
      });
    });

    test('TC-API-BKQ-003: [AUTH-GUARD] POST /questions/allocated enforces authentication requirement', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${BACKEND_BASE_URL}/questions/allocated`,
        data: {},
        maxLatencyMs: 600,
        expectedStatus: [401, 403],
      });
    });

    test('TC-API-BKQ-004: [AUTH-GUARD] POST /questions/detailed enforces authentication requirement', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${BACKEND_BASE_URL}/questions/detailed`,
        data: {},
        maxLatencyMs: 600,
        expectedStatus: [401, 403],
      });
    });
  });

  // =========================================================================
  // Layer 1 - Part 3: Backend Answers & Analytics Contracts (6 checks)
  // =========================================================================
  test.describe('Layer 1.3: Backend Answers & Analytics Auth Contracts', () => {

    test('TC-API-BKA-001: [AUTH-GUARD] GET /answers/submissions enforces authentication requirement', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${BACKEND_BASE_URL}/answers/submissions`,
        maxLatencyMs: 600,
        expectedStatus: [401, 403],
      });
    });

    test('TC-API-BKA-002: [AUTH-GUARD] GET /answers/finalizedAnswers enforces authentication requirement', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${BACKEND_BASE_URL}/answers/finalizedAnswers`,
        maxLatencyMs: 600,
        expectedStatus: [401, 403],
      });
    });

    test('TC-API-BKA-003: [AUTH-GUARD] GET /answers/faqs/mod enforces authentication requirement', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${BACKEND_BASE_URL}/answers/faqs/mod`,
        maxLatencyMs: 600,
        expectedStatus: [401, 403],
      });
    });

    test('TC-API-BKA-004: [AUTH-GUARD] GET /analytics/ enforces authentication requirement or responds cleanly', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${BACKEND_BASE_URL}/analytics/`,
        maxLatencyMs: 600,
        expectedStatus: [200, 401, 403],
      });
    });

    test('TC-API-BKA-005: [AUTH-GUARD] GET /analytics/kpi enforces authentication requirement or responds cleanly', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${BACKEND_BASE_URL}/analytics/kpi`,
        maxLatencyMs: 600,
        expectedStatus: [200, 401, 403],
      });
    });

    test('TC-API-BKA-006: [AUTH-GUARD] GET /analytics/top-crops enforces authentication requirement or responds cleanly', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${BACKEND_BASE_URL}/analytics/top-crops`,
        maxLatencyMs: 600,
        expectedStatus: [200, 401, 403],
      });
    });
  });

  // =========================================================================
  // Layer 1 - Part 4: Backend Auth & WhatsApp API Contracts (7 checks)
  // =========================================================================
  test.describe('Layer 1.4: Backend Auth & WhatsApp Contracts', () => {

    test('TC-API-AUT-001: [INPUT-VALIDATION] POST /auth/login rejects empty payload with 400 Bad Request', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${BACKEND_BASE_URL}/auth/login`,
        data: {},
        maxLatencyMs: 500,
        expectedStatus: [400, 401, 422],
      });
    });

    test('TC-API-AUT-002: [AUTH-GUARD] POST /auth/sync requires valid credentials', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${BACKEND_BASE_URL}/auth/sync`,
        data: {},
        maxLatencyMs: 500,
        expectedStatus: [401, 403],
      });
    });

    test('TC-API-WA-001: [AUTH-GUARD] GET /api/whatsapp/threads requires authentication', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${WHATSAPP_BASE_URL}/api/whatsapp/threads`,
        maxLatencyMs: 500,
        expectedStatus: [401, 403],
      });
    });

    test('TC-API-WA-002: [AUTH-GUARD] GET /api/whatsapp/unique-users requires authentication', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${WHATSAPP_BASE_URL}/api/whatsapp/unique-users`,
        maxLatencyMs: 500,
        expectedStatus: [401, 403],
      });
    });

    test('TC-API-WA-003: [AUTH-GUARD] GET /api/whatsapp/users requires authentication', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${WHATSAPP_BASE_URL}/api/whatsapp/users`,
        maxLatencyMs: 500,
        expectedStatus: [401, 403],
      });
    });

    test('TC-API-WA-004: [AUTH-GUARD] GET /api/whatsapp/inactive-users requires authentication', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `${WHATSAPP_BASE_URL}/api/whatsapp/inactive-users`,
        maxLatencyMs: 500,
        expectedStatus: [401, 403],
      });
    });

    test('TC-API-WA-005: [AUTH-GUARD] POST /api/whatsapp/send-message rejects unauthorized access or empty body', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'POST',
        url: `${WHATSAPP_BASE_URL}/api/whatsapp/send-message`,
        data: {},
        maxLatencyMs: 500,
        expectedStatus: [400, 401, 403],
      });
    });
  });

  // =========================================================================
  // Layer 2 - MCP Connectivity Suite (9 checks)
  // =========================================================================
  test.describe('Layer 2: Model Context Protocol (MCP) Connectivity', () => {

    const MCP_ENDPOINTS = [
      { id: 'TC-MCP-001', name: 'gdb_mcp', port: 9005 },
      { id: 'TC-MCP-002', name: 'soil_mcp', port: 9008 },
      { id: 'TC-MCP-003', name: 'enam_mcp', port: 9002 },
      { id: 'TC-MCP-004', name: 'agmarknet_mcp', port: 9006 },
      { id: 'TC-MCP-005', name: 'reviewer_mcp', port: 9007 },
      { id: 'TC-MCP-006', name: 'location_mcp', port: 9000 },
      { id: 'TC-MCP-007', name: 'schemes_mcp', port: 9009 },
      { id: 'TC-MCP-008', name: 'chemical_checker_mcp', port: 9101 },
    ];

    for (const mcp of MCP_ENDPOINTS) {
      test(`${mcp.id}: [MCP-CONNECTIVITY] Verify ${mcp.name} endpoint reachability on port ${mcp.port}`, async ({ request }, testInfo) => {
        const { status } = await executeTimedApiTest(request, testInfo, {
          method: 'GET',
          url: `http://${REMOTE_IP}:${mcp.port}/mcp`,
          maxLatencyMs: 1000,
          expectedStatus: [200, 405, 406],
        });
        expect([200, 405, 406]).toContain(status);
      });
    }

    test('TC-MCP-009: [MCP-CONNECTIVITY] Verify weather_mcp health endpoint on port 9017', async ({ request }, testInfo) => {
      await executeTimedApiTest(request, testInfo, {
        method: 'GET',
        url: `http://${REMOTE_IP}:9017/health`,
        maxLatencyMs: 600,
        expectedStatus: 200,
      });
    });
  });
});
