import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';
import { appConfig } from '#root/config/app.js';

// Run every 1 minute - assigns questions pending PAE validation to available PAE experts
const ENABLE_INPROCESS_CRON = true;
if (ENABLE_INPROCESS_CRON) {
  cron.schedule(
    '0 */1 * * * *',
    async () => {
      console.log('<<CRON>> [PaeValidationQueue] Running PAE validation queue assignment job...');
      try {
        const container = getContainer();
        const questionService = container.get<QuestionService>(CORE_TYPES.QuestionService);
        const result = await questionService.runPaeValidationQueueCron();
        console.log(
          `[pae-validation-queue-job] done: assigned=${result.assigned}, availableWaiting=${result.availableWaiting}, failedAssignments=${result.failedAssignments}`,
        );
      } catch (error) {
        console.error('<<CRON>> [PaeValidationQueue] Error in PAE validation queue job:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );  
}