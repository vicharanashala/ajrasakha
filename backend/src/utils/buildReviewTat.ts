import { ISubmissionHistory } from "#root/shared/index.js";
export const buildReviewTimeline = (
  history: ISubmissionHistory[] = [],
  queue: any[] = [],
  questionCreatedAt: Date,
) => {
  const now = new Date();

  return queue.map((reviewer, index) => {
    // AUTHOR STAGE
    if (index === 0) {
      // ------------------------------------------------------------
      // CASE 1:
      // No history yet means author still working
      // ------------------------------------------------------------
      if (!history.length) {
        return {
          reviewerId: reviewer.toString(),
          assignedAt: questionCreatedAt,
          completedAt: now,
          timeTakenMs:
            now.getTime() - new Date(questionCreatedAt).getTime(),
          isCompleted: false,
        };
      }

      // ------------------------------------------------------------
      // CASE 2:
      // Author completed operation
      // First history entry marks author completion
      // ------------------------------------------------------------
      const firstHistory = history[0];

      return {
        reviewerId: reviewer.toString(),
        assignedAt: questionCreatedAt,
        completedAt: firstHistory.createdAt,
        timeTakenMs:
          new Date(firstHistory.createdAt).getTime() -
          new Date(questionCreatedAt).getTime(),
        isCompleted: true,
      };
    }

    // ============================================================
    // REVIEWER STAGES (QUEUE INDEX > 0)
    // ============================================================

    // Current reviewer corresponds to previous history item
    const currentHistory = history[index - 1];

    // ------------------------------------------------------------
    // Reviewer not started yet
    // ------------------------------------------------------------
    if (!currentHistory) {
      return {
        reviewerId: reviewer.toString(),
        assignedAt: null,
        completedAt: null,
        timeTakenMs: null,
        isCompleted: false,
      };
    }

    // ------------------------------------------------------------
    // Assignment starts when previous reviewer completed
    // ------------------------------------------------------------
    const assignedAt = currentHistory.createdAt;

    // ------------------------------------------------------------
    // CASE 3:
    // Current reviewer still reviewing
    // ------------------------------------------------------------
    if (currentHistory.status === 'in-review') {
      return {
        reviewerId: reviewer.toString(),
        assignedAt,
        completedAt: now,
        timeTakenMs:
          now.getTime() - new Date(assignedAt).getTime(),
        isCompleted: false,
      };
    }

    // ------------------------------------------------------------
    // CASE 4:
    // Reviewer completed operation
    // Completion time = next history item createdAt
    // ------------------------------------------------------------
    const nextHistory = history[index];

    const completedAt = nextHistory?.createdAt || now;

    return {
      reviewerId: reviewer.toString(),
      assignedAt,
      completedAt,
      timeTakenMs:
        new Date(completedAt).getTime() -
        new Date(assignedAt).getTime(),
      isCompleted: !!nextHistory,
    };
  });
};