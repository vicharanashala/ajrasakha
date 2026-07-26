import {appConfig} from '#root/config/app.js';
import {dbConfig} from '#root/config/db.js';
import {createClusterBackup} from '#root/utils/backup-cron.js';
// import {sendEmailNotification} from '#root/utils/mailer.js';
import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
// import { UserRepository } from '#root/shared/database/providers/mongo/repositories/UserRepository.js';
// import { CORE_TYPES } from '#root/modules/core/types.js';

// Backup is now run by the Cloud Run Job `backup-db` (see src/jobs/backup/run.ts),
// triggered by Cloud Scheduler at 08:00 and 19:00 Asia/Kolkata.
// The in-process cron is disabled to avoid double execution.
//
// To re-enable for local dev, flip `ENABLE_INPROCESS_CRON` to true.
const ENABLE_INPROCESS_CRON = true;

if (ENABLE_INPROCESS_CRON) {
  cron.schedule(
    '0 8,19 * * *',
    async () => {
      console.log('🚀 Cron Job Started: Creating MongoDB Backup...');

      const URI = dbConfig.url;
      const DB = dbConfig.dbName;
      const container = getContainer();
      // const userRepository = container.get<UserRepository>(
      // CORE_TYPES.UserRepository,
      // );
      try {
        // await userRepository.unBlockExperts()
        const ENABLE_DB_BACKUP = appConfig.ENABLE_DB_BACKUP;
        if (ENABLE_DB_BACKUP) {
          await createClusterBackup(URI);
          console.log('🎉 Backup Job Completed Successfully');
        } else {
          console.log('Skipped backup ENABLE_DB_BACKUP==', ENABLE_DB_BACKUP);
        }
      } catch (err) {
        console.error('❌ Backup Failed:', err);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    },
  );
}
