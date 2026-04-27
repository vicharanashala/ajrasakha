import { sendStatsEmail} from '../../utils/backupEmailService.js';
import cron from 'node-cron';

const job = async () => {
  console.log('📊 Cron Job Started: Sending GDB Count Report...');

  try {
    await sendStatsEmail();
    console.log('✅ GDB Count Report Sent Successfully');
  } catch (err) {
    console.error('❌ Failed to send GDB report:', err);
  }
};

const options = { timezone: 'Asia/Kolkata' };

// run at 12:00 AM every day
cron.schedule('0 0 * * *', job, options);

// run at 3:30 PM every day
cron.schedule('30 15 * * *', job, options);