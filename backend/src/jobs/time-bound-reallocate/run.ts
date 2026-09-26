/**
 * Cloud Run Job entrypoint for time-bound question reallocation.
 *
 * Triggered by Cloud Scheduler every 1 minute (Asia/Kolkata).
 * Reallocates questions whose time-bound window has expired.
 *
 * Replaces the in-process node-cron in bootstrap/jobs/timeBoundReAllocateCron.ts.
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
  // Time-bound (AJRASAKHA/WHATSAPP) queue.
  const timeBound = await questionService.reallocateTimeBoundQuestions();
  console.log(
    `[time-bound-reallocate-job] time-bound done: reallocated=${timeBound.reallocated}, skipped=${timeBound.skipped}`,
  );

  // Manual (AGRI_EXPERT/OUTREACH) single-allocation queue — same engine, different source
  // group. Without this call the manual queue never gets reviewers/reallocations assigned.
  const manual = await questionService.reallocateManualQuestions();
  console.log(
    `[time-bound-reallocate-job] manual done: reallocated=${manual.reallocated}, skipped=${manual.skipped}`,
  );
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[time-bound-reallocate-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });