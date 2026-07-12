import { test, expect } from '@playwright/test';
import { statusFor, matchesExpect, isApiReachable, skipWhenDown, type Endpoint } from '../helpers/http';

/**
 * @contract — /performance/* — backend status-code contract.
 *
 * Sourced from frontend/src/hooks/services/performanceService.ts and
 * backend/src/modules/performance/controllers/PerformanceController.ts.
 */
const ENDPOINTS: Endpoint[] = [
  { path: '/performance/dashboard', method: 'GET', expect: 401, label: 'dashboard analytics' },
  { path: '/performance/overview', method: 'GET', expect: 401, label: 'overview (roles + approval rate)' },
  { path: '/performance/golden-dataset?viewType=year', method: 'GET', expect: 401, label: 'golden dataset' },
  { path: '/performance/contribution-trend?timeRange=week', method: 'GET', expect: 401, label: 'contribution trend' },
  { path: '/performance/status-overview', method: 'GET', expect: 401, label: 'status overview' },
  { path: '/performance/expert-performance', method: 'GET', expect: 401, label: 'expert performance' },
  { path: '/performance/workload', method: 'GET', expect: 401, label: 'workload counts' },
  { path: '/performance/questions-analytics', method: 'POST', body: { type: 'question' }, expect: 401, label: 'questions analytics' },
  { path: '/performance/check-in', method: 'POST', expect: 401, label: 'moderator check-in' },
  { path: '/performance/cron-snapshot/send-report', method: 'POST', expect: 401, label: 'cron snapshot' },
  { path: '/performance/heatMapofReviewers', method: 'GET', expect: 401, label: 'heatmap' },
  { path: '/performance/level-report?startDate=x&endDate=y', method: 'GET', expect: 401, label: 'level report (download)' },
  { path: '/performance/shift-based-metrics', method: 'GET', expect: 401, label: 'shift metrics' },
  { path: '/performance/shift-based-trends', method: 'GET', expect: 401, label: 'shift trends' },
  { path: '/performance/shift-based-status-distribution', method: 'GET', expect: 401, label: 'shift status distribution' },
  { path: '/performance/shift-based-level-distribution', method: 'GET', expect: 401, label: 'shift level distribution' },
  { path: '/performance/shift-based-top-experts', method: 'GET', expect: 401, label: 'shift top experts' },
  { path: '/performance/shift-based-top-approving-experts', method: 'GET', expect: 401, label: 'shift top approving experts' },
];

test.describe('Contract — /performance/* status codes', () => {
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