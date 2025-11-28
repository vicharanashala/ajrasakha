import {dbConfig} from '#root/config/db.js';
import {createLocalBackup} from '#root/utils/backup-cron.js';
import cron from 'node-cron';

// cron.schedule('* * * * *', async () => {
// cron.schedule('0 2 * * *', async () => {
//   console.log('🚀 Cron Job Started: Creating MongoDB Backup...');

//   const URI = dbConfig.url;
//   const DB = dbConfig.dbName;

//   try {
//     await createLocalBackup(URI, DB);
//     console.log('🎉 Backup Completed Successfully');
//   } catch (err) {
//     console.error('❌ Backup Failed:', err);
//   }
// });
