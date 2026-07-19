import {appConfig} from '#root/config/app.js';
import {dbConfig} from '#root/config/db.js';
import {createClusterBackup} from '#root/utils/backup-cron.js';
import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { GLOBAL_TYPES } from '#root/types.js';

cron.schedule(
  '0 8,19 * * *',
  async () => {
    console.log('🚀 Cron Job Started: Daily Maintenance & Backup...');

    const URI = dbConfig.url;
    const container = getContainer();

    try {
      const hour = new Date().getHours();
      // Only unblock experts in the morning job (8 AM)
      if (hour === 8) {
        console.log('🌅 Morning Reset: Unblocking active experts...');
        const userRepository = container.get<IUserRepository>(GLOBAL_TYPES.UserRepository);
        await userRepository.unBlockExperts();
        console.log('✅ Active experts successfully unblocked.');
      }

      const ENABLE_DB_BACKUP = appConfig.ENABLE_DB_BACKUP;
      if (ENABLE_DB_BACKUP) {
        await createClusterBackup(URI);
        console.log('🎉 Backup Job Completed Successfully');
      } else {
        console.log('Skipped backup ENABLE_DB_BACKUP==', ENABLE_DB_BACKUP);
      } 
    } catch (err) {
      console.error('❌ Cron Job Execution Failed:', err);
    }
  },
  {
    timezone: 'Asia/Kolkata',
  },
);

