import { test, expect } from '@playwright/test';
import { statusFor, matchesExpect, isApiReachable, skipWhenDown, type Endpoint } from '../helpers/http';

/**
 * @contract — /questions/* — backend status-code contract.
 *
 * With NO auth token, every privileged endpoint MUST return 401 (or 400/422
 * for malformed input). If we ever see 200 here, it means an auth gate was
 * accidentally removed — a serious regression.
 *
 * Every endpoint below was traced from the actual frontend service
 * (frontend/src/hooks/services/questionService.ts) AND the controller
 * (backend/src/modules/question/controllers/QuestionController.ts).
 */

const requireAuth = 401 as const; // default expectation

const ENDPOINTS: Endpoint[] = [
  // ---- read ----
  { path: '/questions', method: 'GET', expect: requireAuth, label: 'list all' },
  { path: '/questions/abc123', method: 'GET', expect: requireAuth, label: 'by id' },
  { path: '/questions/abc123/full', method: 'GET', expect: requireAuth, label: 'full doc' },
  { path: '/questions/abc123/chatbot', method: 'GET', expect: requireAuth, label: 'chatbot convo' },
  { path: '/questions/abc123/submission-exists', method: 'GET', expect: requireAuth, label: 'submission-exists' },
  { path: '/questions/abc123/generate-answer', method: 'GET', expect: requireAuth, label: 'generate AI answer' },
  { path: '/questions/allocated/page?questionId=abc123', method: 'GET', expect: requireAuth, label: 'allocated page lookup' },
  { path: '/questions/background-status', method: 'GET', expect: requireAuth, label: 'background status' },
  { path: '/questions/reallocation-preview?type=expert', method: 'GET', expect: requireAuth, label: 'reallocation preview' },
  // ---- list endpoints that take a body ----
  { path: '/questions/detailed', method: 'POST', body: {}, expect: requireAuth, label: 'detailed list' },
  { path: '/questions/allocated', method: 'POST', body: {}, expect: requireAuth, label: 'allocated list' },
  { path: '/questions/status-summary', method: 'POST', body: {}, expect: requireAuth, label: 'status summary' },
  { path: '/questions/generate', method: 'POST', body: { query: 'x' }, expect: requireAuth, label: 'generate from query' },
  { path: '/questions/generate-by-call-context', method: 'POST', body: { query: 'x' }, expect: requireAuth, label: 'generate by call context' },
  { path: '/questions/call-summary', method: 'POST', body: { query: 'x' }, expect: requireAuth, label: 'call summary' },
  { path: '/questions/check-status', method: 'POST', body: {}, expect: requireAuth, label: 'check status' },
  // ---- writes ----
  { path: '/questions', method: 'POST', body: { question: 'x' }, expect: requireAuth, label: 'create question' },
  { path: '/questions/abc123', method: 'PUT', body: {}, expect: requireAuth, label: 'update question' },
  { path: '/questions/abc123', method: 'PATCH', body: {}, expect: requireAuth, label: 'patch question' },
  { path: '/questions/abc123', method: 'DELETE', expect: requireAuth, label: 'delete question' },
  { path: '/questions/abc123/allocation', method: 'DELETE', body: { index: 0 }, expect: requireAuth, label: 'remove allocation' },
  { path: '/questions/abc123/toggle-auto-allocate', method: 'PATCH', expect: requireAuth, label: 'toggle auto-allocate' },
  { path: '/questions/abc123/allocate-experts', method: 'POST', body: { experts: [] }, expect: requireAuth, label: 'allocate experts' },
  { path: '/questions/bulk-pae-allocate', method: 'POST', body: { questionIds: [], paeExpertId: 'x' }, expect: requireAuth, label: 'bulk pae allocate' },
  { path: '/questions/abc123/replace-queue-expert', method: 'POST', body: { levelIndex: 0, newExpertId: 'x' }, expect: requireAuth, label: 'replace queue expert' },
  { path: '/questions/abc123/moderator', method: 'PATCH', body: { moderatorId: 'x' }, expect: requireAuth, label: 'change moderator' },
  { path: '/questions/abc123/moderator', method: 'DELETE', expect: requireAuth, label: 'remove moderator' },
  { path: '/questions/abc123/hold', method: 'PATCH', body: { action: 'hold' }, expect: requireAuth, label: 'hold question' },
  { path: '/questions/abc123/mark-opened', method: 'POST', expect: requireAuth, label: 'mark opened' },
  { path: '/questions/abc123/check-duplicate', method: 'POST', expect: requireAuth, label: 'manual duplicate check' },
  { path: '/questions/abc123/approve-initial-answer', method: 'POST', body: { answer: 'x' }, expect: requireAuth, label: 'approve AI initial answer' },
  { path: '/questions/reAllocateLessWorkload', method: 'POST', expect: requireAuth, label: 'reallocate less workload' },
  { path: '/questions/reAllocateSelectedQuestions', method: 'POST', body: { questionIds: [] }, expect: requireAuth, label: 'reallocate selected' },
  { path: '/questions/reallocate-manual', method: 'POST', body: { assignments: [] }, expect: requireAuth, label: 'manual reallocate' },
  { path: '/questions/bulk', method: 'DELETE', body: { questionIds: [] }, expect: requireAuth, label: 'bulk delete' },
  { path: '/questions/data/out-reach/date', method: 'POST', body: { startDate: 'x', endDate: 'y', emails: [] }, expect: requireAuth, label: 'outreach report' },
];

test.describe('Contract — /questions/* status codes', () => {
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
      const expected = ep.expect ?? requireAuth;
      const ok = matchesExpect(code, expected as number | number[]);
      expect(ok, `got ${code}, expected ${JSON.stringify(expected)}`).toBeTruthy();
    });
  }
});