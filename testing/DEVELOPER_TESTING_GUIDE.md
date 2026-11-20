# Developer Guide: Writing Tests for New Features

This guide explains how developers should add test cases for new features, microservices, or backend modules in the Ajrasakha monorepo.

---

## 1. How It Works (Automatic Discovery)

You **never** need to modify `.github/workflows/` when adding new tests. The test runners automatically discover your new files based on naming conventions:

| What You Built | Where to Put the Test | Test Runner | Automatic Match Rule |
| :--- | :--- | :--- | :--- |
| **New Microservice in `apis/`** | `apis/testing/e2e-api/[feature].spec.ts` | Playwright | Automatically matches `e2e-api/**/*.spec.ts` |
| **New Swagger UI Page** | `apis/testing/e2e-ui/[feature]-ui.spec.ts` | Playwright UI | Automatically matches `e2e-ui/**/*.spec.ts` |
| **New LLM Prompt or Agent Eval** | `apis/testing/promptfoo/promptfooconfig.yaml` | Promptfoo | Appended under the `tests:` array |
| **New Reviewer Backend Service** | `backend/src/modules/[module]/tests/*.test.ts` | Vitest | Automatically matches `**/*.test.ts` |
| **New Python LangGraph Agent** | `ai/ajrasakha/agents/tests/test_[name].py` | Pytest | Automatically matches `test_*.py` |
| **New FastMCP Data Server** | `mcp/mcp_containers/[name]/` | FastMCP Lint | Automatically discovered in container scan |

---

## 2. Instant Test Scaffolding via CLI

To instantly generate boilerplate test cases with built-in latency benchmarks and boundary checks, run:

### For a New Microservice API Endpoint:
```bash
npm run test:new -- --type=api --name=disease-detector --endpoint=/detect-disease
```
This automatically scaffolds:
`apis/testing/e2e-api/disease-detector.spec.ts` with:
* `[HEALTH-CHECK]` endpoint validation.
* `[CONTRACT-SCHEMA]` payload assertion.
* `[INPUT-VALIDATION]` empty/invalid input 400 check.
* `[SECURITY-FUZZ]` SQLi and XSS injection defense check.

### For a New Backend Service:
```bash
npm run test:new -- --type=backend --name=pesticideRecommender
```
This scaffolds:
`backend/src/modules/pesticideRecommender/tests/pesticideRecommenderService.test.ts`

---

## 3. The 4 Essential Test Types Every New Feature Needs

When authoring test cases, ensure each new endpoint or service covers these four dimensions:

### 1. Operational Health Check (`TC-[NAME]-001`)
Verifies the microservice container is up and responsive within 500ms:
```typescript
test('TC-FEATURE-001: [HEALTH-CHECK] GET /health verifies operational status', async ({ request }, testInfo) => {
  const { status, body } = await executeTimedApiTest(request, testInfo, {
    method: 'GET',
    url: `${SERVICE_URL}/health`,
    maxLatencyMs: 500,
    expectedStatus: 200,
  });
  expect(status).toBe(200);
});
```

### 2. Contract & Schema Validation (`TC-[NAME]-002`)
Verifies the happy path returns expected fields and conforms to latency SLAs:
```typescript
test('TC-FEATURE-002: [CONTRACT-SCHEMA] POST /endpoint processes query', async ({ request }, testInfo) => {
  const { status, body } = await executeTimedApiTest(request, testInfo, {
    method: 'POST',
    url: `${SERVICE_URL}/endpoint`,
    data: { query: 'Sample input' },
    maxLatencyMs: 1000,
    expectedStatus: 200,
  });
  expect(status).toBe(200);
  expect(body).toHaveProperty('success', true);
});
```

### 3. Boundary & Input Validation (`TC-[NAME]-003`)
Verifies the service strictly rejects empty strings, negative values, or malformed data with HTTP 400 or 422:
```typescript
test('TC-FEATURE-003: [INPUT-VALIDATION] POST /endpoint rejects empty string with 400', async ({ request }, testInfo) => {
  const { status } = await executeTimedApiTest(request, testInfo, {
    method: 'POST',
    url: `${SERVICE_URL}/endpoint`,
    data: { query: '' },
    maxLatencyMs: 500,
    expectedStatus: 400,
  });
  expect(status).toBe(400);
});
```

### 4. Adversarial & Security Fuzzing (`TC-[NAME]-004`)
Attempts SQL injection, script injection, and obfuscation to verify the service never throws an unhandled 500 Server Error:
```typescript
test('TC-FEATURE-004: [SECURITY-FUZZ] POST /endpoint handles injection safely', async ({ request }, testInfo) => {
  const { status } = await executeTimedApiTest(request, testInfo, {
    method: 'POST',
    url: `${SERVICE_URL}/endpoint`,
    data: { query: "paddy'; DROP TABLE crops; <script>alert(1)</script>" },
    maxLatencyMs: 800,
    expectedStatus: 200,
  });
  expect(status).not.toBe(500);
});
```

---

## 4. How Your New Tests Appear in PR Reports

Once committed and pushed:
1. GitHub Actions detects changes in `apis/**`, `backend/**`, etc.
2. It executes your newly added tests alongside the existing baseline.
3. The automated QA reporter parses your new test IDs, extracts measured latencies, and automatically appends them to the **Executive Quality Gate Scorecard** in the PR comment thread.
4. If your test fails or breaches latency thresholds, the bot automatically formats steps to reproduce and generates a copy-paste `curl` command.
