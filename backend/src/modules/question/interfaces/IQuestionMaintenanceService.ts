import type {QuestionMaintenanceService} from '../services/QuestionMaintenanceService.js';

/**
 * Public surface of {@link QuestionMaintenanceService}. QuestionService injects this
 * and delegates the admin / maintenance / normalization methods to it.
 */
export type IQuestionMaintenanceService = Pick<
  QuestionMaintenanceService,
  | 'normalizeQuestionState'
  | 'normalizeQuestionDistricts'
  | 'findUnknownQuestionGeo'
  | 'sendDelayedNotifications'
  | 'backfillEmptyEmbeddings'
  | 'backgroundProcessAction'
  | 'removeSubmissionHistoryEntry'
  | 'removeSubmissionQueueEntry'
  | 'addSubmissionQueueEntry'
  | 'addSubmissionHistoryEntry'
  | 'setNormalizedDomains'
  | 'getClosedAnswerMismatch'
  | 'backfillClosedModeratorIds'
>;
