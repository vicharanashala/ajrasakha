import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { UserService } from '#root/modules/user/services/UserService.js';
import { appConfig } from '#root/config/app.js';

/**
 * Daily Activity Report Cron Jobs (Shift-Based):
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │  MORNING SHIFT REPORT - 2:55 PM IST (14:55 UTC)                            │
 * │  • Sends to users who checked-in (sendDailyReport === true)                │
 * │  • Report covers: TODAY 6:00 AM → 2:55 PM IST                             │
 * │  • Users check-in at 6 AM, check-out at 3 PM                              │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │  EVENING SHIFT REPORT - 12:00 AM IST (18:30 UTC)                           │
 * │  • Sends to users who checked-in (sendDailyReport === true)                │
 * │  • Report covers: YESTERDAY 3:00 PM → 11:59 PM IST                        │
 * │  • Users check-in at 3 PM, check-out at 12 AM                             │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Primary recipient ('To'): user's email (the concern person).
 * Multiple CC recipients ('CC'): configured via ACTIVITY_REPORT_CC.
 *
 * Can also run via Cloud Run Job `daily-activity-report` (src/jobs/daily-activity-report/run.ts).
 */

if (!appConfig.isDevelopment) {
  // ┌────────────────────────────────────────────────────────────────────────┐
  // │  MORNING SHIFT REPORT                                                   │
  // │  Runs every day at 2:55 PM Asia/Kolkata (IST)                          │
  // │  Cron expression: '55 14 * * *' → 14:55 UTC = 20:25 IST (wait...)      │
  // │  Actually: '55 14 * * *' = 2:55 PM IST (since IST = UTC+5:30)          │
  // └────────────────────────────────────────────────────────────────────────┘
  cron.schedule(
    '55 14 * * *',
    async () => {
      console.log('📊 [CRON] Morning Shift Activity Report Job Started (2:55 PM Asia/Kolkata)...');
      try {
        const container = getContainer();
        const userService = container.get<UserService>(GLOBAL_TYPES.UserService);
        const result = await userService.sendDailyUserActivityReports();
        console.log(
          `✅ [CRON] Morning Shift Activity Report completed: date=${result.date}, total=${result.total}, sent=${result.sent}, skipped=${result.skipped}, failed=${result.failed}`,
        );
      } catch (err) {
        console.error('❌ [CRON] Failed to send morning shift activity reports:', err);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │  EVENING SHIFT REPORT                                                   │
  // │  Runs every day at 12:00 AM Asia/Kolkata (IST)                         │
  // │  Cron expression: '0 0 * * *' = 12:00 AM IST                           │
  // └────────────────────────────────────────────────────────────────────────┘
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('📊 [CRON] Evening Shift Activity Report Job Started (12:00 AM Asia/Kolkata)...');
      try {
        const container = getContainer();
        const userService = container.get<UserService>(GLOBAL_TYPES.UserService);
        const result = await userService.sendDailyUserActivityReports();
        console.log(
          `✅ [CRON] Evening Shift Activity Report completed: date=${result.date}, total=${result.total}, sent=${result.sent}, skipped=${result.skipped}, failed=${result.failed}`,
        );
      } catch (err) {
        console.error('❌ [CRON] Failed to send evening shift activity reports:', err);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
