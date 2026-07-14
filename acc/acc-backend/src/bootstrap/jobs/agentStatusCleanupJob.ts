import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { UserService } from '#root/modules/user/services/UserService.js';

// Schedule to run every 1 minute
cron.schedule('*/1 * * * *', async () => {
  try {
    const container = getContainer();
    const userService = container.get<UserService>(GLOBAL_TYPES.UserService);
    await userService.cleanupInactiveAgents();
  } catch (error) {
    console.error('<<CRON>> Error cleaning up inactive agents:', error);
  }
});
