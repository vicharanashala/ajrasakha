import { expect, APIRequestContext, TestInfo } from '@playwright/test';

export interface TimedRequestOptions {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT';
  url: string;
  data?: any;
  headers?: Record<string, string>;
  timeout?: number;
  maxLatencyMs?: number;
  expectedStatus?: number | number[];
}

export interface TimedResponse {
  res: any;
  status: number;
  body: any;
  latencyMs: number;
  curlCmd: string;
  reproduceSteps: string;
}

/**
 * Executes an HTTP API request while testing response latency against an SLA threshold.
 * Captures latency, SLA compliance, and full reproduction steps for test reporting and defect triage.
 */
export async function executeTimedApiTest(
  request: APIRequestContext,
  testInfo: TestInfo,
  options: TimedRequestOptions
): Promise<TimedResponse> {
  const maxLatencyMs = options.maxLatencyMs ?? 1000;
  const timeout = options.timeout ?? 5000;

  // Build clean, copy-pasteable curl reproduction command
  let curlCmd = `curl -X ${options.method} "${options.url}"`;
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      curlCmd += ` -H "${k}: ${v}"`;
    }
  } else if (options.data !== undefined) {
    curlCmd += ` -H "Content-Type: application/json"`;
  }

  if (options.data !== undefined) {
    const payload = typeof options.data === 'string' ? options.data : JSON.stringify(options.data);
    curlCmd += ` -d '${payload.replace(/'/g, "'\\''")}'`;
  }

  const payloadDisplay = options.data !== undefined
    ? (typeof options.data === 'string' ? options.data : JSON.stringify(options.data))
    : '(None)';

  const reproduceSteps = [
    `1. Ensure target service is operational at ${options.url}`,
    `2. Send HTTP ${options.method} request to: ${options.url}`,
    `3. Request Headers: ${JSON.stringify(options.headers || { 'Content-Type': 'application/json' })}`,
    `4. Request Payload: ${payloadDisplay}`,
    `5. Expected SLA Latency: < ${maxLatencyMs}ms`,
    `6. CLI Reproduction Command:`,
    `   ${curlCmd}`,
  ].join('\n');

  // Record initial test metadata
  testInfo.annotations.push({ type: 'target_url', description: `${options.method} ${options.url}` });
  testInfo.annotations.push({ type: 'sla_target', description: `< ${maxLatencyMs}ms` });
  testInfo.annotations.push({ type: 'reproduce_cmd', description: curlCmd });
  testInfo.annotations.push({ type: 'reproduce_steps', description: reproduceSteps });

  const start = performance.now();
  let res: any;
  try {
    if (options.method === 'GET') {
      res = await request.get(options.url, { headers: options.headers, timeout });
    } else if (options.method === 'POST') {
      res = await request.post(options.url, { data: options.data, headers: options.headers, timeout });
    } else if (options.method === 'DELETE') {
      res = await request.delete(options.url, { headers: options.headers, timeout });
    } else if (options.method === 'PUT') {
      res = await request.put(options.url, { data: options.data, headers: options.headers, timeout });
    } else {
      throw new Error(`Unsupported HTTP method: ${options.method}`);
    }
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - start);
    testInfo.annotations.push({ type: 'latency', description: `${elapsed}ms` });
    testInfo.annotations.push({ type: 'sla_status', description: 'FAILED' });
    testInfo.attach('bug-reproduction-details', {
      contentType: 'text/markdown',
      body: Buffer.from(
        `### Bug Encountered during ${options.method} ${options.url}\n` +
        `**Error:** ${err.message}\n` +
        `**Observed Latency before Failure:** ${elapsed}ms\n\n` +
        `#### Steps to Reproduce:\n${reproduceSteps}\n`
      ),
    });
    throw err;
  }

  const latencyMs = Math.round(performance.now() - start);
  const status = res.status();
  let body: any = null;

  const contentType = res.headers()['content-type'] || '';
  if (contentType.includes('application/json')) {
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
  } else {
    body = await res.text();
  }

  testInfo.annotations.push({ type: 'latency', description: `${latencyMs}ms` });
  const meetsSla = latencyMs <= maxLatencyMs;
  testInfo.annotations.push({ type: 'sla_status', description: meetsSla ? 'MET' : 'BREACHED' });

  // Latency test assertion
  expect(
    latencyMs,
    `Latency test failed: Response latency of ${latencyMs}ms exceeded SLA threshold of ${maxLatencyMs}ms for ${options.method} ${options.url}.\nReproduction:\n${curlCmd}`
  ).toBeLessThanOrEqual(maxLatencyMs);

  // Status code assertion if provided
  if (options.expectedStatus !== undefined) {
    if (Array.isArray(options.expectedStatus)) {
      expect(
        options.expectedStatus,
        `Expected HTTP status in [${options.expectedStatus.join(', ')}] but received ${status} for ${options.method} ${options.url}.\nReproduction:\n${curlCmd}`
      ).toContain(status);
    } else {
      expect(
        status,
        `Expected HTTP status ${options.expectedStatus} but received ${status} for ${options.method} ${options.url}.\nReproduction:\n${curlCmd}`
      ).toBe(options.expectedStatus);
    }
  }

  return { res, status, body, latencyMs, curlCmd, reproduceSteps };
}
