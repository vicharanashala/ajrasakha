import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';
import { appConfig } from '#root/config/app.js';

// Run every 2 minutes, all day — time-bound questions can arrive at any hour
const start =true
if(start){
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
}