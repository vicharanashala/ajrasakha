import {appConfig} from '#root/config/app.js';
import {dbConfig} from '#root/config/db.js';
import {createLocalBackup} from '#root/utils/backup-cron.js';
import {sendEmailNotification} from '#root/utils/mailer.js';
import cron from 'node-cron';

// cron.schedule('* * * * *', async () => {
cron.schedule(
  '0 8,18 * * *',
  async () => {
    console.log('🚀 Cron Job Started: Creating MongoDB Backup...');

    const URI = dbConfig.url;
    const DB = dbConfig.dbName;

    try {
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
