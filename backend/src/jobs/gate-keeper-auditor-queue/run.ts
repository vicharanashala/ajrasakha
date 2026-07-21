/**
 * Cloud Run Job entrypoint for the gate-keeper / auditor queue assignment.
 *
 * Triggered by Cloud Scheduler every 1 minute (Asia/Kolkata).
 * Single-allocation: one question per gate keeper / auditor at a time.
 *
 * Replaces the in-process node-cron in bootstrap/jobs/gateKeeperAuditorQueueCron.ts.
 */
import { getContainer } from '#root/bootstrap/loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';

async function main(): Promise<void> {
  const container = getContainer();
  const questionService = container.get<QuestionService>(
    CORE_TYPES.QuestionService,
  );
  const result = await questionService.runGateKeeperAuditorQueueCron();
  console.log(
    `[gk-auditor-job] done: gateKeeperAssigned=${result.gateKeeperAssigned}, auditorAssigned=${result.auditorAssigned}`,
  );
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[gk-auditor-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });