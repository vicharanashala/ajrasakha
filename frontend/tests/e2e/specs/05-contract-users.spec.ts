import { test, expect } from '@playwright/test';
import { statusFor, matchesExpect, isApiReachable, skipWhenDown, type Endpoint } from '../helpers/http';

/**
 * @contract — /users/* — backend status-code contract.
 *
 * Sourced from frontend/src/hooks/services/userService.ts and
 * backend/src/modules/user/controllers/UserController.ts.
 */
const ENDPOINTS: Endpoint[] = [
  // ---- read ----
  { path: '/users/me', method: 'GET', expect: 401, label: 'current user (must be auth-gated)' },
  { path: '/users/all', method: 'GET', expect: 401, label: 'all users names' },
  { path: '/users/list?page=1&limit=10', method: 'GET', expect: 401, label: 'paged list' },
  { path: '/users/moderators', method: 'GET', expect: 401, label: 'moderators' },
  { path: '/users/stf-moderators', method: 'GET', expect: 401, label: 'stf moderators' },
  { path: '/users/review-level', method: 'GET', expect: 401, label: 'review level counts' },
  { path: '/users/call-agents', method: 'GET', expect: 401, label: 'call agents' },
  { path: '/users/abc/details', method: 'GET', expect: 401, label: 'details by email' },
  // ---- writes ----
  { path: '/users', method: 'POST', body: {}, expect: 401, label: 'create user' },
  { path: '/users', method: 'PUT', body: {}, expect: 401, label: 'update user' },
  { path: '/users/expert', method: 'POST', body: {}, expect: 401, label: 'create expert' },
  { path: '/users/stf', method: 'POST', body: {}, expect: 401, label: 'create stf' },
  { path: '/users/status', method: 'PATCH', body: {}, expect: 401, label: 'update status' },
  { path: '/users/activity', method: 'POST', body: {}, expect: 401, label: 'log activity' },
  { path: '/users/abc/role', method: 'PATCH', body: { role: 'x' }, expect: 401, label: 'change role' },
  { path: '/users/abc/verify', method: 'PATCH', expect: 401, label: 'verify user' },
  { path: '/users/set-call-agents', method: 'POST', body: {}, expect: 401, label: 'set call agents' },
  { path: '/users/call-agents/abc/toggle-active', method: 'POST', expect: 401, label: 'toggle call agent' },
  { path: '/users/abc/remove-allocations', method: 'POST', expect: 401, label: 'remove allocations' },
  { path: '/users/verification-request', method: 'POST', body: {}, expect: 401, label: 'verification request' },
];

test.describe('Contract — /users/* status codes', () => {
  let reachable = false;

  test.beforeEach(async ({ request }) => {
    reachable = await isApiReachable(request);
    if (!reachable && skipWhenDown) {
      test.skip(true, 'API base URL not reachable — set E2E_API_URL or skip with E2E_SKIP_IF_DOWN=false');
    }
  });

  for (const ep of ENDPOINTS) {
    test(`@contract ${ep.method} ${ep.path} — expect ${ep.expect} (${ep.label ?? ''})`, async ({ request }) => {
      const code = await statusFor(request, ep);
      expect(matchesExpect(code, ep.expect as number | number[]), `got ${code}`).toBeTruthy();
    });
  }
});