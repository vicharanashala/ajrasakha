
import cron from 'node-cron';
import {getContainer} from '../loadModules.js';
import { appConfig } from '#root/config/app.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';

// Schedule every 1 hour
// if (!appConfig.isDevelopment) {
//   cron.schedule(
//     '0 10-19 * * *',
//     async () => {
//       console.log('<<CRON>> Running question re-allocate job...');

//       try {
//         const container = getContainer();
//         const questionService = container.get<QuestionService>(
//           CORE_TYPES.QuestionService,
//         );

//         await questionService.balanceWorkload();
//       } catch (error) {
//         console.error('<<CRON>> Error re-allocating questions:', error);
//       }
//     },
//     {
//       timezone: 'Asia/Kolkata',
//     },
//   );
// }