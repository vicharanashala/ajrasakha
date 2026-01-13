import { IComment } from '#root/shared/index.js';

export interface ICommentService {
  /**
   * Fetch paginated comments for a given question + answer
   */
  getComments(
    questionId: string,
    answerId: string,
    page: number,
    limit: number
  ): Promise<{
    comments: IComment[];
    total: number;
  }>;

  /**
   * Add a new comment to an answer
   * Also triggers notification to the answer author
   */
  addComment(
    questionId: string,
    answerId: string,
    text: string,
    userId: string
  ): Promise<boolean>;
}
