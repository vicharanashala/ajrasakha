
import cron from 'node-cron';
import {getContainer} from '../loadModules.js';
import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';
import { appConfig } from '#root/config/app.js';
import { CORE_TYPES } from '#root/modules/core/types.js';

// Schedule every 1 minutes
if(!appConfig.isDevelopment){
cron.schedule('*/1 * * * *', async () => {
  console.log('<<CRON>> Running question status update job...');

  try {
    const container = getContainer();
    const questionRepository = container.get<QuestionRepository>( 
      CORE_TYPES.QuestionRepository,
    );

    await questionRepository.updateExpiredAfterFourHours();
  } catch (error) {
    console.error('<<CRON>> Error updating question status:', error);
  }
});
}

