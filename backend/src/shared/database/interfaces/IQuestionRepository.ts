import {QuestionResponse} from '#root/modules/core/classes/validators/QuestionValidators.js';
import {IQuestion} from '#root/shared/interfaces/models.js';
import {ClientSession} from 'mongodb';

/**
 * Interface representing a repository for question-related operations.
 */
export interface IQuestionRepository {
  /**
   * Adds multiple questions for a specific context and user.
   * @param userId - The ID of the user creating the questions.
   * @param contextId - The ID of the context the questions belong to.
   * @param questions - An array of question strings.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the number of inserted questions.
   */
  addQuestions(
    userId: string,
    contextId: string,
    questions: string[],
    session?: ClientSession,
  ): Promise<{insertedCount: number}>;

  /**
   * Retrieves all questions for a specific context.
   * @param contextId - The ID of the context.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of questions.
   */
  getByContextId(
    contextId: string,
    session?: ClientSession,
  ): Promise<IQuestion[]>;

  /**
   * Retrieves all questions for a specific context.
   * @param questionId - The ID of the question.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of questions.
   */
  getById(questionId: string, session?: ClientSession): Promise<IQuestion>;

  /**
   * Retrieves all questions that have not been answered yet.
   * @param userId- Author id to check submissions
   * @param page - Current page count.
   * @param limit - Total limit count.
   * @param filter - Filter options.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an array of unanswered questions.
   */
  getUnAnsweredQuestions(
    userId: string,
    page: number,
    limit: number,
    filter: 'newest' | 'oldest' | 'leastResponses' | 'mostResponses',
    session?: ClientSession,
  ): Promise<QuestionResponse[]>;

  /**
   * Updates a specific question.
   * @param questionId - The ID of the question to update.
   * @param updates - Partial object containing the fields to update.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the number of modified documents.
   */
  updateQuestion(
    questionId: string,
    updates: Partial<IQuestion>,
    session?: ClientSession,
  ): Promise<{modifiedCount: number}>;

  /**
   * Updates a specific question.
   * @param questionId - The ID of the question to update.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the number of deletedCount documents.
   */
  deleteQuestion(
    questionId: string,
    session?: ClientSession,
  ): Promise<{deletedCount: number}>;
}
