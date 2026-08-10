/**
 * Cloud Run Job entrypoint for feedback allocation.
 *
 * Triggered by Cloud Scheduler. Allocates questions with open feedback to the
 * final answer approver when that user is an available moderator/auditor.
 * or will be assigned to an available moderator/auditor.
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
  const result = await questionService.allocateFeedbackQuestions();
  console.log(
    `[feedback-allocation-job] done: allocated=${result.allocated}, skipped=${result.skipped}`,
  );
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[feedback-allocation-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });
