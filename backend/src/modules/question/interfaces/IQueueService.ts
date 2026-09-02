import type {QueueService} from '../services/QueueService.js';

/**
 * Public surface of {@link QueueService}, derived from the class so the return
 * types never have to be hand-restated. QuestionService injects this and
 * delegates the queue-details rendering methods to it.
 */
export type IQueueService = Pick<
  QueueService,
  'getQueueSection' | 'getQueueDetails'
>;
