import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';
import { appConfig } from '#root/config/app.js';

// Runs every minute — single-allocation queue for role-triaged questions:
//   - dynamic / duplicate / queue_duplicate → assigned to a free gate keeper
//   - auditor_review                        → assigned to a free auditor
// One question per user at a time; the user is freed when they act on it.
if (appConfig.isDevelopment) {
  cron.schedule(
    '0 */1 * * * *',
    async () => {
      console.log('<<CRON>> [GateKeeper/Auditor] Running role queue assignment job...');
      try {
        const container = getContainer();
        const questionService = container.get<QuestionService>(CORE_TYPES.QuestionService);
        const result = await questionService.runGateKeeperAuditorQueueCron();
        console.log(
          `<<CRON>> [GateKeeper/Auditor] Done: gateKeeperAssigned=${result.gateKeeperAssigned}, auditorAssigned=${result.auditorAssigned}`,
        );
      } catch (error) {
        console.error('<<CRON>> [GateKeeper/Auditor] Error in role queue job:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
