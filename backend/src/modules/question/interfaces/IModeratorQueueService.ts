import type {ModeratorQueueService} from '../services/ModeratorQueueService.js';

/**
 * Public surface of {@link ModeratorQueueService}. QuestionService injects this and
 * delegates the moderator-queue assignment cron to it.
 */
export type IModeratorQueueService = Pick<
  ModeratorQueueService,
  'runModeratorQueueCron'
>;
