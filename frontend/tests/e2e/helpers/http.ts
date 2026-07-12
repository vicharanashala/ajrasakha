import type { APIRequestContext, Page } from '@playwright/test';
import { testEnvironment } from '../environment';
import { Logger } from './logger';

/**
 * Single shared logger. Override via E2E_LOG_LEVEL env var
 * (silent | error | warn | info | debug).
 */
const log = new Logger('http');

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type Endpoint = {
  /** Path under the API base, e.g. "/questions" or "/questions/:id/full" */
  path: string;
  method: Method;
  /** JSON body for POST/PUT/PATCH. */
  body?: unknown;
  /** Query string appended to path. Defaults to none. */
  query?: Record<string, string | number | undefined>;
  /** Expected status code (or array). Default: 401. */
  expect?: number | number[] | ((c: number) => boolean);
  /** Description used in the test name. */
  label?: string;
};

export type StatusResult = {
  code: number;
  ok: boolean;
  expected: number | number[] | ((c: number) => boolean);
  error?: string;
};

/** Build full URL safely — never throws on relative paths. */
export const apiBaseUrl = (): string => testEnvironment.apiUrl.replace(/\/+$/, '');

export const apiUrl = (path: string, query?: Record<string, string | number | undefined>): string => {
  const base = apiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!query) return `${base}${cleanPath}`;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.append(k, String(v));
  }
  const qs = params.toString();
  return `${base}${cleanPath}${qs ? `?${qs}` : ''}`;
};

/**
 * Hit an endpoint with NO authentication token. Returns the status code.
 * Never throws on non-2xx — returns the actual code (or 0 for network error)
 * so callers can assert.
 *
 * Safe to call with ANY endpoint — the worst case is a 0 return value.
 */
export async function statusFor(
  request: APIRequestContext,
  endpoint: Endpoint,
): Promise<number> {
  const url = apiUrl(endpoint.path, endpoint.query);
  const start = Date.now();
  try {
    const res = await request.fetch(url, {
      method: endpoint.method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      data: endpoint.body === undefined ? undefined : JSON.stringify(endpoint.body),
      timeout: testEnvironment.timing.shortTimeout,
      // Never follow redirects on 3xx — we want to see them.
      maxRedirects: 0,
    });
    const ms = Date.now() - start;
    log.debug(`${endpoint.method} ${url} → ${res.status()} (${ms}ms)`);
    return res.status();
  } catch (err) {
    const ms = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    log.debug(`${endpoint.method} ${url} → NETWORK ERROR after ${ms}ms: ${message}`);
    return 0;
  }
}

/**
 * Returns the detailed result so callers can produce richer assertion
 * failure messages.
 */
export async function checkStatus(
  request: APIRequestContext,
  endpoint: Endpoint,
): Promise<StatusResult> {
  const expected = endpoint.expect ?? 401;
  const code = await statusFor(request, endpoint);
  return {
    code,
    expected,
    ok: matchesExpect(code, expected),
    error: code === 0 ? 'Network error or timeout — backend unreachable' : undefined,
  };
}

/**
 * Probes the API base URL. Returns true if the server answers at all
 * (even with 401), false on network error / timeout.
 */
export async function isApiReachable(
  request: APIRequestContext,
  path = '/',
): Promise<boolean> {
  try {
    const res = await request.fetch(apiUrl(path), {
      method: 'GET',
      timeout: testEnvironment.timing.shortTimeout,
    });
    return res.status() > 0;
  } catch (err) {
    log.debug(`isApiReachable(${path}) → false: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Returns true if the FE base URL answers at all.
 * Returns false on any non-2xx, network error, or timeout.
 */
export async function isFrontendReachable(page: Page): Promise<boolean> {
  try {
    const res = await page.goto(testEnvironment.baseUrl, {
      timeout: testEnvironment.timing.shortTimeout,
      waitUntil: 'domcontentloaded',
    });
    return res !== null && res.status() < 500;
  } catch (err) {
    log.debug(`isFrontendReachable → false: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Convenience matcher: returns true if `code` is in the expected list.
 */
export function matchesExpect(
  code: number,
  expected: number | number[] | ((c: number) => boolean),
): boolean {
  if (typeof expected === 'function') {
    try {
      return expected(code);
    } catch {
      return false;
    }
  }
  if (Array.isArray(expected)) return expected.includes(code);
  return code === expected;
}

/**
 * Human-readable description of an expected status.
 */
export function describeExpect(expected: number | number[] | ((c: number) => boolean)): string {
  if (typeof expected === 'function') return 'matches predicate';
  if (Array.isArray(expected)) return `[${expected.join(', ')}]`;
  return String(expected);
}

/**
 * Whether the suite should skip the entire spec when the target is down.
 * Controlled by E2E_SKIP_IF_DOWN env var (default true).
 */
export const skipWhenDown: boolean = testEnvironment.skipIfDown;

/**
 * Asserts an endpoint result, with a useful failure message.
 */
export function assertStatus(result: StatusResult, context: string): void {
  if (result.ok) return;
  const expectStr = describeExpect(result.expected);
  const reason = result.error ? ` (${result.error})` : '';
  throw new Error(
    `${context}: expected ${expectStr} but got ${result.code}${reason}`,
  );
}
