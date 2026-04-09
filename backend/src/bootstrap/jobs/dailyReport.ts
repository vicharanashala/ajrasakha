
import { sendStatsEmail} from '../../utils/backupEmailService.js';
import cron from 'node-cron';
cron.schedule(
  '30 15,0 * * *', // 3:30 PM & 12:00 AM
  async () => {
    console.log('📊 Cron Job Started: Sending GDB Count Report...');

    try {
      await sendStatsEmail();
      console.log('✅ GDB Count Report Sent Successfully');
    } catch (err) {
      console.error('❌ Failed to send GDB report:', err);
    }
  },
  {
    timezone: 'Asia/Kolkata',
  },
);