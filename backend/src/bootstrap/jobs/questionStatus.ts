
import cron from 'node-cron';
import {getContainer} from '../loadModules.js';
import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';
import { appConfig } from '#root/config/app.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
// import { QuestionService } from '#root/modules/core/index.js';

// Schedule every 1 minutes
const start =false
if(start){
if(!appConfig.isDevelopment){
cron.schedule('*/1 * * * *', async () => {
  console.log('<<CRON>> Running question status update job...');

  try {
    const container = getContainer();
    const questionRepository = container.get<QuestionRepository>( 
      CORE_TYPES.QuestionRepository,
    );

    // const questionService = container.get<QuestionService>(CORE_TYPES.QuestionService);

    await questionRepository.updateExpiredAfterFourHours();
    // await questionService.sendDelayedNotifications();
    
  } catch (error) {
    console.error('<<CRON>> Error updating question status:', error);
  }
});
}
}
