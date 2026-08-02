import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import type { AssignmentEngineService } from '#root/modules/question/services/AssignmentEngineService.js';

const start = true;

if (start) {
  cron.schedule(
    '0 */2 * * * *',
    async () => {
      try {
        const container = getContainer();
        const assignmentEngine = container.get<AssignmentEngineService>(CORE_TYPES.AssignmentEngineService);
        const assigned = await assignmentEngine.processWaitingQueue();
        if (assigned > 0) {
          console.log(`<<CRON>> [WaitingQueue] Processed queue: assigned ${assigned} question(s)`);
        }
      } catch (error) {
        console.error('<<CRON>> [WaitingQueue] Error processing waiting queue:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
