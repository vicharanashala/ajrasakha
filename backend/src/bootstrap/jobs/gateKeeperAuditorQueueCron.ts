import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';
import { appConfig } from '#root/config/app.js';
// Queue assignment is now run by the Cloud Run Job `gate-keeper-auditor-queue`
// (see src/jobs/gate-keeper-auditor-queue/run.ts), triggered by Cloud Scheduler
// every minute. The in-process cron is disabled to avoid double execution.
//
// To re-enable for local dev, flip `ENABLE_INPROCESS_CRON` to true.
const ENABLE_INPROCESS_CRON = false;

if (!appConfig.isDevelopment) {
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
