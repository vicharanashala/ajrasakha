import type {FeedbackService} from '../services/FeedbackService.js';

/**
 * Public surface of {@link FeedbackService}, derived from the class so the
 * (partly inline) return types never have to be hand-restated. QuestionService
 * injects this and delegates the feedback-review methods to it.
 */
export type IFeedbackService = Pick<
  FeedbackService,
  | 'getQuestionFeedback'
  | 'allocateFeedbackQuestions'
  | 'handleFeedbackAction'
  | 'getFeedbackQueueDetails'
  | 'getFeedbackTimeline'
  | 'getAssignableFeedbackReviewers'
  | 'assignFeedbackReviewerManually'
  | 'removeFeedbackReviewer'
  | 'getFeedbacks'
  | 'handleFeedbackStatusUpdate'
>;
