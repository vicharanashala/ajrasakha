import cron from 'node-cron';
import { SchemeMatcherService } from '../../modules/schemes/services/SchemeMatcherService.js';

const options = { timezone: 'Asia/Kolkata' };

const job = async () => {
  console.log('[CRON] Scheme eligibility scan started');
  const service = new SchemeMatcherService();
  try {
    const results = await service.matchAllFarmers(50, (processed, total) => {
      console.log(`[CRON] Scheme matcher: ${processed}/${total} farmers processed`);
    });
    console.log(`[CRON] Scheme eligibility scan completed: ${results.length} farmers matched`);
  } catch (err) {
    console.error('[CRON] Scheme eligibility scan failed:', err);
  } finally {
    await service.close();
  }
};

// Run daily at 3:00 AM IST
cron.schedule('0 3 * * *', job, options);
