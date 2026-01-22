import {appConfig} from '#root/config/app.js';
import {dbConfig} from '#root/config/db.js';
import {createLocalBackup} from '#root/utils/backup-cron.js';
import {sendEmailNotification} from '#root/utils/mailer.js';
import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { UserRepository } from '#root/shared/database/providers/mongo/repositories/UserRepository.js';
import { CORE_TYPES } from '#root/modules/core/types.js';

// cron.schedule('* * * * *', async () => {
cron.schedule(
  '0 8,19 * * *',
  async () => {
    console.log('🚀 Cron Job Started: Creating MongoDB Backup...');

    const URI = dbConfig.url;
    const DB = dbConfig.dbName;
    const container = getContainer();
    const userRepository = container.get<UserRepository>(
    CORE_TYPES.UserRepository,
    );
    try {
      await userRepository.unBlockExperts()
      const ENABLE_DB_BACKUP = appConfig.ENABLE_DB_BACKUP;
      if (ENABLE_DB_BACKUP) {
        await createLocalBackup(URI, DB);
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
