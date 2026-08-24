/**
 * Cloud Run Job entrypoint for PAE validation queue assignment.
 *
 * Triggered by Cloud Scheduler every 1 minute (Asia/Kolkata).
 * Assigns questions pending PAE validation to available PAE experts.
 *
 * Replaces the in-process node-cron in bootstrap/jobs/paeValidationQueueCron.ts.
 */
import 'reflect-metadata';
import { getContainer, loadAppModules } from '../../bootstrap/loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';

async function main(): Promise<void> {
  console.log('[pae-validation-queue-job] starting...');

  try {
    console.log('[pae-validation-queue-job] loading app modules...');
    await loadAppModules('all');
    console.log('[pae-validation-queue-job] modules loaded successfully');
  } catch (moduleError) {
    console.error('[pae-validation-queue-job] failed to load modules:', moduleError);
    throw moduleError;
  }

  try {
    const container = getContainer();
    console.log('[pae-validation-queue-job] container obtained');

    const questionService = container.get<QuestionService>(
      CORE_TYPES.QuestionService,
    );
    console.log('[pae-validation-queue-job] QuestionService resolved');

    const result = await questionService.runPaeValidationQueueCron();
    console.log(
      `[pae-validation-queue-job] done: assigned=${result.assigned}, availableWaiting=${result.availableWaiting}, failedAssignments=${result.failedAssignments}`,
    );
  } catch (serviceError) {
    console.error('[pae-validation-queue-job] service error:', serviceError);
    throw serviceError;
  }
}

main()
  .then(() => {
    console.log('[pae-validation-queue-job] completed successfully');
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[pae-validation-queue-job] fatal error:', err);
    console.error('[pae-validation-queue-job] stack:', err instanceof Error ? err.stack : String(err));
    setTimeout(() => process.exit(1), 100);
  });