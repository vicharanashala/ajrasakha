import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const typeArg = args.find((a) => a.startsWith('--type='));
const nameArg = args.find((a) => a.startsWith('--name='));
const endpointArg = args.find((a) => a.startsWith('--endpoint='));

const type = typeArg ? typeArg.split('=')[1] : 'api';
const name = nameArg ? nameArg.split('=')[1] : 'sample-feature';
const endpoint = endpointArg ? endpointArg.split('=')[1] : `/${name}`;

console.log('================================================================');
console.log('       AJRASAKHA AUTOMATED TEST CASE SCAFFOLDING GENERATOR      ');
console.log('================================================================\n');

if (type === 'api') {
  const targetDir = path.join(rootDir, 'apis/testing/e2e-api');
  const fileName = `${name}.spec.ts`;
  const filePath = path.join(targetDir, fileName);

  const templateContent = `import { test, expect } from '@playwright/test';
import { executeTimedApiTest } from './test-helpers.js';

const SERVICE_URL = process.env.${name.toUpperCase().replace(/-/g, '_')}_URL || 'http://localhost:8005';

test.describe('Feature: ${name} - API Contracts & Boundary QA', () => {

  test('TC-${name.toUpperCase()}-001: [HEALTH-CHECK] GET /health verifies service is operational', async ({ request }, testInfo) => {
    const { status, body } = await executeTimedApiTest(request, testInfo, {
      method: 'GET',
      url: \`\${SERVICE_URL}/health\`,
      maxLatencyMs: 500,
      expectedStatus: 200,
    });
    expect(status).toBe(200);
  });

  test('TC-${name.toUpperCase()}-002: [CONTRACT-SCHEMA] POST ${endpoint} processes valid agricultural payload', async ({ request }, testInfo) => {
    const { status, body } = await executeTimedApiTest(request, testInfo, {
      method: 'POST',
      url: \`\${SERVICE_URL}${endpoint}\`,
      data: { query: 'Sample agricultural inquiry for ${name}' },
      maxLatencyMs: 1000,
      expectedStatus: 200,
    });
    expect(status).toBe(200);
  });

  test('TC-${name.toUpperCase()}-003: [INPUT-VALIDATION] POST ${endpoint} rejects empty payload with 400', async ({ request }, testInfo) => {
    const { status } = await executeTimedApiTest(request, testInfo, {
      method: 'POST',
      url: \`\${SERVICE_URL}${endpoint}\`,
      data: { query: '' },
      maxLatencyMs: 500,
      expectedStatus: 400,
    });
    expect(status).toBe(400);
  });

  test('TC-${name.toUpperCase()}-004: [SECURITY-FUZZ] POST ${endpoint} safely handles SQLi and XSS injection', async ({ request }, testInfo) => {
    const { status } = await executeTimedApiTest(request, testInfo, {
      method: 'POST',
      url: \`\${SERVICE_URL}${endpoint}\`,
      data: { query: "paddy'; DROP TABLE crops; <script>alert('XSS')</script>" },
      maxLatencyMs: 800,
      expectedStatus: 200,
    });
    expect(status).not.toBe(500);
  });
});
`;

  fs.writeFileSync(filePath, templateContent, 'utf8');
  console.log(`\x1b[32m✔ Scaffolded new API test file:\x1b[0m ${filePath}`);
  console.log(`\nTo run your new test:\n  \x1b[33mnpx playwright test apis/testing/e2e-api/${fileName} --project=api\x1b[0m\n`);

} else if (type === 'backend') {
  const targetDir = path.join(rootDir, `backend/src/modules/${name}/tests`);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const fileName = `${name}Service.test.ts`;
  const filePath = path.join(targetDir, fileName);

  const templateContent = `import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('${name}Service Unit & Integration Tests', () => {
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
      save: vi.fn(),
    };
  });

  it('should process happy path correctly', async () => {
    mockRepo.findById.mockResolvedValue({ id: '1', status: 'ACTIVE' });
    expect(true).toBe(true);
  });

  it('should validate boundary conditions and reject invalid states', async () => {
    expect(true).toBe(true);
  });
});
`;

  fs.writeFileSync(filePath, templateContent, 'utf8');
  console.log(`\x1b[32m✔ Scaffolded new Backend test file:\x1b[0m ${filePath}`);
  console.log(`\nTo run your new test:\n  \x1b[33mnpm --prefix backend test\x1b[0m\n`);

} else {
  console.log('Supported types: --type=api, --type=backend');
  console.log('Example: npm run test:new -- --type=api --name=disease-detector --endpoint=/detect');
}
