import type { ClientSession } from 'mongodb';
import type { IAnswer, SourceItem } from '#root/shared/interfaces/models.js';
import type { IAnswerReviewService } from './IAnswerReviewService.js';
import type { IAnswerApprovalService } from './IAnswerApprovalService.js';
import type { IAnswerSubmissionService } from './IAnswerSubmissionService.js';
import type { IAnswerAiService } from './IAnswerAiService.js';
import type { IAnswerFaqService } from './IAnswerFaqService.js';

/**
 * Main Answer Service interface, combining sub-service surfaces and core CRUD operations.
 */
export interface IAnswerService
  extends IAnswerReviewService,
    Pick<
      IAnswerApprovalService,
      'approveAnswer' | 'approveLLMAnswer' | 'confirmDuplicate'
    >,
    IAnswerSubmissionService,
    IAnswerAiService,
    IAnswerFaqService {
  addAnswer(
    questionId: string,
    authorId: string,
    answer: string,
    sources: SourceItem[],
    session?: ClientSession,
    status?: string,
    remarks?: string,
    type?: string,
  ): Promise<{ insertedId: string; isFinalAnswer: boolean }>;

  deleteAnswer(
    questionId: string,
    answerId: string,
  ): Promise<{ deletedCount: number }>;

  incrementApprovalCount(
    answerId: string,
    session?: ClientSession,
  ): Promise<number>;

  getAnswerById(answerId: string): Promise<IAnswer>;
}
