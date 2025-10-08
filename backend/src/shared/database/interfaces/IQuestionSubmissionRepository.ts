import {
  IQuestionSubmission,
  ISubmissionHistroy,
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
    userSubmissionData: ISubmissionHistroy,
    session?: ClientSession,
  ): Promise<void>;
}
