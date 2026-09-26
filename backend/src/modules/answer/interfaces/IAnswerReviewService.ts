import type { ReviewAnswerBody } from '../classes/validators/AnswerValidator.js';

/**
 * Interface defining answer review workflows for experts, PAE experts, and rerouted questions.
 */
export interface IAnswerReviewService {
  reviewAnswer(
    userId: string,
    body: ReviewAnswerBody,
  ): Promise<{ message: string }>;

  reRouteReviewAnswer(
    userId: string,
    body: ReviewAnswerBody,
  ): Promise<{ message: string }>;
}
