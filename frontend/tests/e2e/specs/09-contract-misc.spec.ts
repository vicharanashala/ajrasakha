import { test, expect } from '@playwright/test';
import { statusFor, matchesExpect, isApiReachable, skipWhenDown, type Endpoint } from '../helpers/http';

/**
 * @contract — misc controllers: /comments, /crops, /context, /requests,
 * /chemicals, /chatbot, /whatsapp, /plivo, /lgd, /acc-agent, /auth.
 *
 * Each entry was traced from the actual frontend service file.
 */
const ENDPOINTS: Endpoint[] = [
  // /comments
  { path: '/comments/abc', method: 'GET', expect: 401, label: 'comments by id' },
  // /crops — likely public, accept 200 OR 401 (catch either)
  { path: '/crops', method: 'GET', expect: [200, 401], label: 'list crops' },
  // /context
  { path: '/context/abc', method: 'GET', expect: 401, label: 'context by id' },
  // /requests
  { path: '/requests?page=1&limit=10', method: 'GET', expect: 401, label: 'list requests' },
  // /chemicals
  { path: '/chemicals?page=1&limit=10', method: 'GET', expect: 401, label: 'list chemicals' },
  // /chatbot
  { path: '/chatbot/users-metrices', method: 'GET', expect: 401, label: 'user metrics' },
  // /whatsapp — likely admin-only
  { path: '/whatsapp/users', method: 'GET', expect: 401, label: 'whatsapp users' },
  // /plivo — call centre
  { path: '/plivo', method: 'GET', expect: [404, 401, 405], label: 'plivo root' },
  // /acc-agent
  { path: '/acc-agent/thread', method: 'POST', body: {}, expect: 401, label: 'acc agent thread' },
  // /auth — public
  { path: '/auth/signup', method: 'POST', body: {}, expect: [400, 422, 201], label: 'signup empty body (validation OR created)' },
  { path: '/auth/login', method: 'POST', body: {}, expect: [400, 422, 401], label: 'login empty body (validation OR unauthorized)' },
];

test.describe('Contract — misc controller status codes', () => {
  let reachable = false;

  test.beforeEach(async ({ request }) => {
    reachable = await isApiReachable(request);
    if (!reachable && skipWhenDown) {
      test.skip(true, 'API base URL not reachable');
    }
  });

  for (const ep of ENDPOINTS) {
    test(`@contract ${ep.method} ${ep.path} — expect ${JSON.stringify(ep.expect)} (${ep.label ?? ''})`, async ({ request }) => {
      const code = await statusFor(request, ep);
      expect(matchesExpect(code, ep.expect as number | number[]), `got ${code}`).toBeTruthy();
    });
  }
});