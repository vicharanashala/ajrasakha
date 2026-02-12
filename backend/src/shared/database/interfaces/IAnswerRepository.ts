
import {IAnswer, PreviousAnswersItem, SourceItem} from '#root/shared/interfaces/models.js';
import {
  Analytics,
  AnswerStatusOverview,
  ModeratorApprovalRate,
} from '#root/modules/core/classes/validators/DashboardValidators.js';
import {ClientSession, ObjectId} from 'mongodb';
import { SubmissionResponse } from '#root/modules/answer/classes/validators/AnswerValidator.js';

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
    source: SourceItem[],
    embedding: number[],
    isFinalAnswer?: boolean,
    answerIteration?: number,
    session?: ClientSession,
    status?: string,
    remarks?: string,
    type?:string,
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

  getAllFinalizedAnswers(
    userId: string,
    currentUserId: string,
    date: string,
    status: string,
    session?: ClientSession,
  ): Promise<{
    finalizedSubmissions: any[];
  }>;
  getCurrentUserWorkLoad(
    currentUserId: string,
    session?: ClientSession,
  ): Promise<{
    currentUserAnswersCount: number;
    totalQuestionsCount: number;
    totalInreviewQuestionsCount: number;
  }>;
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
  groupbyquestion(session?: ClientSession):Promise<any>

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
   * Updates an existing answer.
   * @param answerId - The ID of the answer to update.
   * @param session - Optional MongoDB client session for transactions.
   * @returns void
   */
  incrementApprovalCount(
    answerId: string,
    session?: ClientSession,
  ): Promise<number>;
  /**
    * Updates an existing answer.
    * @param answerId - The ID of the answer to update.
    * @param session - Optional MongoDB client session for transactions.
    * @returns void
    */
  resetApprovalCount(
    answerId: string,
    session?: ClientSession,
  ): Promise<number>

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

  /**
  
     * @param questionId
     * @param session Optional MongoDB session for transaction
     */

  deleteByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<void>;

  /**
   * Retrieves all goldenFaqs created .
   * @param userId- Moderator Id who created the Golden FAQ
   * @param page - Current page count.
   * @param limit - Total limit count.
   * @param search - Search to find
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of submissions.
   */
  getGoldenFaqs(
    userId: string,
    page: number,
    limit: number,
    search?: string,
    session?: ClientSession,
  ): Promise<{faqs: any[]; totalFaqs: number}>;

  updateAnswerStatus(
    answerId: string,
    updates: Partial<IAnswer>,
    session?: ClientSession,
  ): Promise<{modifiedCount: number}>;

  addAnswerModification(
    answerId: string,
    modification: PreviousAnswersItem,
    session?: ClientSession
  ): Promise<{ modifiedCount: number }>


  /**
   * @param session
   */
  getAnswerOverviewByStatus(
    session?: ClientSession,
  ): Promise<AnswerStatusOverview[]>;

  /**
   * @param startTime: string,
   * @param endTime - string.
   * @param session - Optional MongoDB client session for transactions.
   */
  getAnswerAnalytics(
    startTime?: string,
    endTime?: string,
    session?: ClientSession,
  ): Promise<{analytics: Analytics}>;


  /**
  * Retrieves historyy of moderator .
  * @param userId- Moderator Id 
  * @param page - Current page count.
  * @param limit - Total limit count.
  * @param session - Optional MongoDB client session for transactions.
  * @returns A promise that resolves to an array of submissions.
  */
  getModeratorActivityHistory(
    moderatorId: string,
    page: number,
    limit: number,
    dateRange?: { from?: string; to?: string },
  selectedHistoryId?:string,
  session?:ClientSession
  )
}
