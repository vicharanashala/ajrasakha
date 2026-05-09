import {ISubmissionHistory} from '#root/shared/index.js';
export const buildReviewTimeline = (
  history: ISubmissionHistory[] = [],
  queue: any[] = [],
  questionCreatedAt: Date,
  questionStatus: string,
) => {
  const now = new Date();
  //author reviewing
  if (!history.length && queue.length > 0) {
    return [
      {
        reviewerId: queue[0]?.toString(),

        assignedAt: questionCreatedAt,

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
      index === 0 ? questionCreatedAt : currentHistory.createdAt;

    if (nextHistory) {
      const completedAt = nextHistory.createdAt;

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
