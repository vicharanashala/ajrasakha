/**
 * Cloud Run Job entrypoint for the daily user activity report.
 *
 * Triggered daily at 12:00 AM (00:00 Asia/Kolkata) by Cloud Scheduler.
 * Sends individual activity reports for the previous day [12:00 AM - 11:59 PM] IST
 * to all active review staff (To: user.email, CC: configured CC list).
 */
import { getContainer, loadAppModules } from '../../bootstrap/loadModules.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { UserService } from '#root/modules/user/services/UserService.js';

async function main(): Promise<void> {
  await loadAppModules('all');
  console.log('[daily-activity-report-job] starting daily activity report run...');
  const container = getContainer();
  const userService = container.get<UserService>(GLOBAL_TYPES.UserService);
  const result = await userService.sendDailyUserActivityReports();
  console.log(
    `[daily-activity-report-job] completed: date=${result.date}, total=${result.total}, sent=${result.sent}, skipped=${result.skipped}, failed=${result.failed}`,
  );
  if (result.errors.length) {
    console.error('[daily-activity-report-job] errors:', result.errors);
  }
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[daily-activity-report-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });
