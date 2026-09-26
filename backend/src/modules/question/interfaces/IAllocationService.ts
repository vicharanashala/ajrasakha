import type {AllocationService} from '../services/AllocationService.js';

/**
 * Public surface of {@link AllocationService}, derived from the class. QuestionService
 * injects this and delegates the expert-allocation / workload-balancing methods.
 */
export type IAllocationService = Pick<
  AllocationService,
  | 'autoAllocateExperts'
  | 'toggleAutoAllocate'
  | 'allocateExperts'
  | 'bulkAllocatePaeExperts'
  | 'removeExpertFromQueue'
  | '_removeExpertFromQueue'
  | 'replaceQueueExpert'
  | 'runAbsentScript'
  | 'findAbsentExperts'
  | 'cleanupQuestionSubmissions'
  | 'balanceWorkload_copy'
  | 'balanceWorkload'
  | 'getReallocationPreview'
  | 'manualReallocate'
  | 'balanceWorkloadSelectedQuestions'
  | 'reallocateTimeBoundQuestions'
  | 'reallocateManualQuestions'
>;
