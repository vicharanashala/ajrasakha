import {SubmissionResponse} from '#root/modules/core/classes/validators/AnswerValidators.js';
import {IAnswer} from '#root/shared/interfaces/models.js';
import {ClientSession, ObjectId} from 'mongodb';

/**
 * Interface representing a repository for answer-related operations.
 */
export interface IAnswerRepository {
  /**
   * Adds a new answer for a specific question.
   * @param questionId - The ID of the question to answer.
   * @param authorId - The ID of the author creating the answer.
   * @param answer - The answer content.
   * @param isFinalAnswer - Optional flag indicating if this is the final answer.
   * @param answerIteration - Optional number representing the iteration of this answer.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the inserted answer ID.
   */
  addAnswer(
    questionId: string,
    authorId: string,
    answer: string,
    isFinalAnswer?: boolean,
    answerIteration?: number,
    session?: ClientSession,
  ): Promise<{insertedId: string}>;

  /**
   * Retrieves all questions that have not been answered yet.
   * @param userId- Author id to check submissions
   * @param page - Current page count.
   * @param limit - Total limit count.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of submissions.
   */
  getAllSubmissions(
    userId: string,
    page: number,
    limit: number,
    session?: ClientSession,
  ): Promise<SubmissionResponse[]>;

  /**
   * Adds a new answer for a specific question.
   * @param authorId - The ID of the author creating the answer.
   * @param questionId - The ID of the question to answer.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to answer or null.
   */
  getByAuthorId(
    authorId: string,
    questionId: string,
    session?: ClientSession,
  ): Promise<IAnswer | null>;

  /**
   * Retrieves all answers for a specific question.
   * @param questionId - The ID of the question.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of answers.
   */
  getByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<Partial<IAnswer>[]>;

  /**
   * Retrieves all answers for a specific question.
   * @param questionId - The ID of the answerId.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to answer.
   */
  getById(answerId: string, session?: ClientSession): Promise<IAnswer>;

  /**
   * Updates an existing answer.
   * @param answerId - The ID of the answer to update.
   * @param updates - Partial object containing the fields to update.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the number of modified documents.
   */
  updateAnswer(
    answerId: string,
    updates: Partial<IAnswer>,
    session?: ClientSession,
  ): Promise<{modifiedCount: number}>;

  /**
   * Deletes an answer by its ID.
   * @param answerId - The ID of the answer to delete.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the number of deleted documents.
   */
  deleteAnswer(
    answerId: string,
    session?: ClientSession,
  ): Promise<{deletedCount: number}>;
}
