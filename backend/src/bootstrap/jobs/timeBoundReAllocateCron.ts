import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';
import { appConfig } from '#root/config/app.js';

// Runs every minute, all day. Handles BOTH single-allocation queues in one tick:
//   1. Time-bound (AJRASAKHA / WHATSAPP)
//   2. Manual (AGRI_EXPERT / OUTREACH) — only questions not yet PAE-reviewed
// The two use independent per-expert caps, so an expert can hold 1 time-bound AND
// 1 manual question at the same time.
if(!appConfig.isDevelopment){
cron.schedule(
  '0 */1 * * * *',
  async () => {
    console.log('<<CRON>> [SingleAlloc] Running time-bound + manual single-allocation job...');
    try {
      const container = getContainer();
      const questionService = container.get<QuestionService>(CORE_TYPES.QuestionService);

      const timeBound = await questionService.reallocateTimeBoundQuestions();
      console.log(`<<CRON>> [TimeBound] Done: reallocated=${timeBound.reallocated}, skipped=${timeBound.skipped}`);

      const manual = await questionService.reallocateManualQuestions();
      console.log(`<<CRON>> [ManualSingle] Done: reallocated=${manual.reallocated}, skipped=${manual.skipped}`);
    } catch (error) {
      console.error('<<CRON>> [SingleAlloc] Error in single-allocation job:', error);
    }
  },
  { timezone: 'Asia/Kolkata' },
)
}
