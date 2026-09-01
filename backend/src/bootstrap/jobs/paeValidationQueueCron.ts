import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';
import { appConfig } from '#root/config/app.js';

// NOTE: This in-process cron is disabled. PAE queue processing is now event-driven.
// To re-enable for local dev/testing, flip ENABLE_INPROCESS_CRON to true.
const ENABLE_INPROCESS_CRON = false;
if (ENABLE_INPROCESS_CRON) {
  cron.schedule(
    '0 */1 * * * *',
    async () => {
      console.log('<<CRON>> [PAE Validation Queue] Running queue processing...');
      try {
        const container = getContainer();
        const questionService = container.get<QuestionService>(CORE_TYPES.QuestionService);
        const result = await questionService.processPaeValidationQueue();
        console.log(
          `[PAE Validation Queue] done: assigned=${result.assigned}, availableWaiting=${result.availableWaiting}, failedAssignments=${result.failedAssignments}`,
        );
      } catch (error) {
        console.error('<<CRON>> [PAE Validation Queue] Error:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );  
}