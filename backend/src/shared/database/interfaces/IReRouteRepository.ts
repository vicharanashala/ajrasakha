import {
  Analytics,
  DashboardResponse,
  GoldenDatasetEntry,
  GoldenDataViewType,
  ModeratorApprovalRate,
  QuestionStatusOverview,
} from '#root/modules/core/classes/validators/DashboardValidators.js';
import {
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '#root/modules/core/classes/validators/QuestionValidators.js';
import {
  IQuestion,
  IReroute,
  IRerouteHistory,
  IUser,
  QuestionStatus,
} from '#root/shared/interfaces/models.js';
import {ClientSession} from 'mongodb';

/**
 * Interface representing a repository for question-related operations.
 */
export interface IReRouteRepository {
  /**
   * Adds multiple questions for a specific context and user.
   * @param userId - The ID of the user creating the questions.
   * @param contextId - The ID of the context the questions belong to.
   * @param questions - An array of question strings.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the number of inserted questions.
   */
 
  addrerouteAnswer(payload:IReroute,session?:ClientSession):Promise<string>
  findByQuestionId(questionId:string,session?:ClientSession):Promise<IReroute>
  pushRerouteHistory(
    rerouteId: string,
    history: IRerouteHistory,
    updatedAt: Date,
    session?: ClientSession,
  ): Promise<void>
  getAllocatedQuestions(userId:string,query:GetDetailedQuestionsQuery,session?:ClientSession)
  getAllocatedQuestionsByID(questionId?:string,userId?:string,session?:ClientSession)
}
