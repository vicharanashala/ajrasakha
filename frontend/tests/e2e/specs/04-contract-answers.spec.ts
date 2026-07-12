import { test, expect } from '@playwright/test';
import { statusFor, matchesExpect, isApiReachable, skipWhenDown, type Endpoint } from '../helpers/http';

/**
 * @contract — /answers/* and /reroute/* — backend status-code contract.
 *
 * Endpoint list sourced from:
 *   - frontend/src/hooks/services/answerService.ts
 *   - frontend/src/hooks/services/questionService.ts (reroute URLs)
 *   - backend/src/modules/answer/controllers/AnswerController.ts
 *   - backend/src/modules/question/controllers/ReRouteController.ts
 */

const ENDPOINTS: Endpoint[] = [
  // ---- /answers ----
  { path: '/answers', method: 'POST', body: { answer: 'x', questionId: 'abc', sources: [] }, expect: 401, label: 'submit answer' },
  { path: '/answers', method: 'PUT', body: {}, expect: 401, label: 'update answer' },
  { path: '/answers/review', method: 'POST', body: { questionId: 'abc' }, expect: 401, label: 'review (accept/reject/modify)' },
  { path: '/answers/moderator/approve', method: 'POST', body: { questionId: 'abc', answer: 'x', sources: [], source: 'x' }, expect: 401, label: 'moderator approve (closure → GDB)' },
  { path: '/answers/submissions?page=1&limit=10', method: 'GET', expect: 401, label: 'list submissions' },
  { path: '/answers/finalizedAnswers?userId=x&date=x&status=x', method: 'GET', expect: 401, label: 'finalized answers' },
  { path: '/answers/fetch-ai-answer', method: 'POST', body: { query: 'x', crop: 'x', state: 'x' }, expect: 401, label: 'fetch AI answer' },

  // ---- /reroute (peer re-route flow) ----
  { path: '/reroute/allocated', method: 'POST', body: {}, expect: 401, label: 'reroute allocated list' },
  { path: '/reroute/abc123', method: 'GET', expect: 401, label: 'reroute question by id' },
  { path: '/reroute/abc/abc123', method: 'PATCH', body: {}, expect: 401, label: 'reject reroute request' },
  { path: '/reroute/abc123/history', method: 'GET', expect: 401, label: 'reroute history' },
  { path: '/reroute/abc123/allocate-reroute-experts', method: 'POST', body: {}, expect: 401, label: 'allocate reroute experts' },
];

test.describe('Contract — /answers/* and /reroute/* status codes', () => {
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