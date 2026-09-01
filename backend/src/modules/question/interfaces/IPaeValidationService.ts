import type {PaeValidationService} from '../services/PaeValidationService.js';

/**
 * Public surface of {@link PaeValidationService}, derived from the class so the
 * (partly inline) return types never have to be hand-restated. QuestionService
 * injects this and delegates the PAE-validation methods to it.
 */
export type IPaeValidationService = Pick<
  PaeValidationService,
  | 'runPaeValidationQueueCron'
  | 'getPaeValidationTimeline'
  | 'assignPaeValidationReviewerManually'
  | 'removePaeValidationReviewer'
  | 'getPaeValidationAssignedQuestions'
  | 'processPaeValidation'
  | 'getPaeValidationQueueDetails'
>;
