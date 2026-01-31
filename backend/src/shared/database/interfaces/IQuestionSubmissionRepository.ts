import {GetHeatMapQuery} from '#root/modules/core/classes/validators/DashboardValidators.js';
import {
  IQuestionSubmission,
  IReviewerHeatmapRow,
  ISubmissionHistory,
} from '#root/shared/interfaces/models.js';
import {ClientSession, ObjectId} from 'mongodb';
import {ExpertReviewLevelDto} from '#root/modules/core/classes/validators/UserValidators.js';
import {IReviewWiseStats} from '#root/utils/getDailyStats.js';
import { HistoryItem } from '#root/modules/question/classes/validators/QuestionVaidators.js';

export interface IQuestionSubmissionRepository {
  /**
   * Insert a new question submission
   * @param submission IQuestionSubmission object
   * @param session Optional MongoDB session for transaction
   */
  addSubmission(
    submission: IQuestionSubmission,
    session?: ClientSession,
  ): Promise<IQuestionSubmission>;
  /**
   * update submission
   * @param questionId
   * @param userSubmissionData
   * @param session Optional MongoDB session for transaction
   */
  update(
    questionId: string,
    userSubmissionData: ISubmissionHistory,
    session?: ClientSession,
  ): Promise<void>;

  /**
   * update submission history
   * @param questionId
   * @param userId
   * @param updatedDoc
   * @param session Optional MongoDB session for transaction
   */
  updateHistoryByUserId(
    questionId: string,
    userId: string,
    updatedDoc: Partial<ISubmissionHistory>,
    session?: ClientSession,
  ): Promise<void>;

  /**
   * update submission history
   * @param questionId
   * @param session Optional MongoDB session for transaction
   */
  getDetailedSubmissionHistory(
    questionId: string,
    session?: ClientSession,
  ): Promise<HistoryItem[]>;

  /**
   * allocateExperts (push expertIds to queue)
   * @param questionId
   * @param expertIds
   * @param session Optional MongoDB session for transaction
   */
  allocateExperts(
    questionId: string,
    expertIds: ObjectId[],
    session?: ClientSession,
  ): Promise<IQuestionSubmission>;

  /**
   * allocateExperts (push expertIds to queue)
   * @param questionId
   * @param index
   * @param session Optional MongoDB session for transaction
   */
  removeExpertFromQueuebyIndex(
    questionId: string,
    index: number,
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null>;

  /**
   * allocateExperts (push expertIds to queue)
   * @param questionId
   * @param queue
   * @param session Optional MongoDB session for transaction
   */
  updateQueue(
    questionId: string,
    queue: ObjectId[],
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null>;

  /**
   * allocateExperts (push expertIds to queue)
   * @param questionId
   * @param expertIds
   * @param session Optional MongoDB session for transaction
   */
  getByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null>;

  /**
   * to get count of what level review level passed
   */
  getReviewWiseCount(): Promise<IReviewWiseStats>;

  /**
   * @param questionId
   * @param session Optional MongoDB session for transaction
   */

  deleteByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<void>;

  heatMapResultsForReviewer(
    query: GetHeatMapQuery,
  ): Promise<IReviewerHeatmapRow[] | null>;

  /**
   * @param userId - Userid of the expeet
   * @param session Optional MongoDB session for transaction
   */
  getUserActivityHistory(
    userId: string,
    page: number,
    limit: number,
    dateRange?: {from: string; to: string},
    session?: ClientSession,
    selectedHistoryId?: string | undefined,
  );
  getUserReviewLevel(query: ExpertReviewLevelDto): Promise<any>;
  getModeratorReviewLevel(query: ExpertReviewLevelDto): Promise<any>;

  getAbsentSubmissions(absentExpertIds:string[],session?:ClientSession):Promise<IQuestionSubmission[]>
  findQuestionsNeedingEscalation(limit?:number,session?:ClientSession):Promise<IQuestionSubmission[]>
  updateById(id?:string,update?:any,session?:any)
}
