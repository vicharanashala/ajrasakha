import {ISubmissionHistory} from '#root/shared/index.js';
export const buildReviewTimeline = (
  history: ISubmissionHistory[] = [],
  queue: any[] = [],
  questionCreatedAt: Date,
  questionStatus: string,
  firstAllocationAt?: Date | null,
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

    if (nextHistory) {
      // const completedAt = nextHistory.createdAt;
      const completedAt = currentHistory.updatedAt;

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

    // reviewer still reviewing

    if (currentHistory.status === 'in-review') {
      timeline.push({
        reviewerId: currentHistory.updatedBy?.toString(),

        assignedAt,

        completedAt: null,

        timeTakenMs: null,

        isCompleted: false,
      });

      return;
    }
    // completed reviewer

    const completedAt = currentHistory.updatedAt;

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
