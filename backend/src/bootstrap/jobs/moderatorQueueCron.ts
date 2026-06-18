import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';
import { appConfig } from '#root/config/app.js';

// Run every 2 minutes — assigns in-review questions to available moderators (one per moderator at a time)
if (true) {
  cron.schedule(
    '0 */1 * * * *',
    async () => {
      console.log('<<CRON>> [ModeratorQueue] Running moderator queue assignment job...');
      try {
        const container = getContainer();
        const questionService = container.get<QuestionService>(CORE_TYPES.QuestionService);
        const result = await questionService.runModeratorQueueCron();
        console.log(`<<CRON>> [ModeratorQueue] Done: assigned=${result.assigned}, availableWaiting=${result.availableWaiting}, failedAssignments=${result.failedAssignments}`);
      } catch (error) {
        console.error('<<CRON>> [ModeratorQueue] Error in moderator queue job:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
