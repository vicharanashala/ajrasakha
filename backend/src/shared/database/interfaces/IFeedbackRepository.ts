import { IFeedback } from '#root/shared/interfaces/models.js';
import { ClientSession } from 'mongodb';

export interface IFeedbackRepository {
  /**
   * Creates a new feedback entry in the feedbacks collection.
   * @param feedback - The feedback data to create
   * @param session - Optional MongoDB client session for transactions
   * @returns Promise resolving to the created feedback with its _id
   */
  create(
    feedback: Omit<IFeedback, '_id'>,
    session?: ClientSession,
  ): Promise<IFeedback>;

  /**
   * Finds feedbacks by question ID.
   * @param questionId - The question ID to search for
   * @param session - Optional MongoDB client session for transactions
   * @returns Promise resolving to array of feedbacks
   */
  findByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<IFeedback[]>;

  /**
   * Finds a feedback by its ID.
   * @param feedbackId - The feedback ID
   * @param session - Optional MongoDB client session for transactions
   * @returns Promise resolving to the feedback or null if not found
   */
  findById(
    feedbackId: string,
    session?: ClientSession,
  ): Promise<IFeedback | null>;

  updateFeedbackAction(feedbackId: string, action: 'accept' | 'reject', reason: string, processedBy: string): Promise<void>;
}