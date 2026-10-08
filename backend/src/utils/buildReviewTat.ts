import {ISubmissionHistory} from '#root/shared/index.js';

/**
 * Builds a review timeline with accurate time calculations.
 * 
 * For reviewers (index >= 1):
 * - assignedAt: The createdAt of the history entry
 * - completedAt: The createdAt of the review document (fetched via reviewId), NOT history.updatedAt
 * - If no reviewId exists, the review is still in progress
 * 
 * For author (index 0):
 * - assignedAt: firstAllocationAt or questionCreatedAt
 * - completedAt: history[0].createdAt
 */
export const buildReviewTimeline = (
  history: ISubmissionHistory[] = [],
  queue: any[] = [],
  questionCreatedAt: Date,
  questionStatus: string,
  firstAllocationAt?: Date | null,
  reviewMap?: Map<string, any>, // Optional: Map of reviewId -> review document for accurate completion time
) => {
  const now = new Date();
  // The author (queue/history index 0) is "assigned" when the question was first
  // allocated to them, not when the question was created. Fall back to createdAt
  // only when firstAllocationAt is missing (older/never-allocated questions).
  const authorAssignedAt = firstAllocationAt ?? questionCreatedAt;
  //author reviewing
  if (!history.length && queue.length > 0) {
    return [
      {
        reviewerId: queue[0]?.toString(),

        assignedAt: authorAssignedAt,

        completedAt: null,

        timeTakenMs: null,

        isCompleted: false,
      },
    ];
  }

  const timeline = [];
  history.forEach((currentHistory, index) => {
    const nextHistory = history[index + 1];
    const assignedAt =
      index === 0 ? authorAssignedAt : currentHistory.createdAt;

    // Author (index 0): completion is when the author actually created their
    // answer (history[0].createdAt), not when the next reviewer's entry began.
    if (index === 0) {
      const completedAt = currentHistory.createdAt;

      timeline.push({
        reviewerId: currentHistory.updatedBy?.toString(),

        assignedAt,

        completedAt,

        timeTakenMs:
          new Date(completedAt).getTime() - new Date(assignedAt).getTime(),

        isCompleted: true,
      });

      return;
    }

    // Reviewer logic (index >= 1)
    // Check if review is complete (has reviewId and review document exists)
    if (!currentHistory.reviewId) {
      // No reviewId means still in progress
      timeline.push({
        reviewerId: currentHistory.updatedBy?.toString(),

        assignedAt,

        completedAt: null,

        timeTakenMs: null,

        isCompleted: false,
      });

      return;
    }

    const reviewIdStr = currentHistory.reviewId.toString();
    const review = reviewMap?.get(reviewIdStr);

    if (!review || !review.createdAt) {
      // Review document not found or no createdAt, treat as in progress
      timeline.push({
        reviewerId: currentHistory.updatedBy?.toString(),

        assignedAt,

        completedAt: null,

        timeTakenMs: null,

        isCompleted: false,
      });

      return;
    }

    // completed reviewer - use review document's createdAt as completion time
    const completedAt = review.createdAt;

    timeline.push({
      reviewerId: currentHistory.updatedBy?.toString(),

      assignedAt,

      completedAt,

      timeTakenMs:
        new Date(completedAt).getTime() - new Date(assignedAt).getTime(),

      isCompleted: true,
    });
  });

  return timeline;
};
