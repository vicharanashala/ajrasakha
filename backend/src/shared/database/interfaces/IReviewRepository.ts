import {
  IReview,
  IReviewParmeters,
  ReviewAction,
  ReviewType,
} from '#root/shared/interfaces/models.js';
import {ClientSession, ObjectId} from 'mongodb';

export interface IReviewRepository {
  /**
   * Creates a new review entry.
   *
   * @param reviewType - Indicates whether the review is for a question or an answer.
   * @param action - The decision taken by the reviewer (accepted, rejected, modified).
   * @param questionId - The ID of the question being reviewed.
   * @param reviewerId - The ID of the reviewer performing the review.
   * @param answerId - Optional ID of the answer being reviewed (required only for answer-level reviews).
   * @param reason - Optional reason for rejection or modification.
   * @param parameters - Optional structured review metadata or scoring details.
   * @param session - Optional MongoDB client session for transactional operations.
   *
   * @returns A promise that resolves to an object containing the newly inserted review ID.
   */
  createReview(
    reviewType: ReviewType,
    action: ReviewAction,
    questionId: string,
    reviewerId: string,
    answerId?: string,
    reason?: string,
    parameters?: IReviewParmeters,
    reRoutedReview?:boolean,
    session?: ClientSession,
  ): Promise<{insertedId: string}>;

  /**
   * Retrieves all review entries associated with a specific answer.
   * @param answerId - The ID of the answer whose reviews are to be fetched.
   * @returns A promise that resolves to an array of review objects.
   */
  getReviewsByAnswerId(answerId: string | ObjectId): Promise<IReview[]>;

  /**
   * Retrieves all reviews performed by a specific reviewer.
   * @param reviewerId - The ID of the reviewer.
   * @returns A promise that resolves to an array of reviews performed by the reviewer.
   */
  getReviewsByReviewer(reviewerId: string | ObjectId): Promise<IReview[]>;

  /**
   * Retrieves all review entries for a given question.
   * This is typically used for question-level moderation workflows.
   * @param questionId - The ID of the question whose reviews need to be fetched.
   * @returns A promise that resolves to an array of reviews for the question.
   */
  getReviewsByQuestionId(questionId: string | ObjectId): Promise<IReview[]>;

  /**
   * Finds a specific review entry by its ID.
   * @param id - The unique ID of the review to fetch.
   * @returns A promise that resolves to the review object if found, else null.
   */
  findById(id: string | ObjectId): Promise<IReview | null>;
}
