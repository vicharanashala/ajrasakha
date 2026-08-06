import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';

// Run every 2 minutes, all day 
const ENABLE_INPROCESS_CRON = true;
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
