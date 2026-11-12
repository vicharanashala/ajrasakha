import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { UserService } from '#root/modules/user/services/UserService.js';
import { appConfig } from '#root/config/app.js';

/**
 * Daily Activity Report Cron:
 * Runs every day at 12:05 AM (00:05) Asia/Kolkata (IST).
 *
 * Generates and emails the previous day's [12:00 AM - 11:59 PM] IST activity report
 * for active review staff who have sendDailyReport enabled (Experts, Moderators, Gatekeepers, Auditors).
 * Primary recipient ('To'): user's email (the concern person).
 * Multiple CC recipients ('CC'): configured via ACTIVITY_REPORT_CC.
 *
 * Can also run via Cloud Run Job `daily-activity-report` (src/jobs/daily-activity-report/run.ts).
 */

if (!appConfig.isDevelopment) {
  cron.schedule(
    '5 0 * * *',
    async () => {
      console.log('📊 [CRON] Daily Activity Report Job Started (12:05 AM Asia/Kolkata)...');
      try {
        const container = getContainer();
        const userService = container.get<UserService>(GLOBAL_TYPES.UserService);
        const result = await userService.sendDailyUserActivityReports();
        console.log(
          `✅ [CRON] Daily Activity Report completed: date=${result.date}, total=${result.total}, sent=${result.sent}, skipped=${result.skipped}, failed=${result.failed}`,
        );
      } catch (err) {
        console.error('❌ [CRON] Failed to send daily activity reports:', err);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
