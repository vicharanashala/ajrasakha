import {
  IQuestionSubmission,
  ISubmissionHistory,
} from '#root/shared/interfaces/models.js';
import {ClientSession, ObjectId} from 'mongodb';

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
   * @param questionId
   * @param session Optional MongoDB session for transaction
   */

  deleteByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<void>;
}
