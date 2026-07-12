import { test, expect } from '@playwright/test';
import { statusFor, matchesExpect, isApiReachable, skipWhenDown, type Endpoint } from '../helpers/http';

/**
 * @contract — /audit-trails/* — backend status-code contract.
 */
const ENDPOINTS: Endpoint[] = [
  { path: '/audit-trails?page=1&limit=10', method: 'GET', expect: 401, label: 'list audit trails' },
  { path: '/audit-trails/moderator', method: 'GET', expect: 401, label: 'moderator view' },
  { path: '/audit-trails/question/abc123', method: 'GET', expect: 401, label: 'question-scoped view' },
  { path: '/audit-trails/shift-based-audit-action-counts?startDate=x&shift=x&from=x&to=x', method: 'GET', expect: 401, label: 'shift counts' },
];

test.describe('Contract — /audit-trails/* status codes', () => {
  let reachable = false;

  test.beforeEach(async ({ request }) => {
    reachable = await isApiReachable(request);
    if (!reachable && skipWhenDown) {
      test.skip(true, 'API base URL not reachable');
    }
  });

  for (const ep of ENDPOINTS) {
    test(`@contract ${ep.method} ${ep.path} — expect ${ep.expect} (${ep.label ?? ''})`, async ({ request }) => {
      const code = await statusFor(request, ep);
      expect(matchesExpect(code, ep.expect as number | number[]), `got ${code}`).toBeTruthy();
    });
  }
});