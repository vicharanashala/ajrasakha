import type { SubmissionResponse } from '../classes/validators/AnswerValidator.js';

/**
 * Interface defining submission and activity history operations.
 */
export interface IAnswerSubmissionService {
  getSubmissions(
    userId: string,
    page: number,
    limit: number,
    dateRange?: { from: string | undefined; to: string | undefined },
    selectedHistoryId?: string | undefined,
    expertId?: string | undefined,
  ): Promise<SubmissionResponse[]>;

  getFinalAnswerQuestions(
    userId: string,
    currentUserId: string,
    date: string,
    status: string,
  ): Promise<{ finalizedSubmissions: any[] }>;
}
