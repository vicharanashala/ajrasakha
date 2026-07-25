/**
 * Cloud Run Job entrypoint for daily GDB stats report.
 *
 * Triggered by Cloud Scheduler twice daily (12:00 AM and 3:30 PM Asia/Kolkata).
 * Sends a stats email report.
 *
 * Replaces the in-process node-cron in bootstrap/jobs/dailyReport.ts.
 */
import { sendStatsEmail } from '../../utils/backupEmailService.js';

async function main(): Promise<void> {
  console.log('[daily-report-job] sending GDB Count Report...');
  await sendStatsEmail();
  console.log('[daily-report-job] done');
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[daily-report-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });