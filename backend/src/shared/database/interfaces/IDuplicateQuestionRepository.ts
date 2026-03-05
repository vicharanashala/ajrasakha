
import { GetDetailedQuestionsQuery } from '#root/modules/question/classes/validators/QuestionVaidators.js';
import {
  IQuestion,
  IReroute,
  IRerouteHistory,
  IUser,
  QuestionStatus,
  RerouteStatus,
  ISimilarQuestion
} from '#root/shared/interfaces/models.js';
import {ClientSession} from 'mongodb';

/**
 * Interface representing a repository for question-related operations.
 */
export interface IDuplicateQuestionRepository {
  /**
   * Adds multiple questions for a specific context and user.
   * @param userId - The ID of the user creating the questions.
   * @param contextId - The ID of the context the questions belong to.
   * @param questions - An array of question strings.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the number of inserted questions.
   */

  addDuplicate(
    duplicateData: ISimilarQuestion,
    session?: ClientSession,
  ): Promise<{ insertedId: string }>;
  findDuplicatesByMatchedId(
    matchedQuestionId: string,
    session?: ClientSession,
  ): Promise<ISimilarQuestion[]>;
  findDuplicatesByDateRange(
    startDate: Date,
    endDate: Date,
    source: 'AJRASAKHA' | 'AGRI_EXPERT',
    session?: ClientSession,
  ): Promise<ISimilarQuestion[]>;
}
