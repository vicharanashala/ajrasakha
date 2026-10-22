import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';

// DISABLED: feedback allocation is now handled inside the moderator-queue cron
// (runModeratorQueueCron's feedback pass), so this standalone cron is no longer
// needed. Kept for reference; flip the flag only if you intentionally revert.
const ENABLE_INPROCESS_CRON = false;
if (ENABLE_INPROCESS_CRON) {
  cron.schedule(
    '0 */1 * * * *',
    async () => {
      console.log('<<CRON>> [Feedback] Running feedback allocation job...');
      try {
        const container = getContainer();
        const questionService = container.get<QuestionService>(CORE_TYPES.QuestionService);
        const feedbackData = await questionService.allocateFeedbackQuestions();
        console.log(
          `[feedback-allocation-job] done: allocated=${feedbackData.allocated}, skipped=${feedbackData.skipped}`,
        );
      } catch (error) {
        console.error('<<CRON>> [Feedback] Error in feedback allocation job:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );  
}
