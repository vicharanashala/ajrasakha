import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { appConfig } from '#root/config/app.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';

const start=false
if (appConfig.isDevelopment){
 //if (start) {
   cron.schedule(
     '25 12 * * *',
     async () => {
      console.log('<<CRON>> Running Remove absent Experts job...');

       try {
        const container = getContainer();
         const questionService = container.get<QuestionService>(
           CORE_TYPES.QuestionService,
         );
         await questionService.runAbsentScript();
       } catch (error) {
         console.error('<<CRON>> Error removing absent experts:', error);
       }
     },
     {
      timezone: 'Asia/Kolkata',
     },
  );
}
