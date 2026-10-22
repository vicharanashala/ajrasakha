import type {DuplicateService} from '../services/DuplicateService.js';

/**
 * Public surface of {@link DuplicateService}, derived from the class so the
 * return types never have to be hand-restated. QuestionService injects this and
 * delegates the duplicate-detection methods to it.
 */
export type IDuplicateService = Pick<
  DuplicateService,
  'checkDuplicateQuestion' | 'manualCheckDuplicate'
>;
