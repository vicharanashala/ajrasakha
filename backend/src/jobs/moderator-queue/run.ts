/**
 * Cloud Run Job entrypoint for the moderator queue assignment.
 *
 * Triggered by Cloud Scheduler every 1 minute (Asia/Kolkata).
 * Single-allocation: one question per moderator at a time.
 *
 * Replaces the in-process node-cron in bootstrap/jobs/moderatorQueueCron.ts.
 */
import { getContainer, loadAppModules } from '../../bootstrap/loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';

async function main(): Promise<void> {
  await loadAppModules('all');

  const container = getContainer();
  const questionService = container.get<QuestionService>(
    CORE_TYPES.QuestionService,
  );
  const result = await questionService.runModeratorQueueCron();
  console.log(
    `[mod-queue-job] done: assigned=${result.assigned}, availableWaiting=${result.availableWaiting}, failedAssignments=${result.failedAssignments}`,
  );
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[mod-queue-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });