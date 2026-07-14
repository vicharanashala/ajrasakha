import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';
import { appConfig } from '#root/config/app.js';

// Run every 2 minutes, all day — time-bound questions can arrive at any hour
const start = true
if(start){
if(!appConfig.isDevelopment){
cron.schedule(
  '0 */1 * * * *',
  async () => {
    console.log('<<CRON>> [TimeBound] Running 2-min time-bound reallocation job...');
    try {
      const container = getContainer();
      const questionService = container.get<QuestionService>(CORE_TYPES.QuestionService);
      const result = await questionService.reallocateTimeBoundQuestions();
      console.log(`<<CRON>> [TimeBound] Done: reallocated=${result.reallocated}, skipped=${result.skipped}`);
    } catch (error) {
      console.error('<<CRON>> [TimeBound] Error in time-bound reallocation job:', error);
    }
  },
  { timezone: 'Asia/Kolkata' },
)
}
}