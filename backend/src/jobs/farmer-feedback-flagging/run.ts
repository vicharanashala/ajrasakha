/**
 * Cloud Run Job / Cron entrypoint for Farmer Answer Feedback Auto-Flagging.
 *
 * Triggered periodically. Scans GDB entries where farmer helpfulness rating
 * falls below threshold (< 60% positive with >= 10 responses) and automatically
 * flags them back into the Reviewer System queue for agricultural expert re-review.
 */
import { getContainer, loadAppModules } from '../../bootstrap/loadModules.js';
import { FARMER_FEEDBACK_TYPES } from '#root/modules/farmerFeedback/types.js';
import { IFarmerFeedbackService } from '#root/modules/farmerFeedback/interfaces/IFarmerFeedbackService.js';

async function main(): Promise<void> {
  console.log('[farmer-feedback-flagging-job] Starting job execution...');
  await loadAppModules('all');

  const container = getContainer();
  const feedbackService = container.get<IFarmerFeedbackService>(
    FARMER_FEEDBACK_TYPES.FarmerFeedbackService,
  );

  const threshold = process.env.FARMER_FEEDBACK_FLAG_THRESHOLD
    ? Number(process.env.FARMER_FEEDBACK_FLAG_THRESHOLD)
    : 60;
  const minResponses = process.env.FARMER_FEEDBACK_MIN_RESPONSES
    ? Number(process.env.FARMER_FEEDBACK_MIN_RESPONSES)
    : 10;

  const result = await feedbackService.runAutoFlaggingPipeline(threshold, minResponses);
  console.log(
    `[farmer-feedback-flagging-job] Done: evaluated=${result.totalEvaluated}, flagged=${result.flaggedCount}`,
  );
  if (result.flaggedCount > 0) {
    console.log(
      `[farmer-feedback-flagging-job] Flagged Question IDs: ${result.flaggedQuestionIds.join(', ')}`,
    );
  }
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[farmer-feedback-flagging-job] Fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });
