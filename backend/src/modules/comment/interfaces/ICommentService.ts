import { PaginatedCommentsResponseDto } from '../dtos/CommentResponseDto.js';

export interface ICommentService {
  /**
   * Fetch paginated comments for a given question + answer
   */
  getComments(
    questionId: string,
    answerId: string,
    page: number,
    limit: number
  ): Promise<PaginatedCommentsResponseDto>;

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
