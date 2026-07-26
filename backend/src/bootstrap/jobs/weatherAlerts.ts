import cron from 'node-cron';
import { WeatherAlertService } from '../../modules/alerts/services/WeatherAlertService.js';

const options = { timezone: 'Asia/Kolkata' };

const job = async () => {
  console.log('[CRON] Weather Alert scan started');
  const service = new WeatherAlertService();
  try {
    const stats = await service.run();
    console.log('[CRON] Weather Alert scan completed:', stats);
  } catch (err) {
    console.error('[CRON] Weather Alert scan failed:', err);
  } finally {
    await service.close();
  }
};

// Run every 6 hours at :30 past the hour
cron.schedule('30 */6 * * *', job, options);
