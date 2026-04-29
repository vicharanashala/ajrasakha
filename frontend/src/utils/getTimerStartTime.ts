import type { IAuthorsHistory, ISubmissionHistory } from "@/types";

interface ISubmissionLike {
  queue?: { length: number };
  history?: ISubmissionHistory[];
  createdAt?: string;
}

interface IQuestionWithSubmission {
  submission?: ISubmissionLike;
  authors_history?: IAuthorsHistory[];
  createdAt?: string;
}

/**
 * Determines the correct start time for the countdown timer based on user role.
 *
 * For Author (submission.history.length === 0):
 *   - Use authors_history last entry's createdAt if available
 *   - Otherwise fall back to submission.createdAt
 *
 * For Level Expert (submission.history.length > 0):
 *   - Use submission.history last entry's createdAt
 *
 * @param question - Question data including submission and authors_history
 * @returns The correct createdAt string to use for timer calculation
 */
export function getTimerStartTime(
  question: IQuestionWithSubmission,
): string {
  const { submission, authors_history, createdAt } = question;

  // Check if user is Author: queue[0] AND history.length === 0
  const isAuthor =
    submission?.queue &&
    submission.queue.length > 0 &&
    submission.history?.length === 0;



  if (isAuthor) {
    // Author: Use authors_history last entry's createdAt if available
    if (authors_history && authors_history.length > 0) {
      const lastEntry = authors_history[authors_history.length - 1];
      return lastEntry.createdAt;
    }

    return submission?.createdAt || createdAt || "";
  }

  // Level Expert: Use submission.history last entry's createdAt
  if (submission?.history && submission.history.length > 0) {
    const lastHistoryEntry = submission.history[submission.history.length - 1];
    return lastHistoryEntry.createdAt || createdAt || "";
  }


  // Default fallback
  return createdAt || "";
}
