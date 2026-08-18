import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';
import { appConfig } from '#root/config/app.js';

// Run every 2 minutes, all day — time-bound questions can arrive at any hour
const ENABLE_INPROCESS_CRON = false;
if (ENABLE_INPROCESS_CRON) {
  cron.schedule(
    '0 */1 * * * *',
    async () => {
      console.log('<<CRON>> [TimeBound] Running 2-min time-bound reallocation job...');
      try {
        const container = getContainer();
        const questionService = container.get<QuestionService>(CORE_TYPES.QuestionService);
        const timeBound = await questionService.reallocateTimeBoundQuestions();
        console.log(
          `[time-bound-reallocate-job] time-bound done: reallocated=${timeBound.reallocated}, skipped=${timeBound.skipped}`,
        );

        // Manual (AGRI_EXPERT/OUTREACH) single-allocation queue — same engine, different source
        // group. Without this call the manual queue never gets reviewers/reallocations assigned.
        const manual = await questionService.reallocateManualQuestions();
        console.log(
          `[time-bound-reallocate-job] manual done: reallocated=${manual.reallocated}, skipped=${manual.skipped}`,
        );  
      } catch (error) {
        console.error('<<CRON>> [TimeBound] Error in time-bound reallocation job:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );  
}
