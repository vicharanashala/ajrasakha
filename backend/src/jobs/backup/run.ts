/**
 * Cloud Run Job entrypoint for the MongoDB cluster backup.
 *
 * Triggered by Cloud Scheduler at 08:00 and 19:00 Asia/Kolkata.
 * Runs to completion and exits — does NOT start the HTTP server.
 */
import { createClusterBackup } from '../../utils/backup-cron.js';
import { dbConfig } from '../../config/db.js';

async function main(): Promise<void> {
  console.log('[backup-job] starting MongoDB cluster backup');
  console.log(`[backup-job] target db: ${dbConfig.dbName}`);

  await createClusterBackup(dbConfig.url);

  console.log('[backup-job] backup completed successfully');
}

main()
  .then(() => {
    // Give stdout a tick to flush before exiting
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[backup-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });
