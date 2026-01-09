import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { NotificationRepository } from '#root/shared/database/providers/mongo/repositories/NotificationRepository.js';
import { CORE_TYPES } from '#root/modules/core/types.js';


cron.schedule('0 2 * * *', async () => {
  console.log('<<CRON>> Running Delete Notification update job...');

  try {
    const container = getContainer();
    const questionRepository = container.get<NotificationRepository>(
      CORE_TYPES.NotificationRepository,
    );

    await questionRepository.autoDeleteNotifications();
  } catch (error) {
    console.error('<<CRON>> Error deleting notifications:', error);
  }
});
