import {IComment} from '#root/shared/interfaces/models.js';
import {ClientSession} from 'mongodb';

export interface ICommentRepository {
  /**
   * Retrieves a paginated list of comments for a specific answer of a question.
   * @param questionId - The ID of the question.
   * @param answerId - The ID of the answer.
   * @param page - The page number for pagination (1-based).
   * @param limit - The maximum number of comments to return.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of comments.
   */
  getComments(
    questionId: string,
    answerId: string,
    page: number,
    limit: number,
    session?: ClientSession,
  ): Promise<IComment[]>;

  /**
   * Adds a new comment for a specific answer of a question.
   * @param questionId - The ID of the question.
   * @param answerId - The ID of the answer.
   * @param text - The comment content.
   * @param userId - The ID of the user creating the comment.
   * @param session - Optional MongoDB client session for transactions.
   * @returns insertedId that resolves when the comment is successfully added.
   */
  addComment(
    questionId: string,
    answerId: string,
    text: string,
    userId: string,
    session?: ClientSession,
  ): Promise<{insertedId: string}>;
}
