/**
 * Cloud Run Job entrypoint for question status updates.
 *
 * Triggered by Cloud Scheduler every 1 minute (Asia/Kolkata).
 * Updates status of questions that have expired after 4 hours.
 *
 * Replaces the in-process node-cron in bootstrap/jobs/questionStatus.ts.
 */
import { getContainer, loadAppModules } from '../../bootstrap/loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionRepository } from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

async function main(): Promise<void> {
  await loadAppModules('all');

  const container = getContainer();
  const questionRepository = container.get<QuestionRepository>(
    CORE_TYPES.QuestionRepository,
  );
  await questionRepository.updateExpiredAfterFourHours();
  console.log('[question-status-job] done');
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[question-status-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });