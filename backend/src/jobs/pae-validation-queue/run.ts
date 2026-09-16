/**
 * Cloud Run Job entrypoint for PAE validation queue processing.
 *
 * This can be used as a fallback/retry mechanism for PAE queue processing.
 * Primary processing is now event-driven (triggered from answer approval and PAE action).
 *
 * Replaces the in-process node-cron in bootstrap/jobs/paeValidationQueueCron.ts.
 */
import 'reflect-metadata';
import { getContainer, loadAppModules } from '../../bootstrap/loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { QuestionService } from '#root/modules/core/index.js';

async function main(): Promise<void> {
  console.log('[PAE Validation Queue Job] starting...');

  try {
    console.log('[PAE Validation Queue Job] loading app modules...');
    await loadAppModules('all');
    console.log('[PAE Validation Queue Job] modules loaded successfully');
  } catch (moduleError) {
    console.error('[PAE Validation Queue Job] failed to load modules:', moduleError);
    throw moduleError;
  }

  try {
    const container = getContainer();
    console.log('[PAE Validation Queue Job] container obtained');

    const questionService = container.get<QuestionService>(
      CORE_TYPES.QuestionService,
    );
    console.log('[PAE Validation Queue Job] QuestionService resolved');

    const result = await questionService.processPaeValidationQueue();
    console.log(
      `[PAE Validation Queue Job] done: assigned=${result.assigned}, availableWaiting=${result.availableWaiting}, failedAssignments=${result.failedAssignments}`,
    );
  } catch (serviceError) {
    console.error('[PAE Validation Queue Job] service error:', serviceError);
    throw serviceError;
  }
}

main()
  .then(() => {
    console.log('[PAE Validation Queue Job] completed successfully');
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[PAE Validation Queue Job] fatal error:', err);
    console.error('[PAE Validation Queue Job] stack:', err instanceof Error ? err.stack : String(err));
    setTimeout(() => process.exit(1), 100);
  });