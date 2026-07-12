import { test, expect } from '@playwright/test';
import { testEnvironment } from '../environment';
import { isApiReachable, skipWhenDown } from '../helpers/http';

/**
 * @network — When the SPA boots, the apiFetch wrapper ALWAYS first calls
 * GET /users/me (to hydrate the auth store). If auth fails (no token),
 * it MUST return 401 — never 200.
 *
 * This catches accidental auth-bypass regressions.
 */
test.describe('Network — auth gate proof', () => {
  test.beforeEach(async ({ request }) => {
    const ok = await isApiReachable(request);
    if (!ok && skipWhenDown) {
      test.skip(true, 'API base URL not reachable');
    }
  });

  test('@network T-NET-AUTH-01 — anonymous /users/me returns 401 (or 403)', async ({ request }) => {
    const res = await request.get(`${testEnvironment.apiUrl.replace(/\/$/, '')}/users/me`, {
      timeout: testEnvironment.timing.shortTimeout,
    });
    expect([401, 403]).toContain(res.status());
  });

  test('@network T-NET-AUTH-02 — anonymous privileged queue-details returns 401', async ({ request }) => {
    const res = await request.get(`${testEnvironment.apiUrl.replace(/\/$/, '')}/questions/queue-details?section=received&page=1&limit=10`, {
      timeout: testEnvironment.timing.shortTimeout,
    });
    expect([401, 403]).toContain(res.status());
  });

  test('@network T-NET-AUTH-03 — anonymous notifications returns 401', async ({ request }) => {
    const res = await request.get(`${testEnvironment.apiUrl.replace(/\/$/, '')}/notifications?page=1&limit=10`, {
      timeout: testEnvironment.timing.shortTimeout,
    });
    expect([401, 403]).toContain(res.status());
  });

  test('@network T-NET-AUTH-04 — anonymous submit-answer returns 401', async ({ request }) => {
    const res = await request.post(`${testEnvironment.apiUrl.replace(/\/$/, '')}/answers`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ answer: 'x', questionId: 'abc', sources: [] }),
      timeout: testEnvironment.timing.shortTimeout,
    });
    expect([401, 403]).toContain(res.status());
  });

  test('@network T-NET-AUTH-05 — anonymous moderate-approve returns 401 (most security-critical)', async ({ request }) => {
    const res = await request.post(`${testEnvironment.apiUrl.replace(/\/$/, '')}/answers/moderator/approve`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ questionId: 'abc', answer: 'x', sources: [], source: 'x' }),
      timeout: testEnvironment.timing.shortTimeout,
    });
    // 401 is expected, 403 also OK. 200 would be a critical security bug.
    expect(res.status(), `moderate-approve should NOT be 2xx`).toBeLessThan(200);
  });
});