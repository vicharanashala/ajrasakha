import { test, expect } from '@playwright/test';
import { statusFor, matchesExpect, isApiReachable, skipWhenDown, type Endpoint } from '../helpers/http';

/**
 * @contract — /notifications/* — backend status-code contract.
 */
const ENDPOINTS: Endpoint[] = [
  { path: '/notifications?page=1&limit=10', method: 'GET', expect: 401, label: 'list notifications' },
  { path: '/notifications/abc', method: 'PATCH', expect: 401, label: 'mark one as read' },
  { path: '/notifications', method: 'PATCH', expect: 401, label: 'mark all as read' },
  { path: '/notifications/abc', method: 'DELETE', expect: 401, label: 'delete one' },
  { path: '/notifications/users/send', method: 'POST', body: {}, expect: 401, label: 'send (admin)' },
  { path: '/notifications/subscriptions', method: 'POST', body: {}, expect: 401, label: 'push subscription' },
];

test.describe('Contract — /notifications/* status codes', () => {
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