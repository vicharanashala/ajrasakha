import 'reflect-metadata';
import { inject, injectable } from 'inversify';
import { ClientSession } from 'mongodb';
import { BaseService, MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { appConfig } from '#root/config/app.js';
import {
  IAnswer,
  IQuestionMetrics,
  QuestionStatus,
  SourceItem,
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  NotFoundError,
} from 'routing-controllers';
import { IAnswerRepository } from '#root/shared/database/interfaces/IAnswerRepository.js';
import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { AiService } from '#root/modules/ai/services/AiService.js';
import {
  FetchAiInitialAnswerBody,
  ReviewAnswerBody,
  SubmissionResponse,
  UpdateAnswerBody,
} from '../classes/validators/AnswerValidator.js';
import { IAnswerService } from '../interfaces/IAnswerService.js';
import { IAnswerReviewService } from '../interfaces/IAnswerReviewService.js';
import { IAnswerApprovalService } from '../interfaces/IAnswerApprovalService.js';
import { IAnswerSubmissionService } from '../interfaces/IAnswerSubmissionService.js';
import { IAnswerAiService } from '../interfaces/IAnswerAiService.js';
import { IAnswerFaqService } from '../interfaces/IAnswerFaqService.js';

/**
 * Main AnswerService orchestrator and facade.
 * Houses core answer CRUD operations and delegates sub-domain workflows
 * to specialized sub-services (review, approval, submissions, AI, FAQ).
 */
@injectable()
export class AnswerService extends BaseService implements IAnswerService {
  constructor(
    @inject(CORE_TYPES.AIService)
    private readonly aiService: AiService,

    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,

    @inject(GLOBAL_TYPES.AnswerReviewService)
    private readonly answerReviewService: IAnswerReviewService,

    @inject(GLOBAL_TYPES.AnswerApprovalService)
    private readonly answerApprovalService: IAnswerApprovalService,

    @inject(GLOBAL_TYPES.AnswerSubmissionService)
    private readonly answerSubmissionService: IAnswerSubmissionService,

    @inject(GLOBAL_TYPES.AnswerAiService)
    private readonly answerAiService: IAnswerAiService,

    @inject(GLOBAL_TYPES.AnswerFaqService)
    private readonly answerFaqService: IAnswerFaqService,
  ) {
    super(mongoDatabase);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE ANSWER CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  async addAnswer(
    questionId: string,
    authorId: string,
    answer: string,
    sources: SourceItem[],
    session?: ClientSession,
    status?: string,
    remarks?: string,
    type?: string,
  ): Promise<{ insertedId: string; isFinalAnswer: boolean }> {
    const execute = async (activeSession: ClientSession) => {
      const question = await this.questionRepo.getById(
        questionId,
        activeSession,
      );
      if (!question) {
        throw new BadRequestError(`Question with ID ${questionId} not found`);
      }

      if (question.status === 'closed') {
        throw new BadRequestError(`Question is already closed`);
      }

      const isAlreadyResponded = await this.answerRepo.getByAuthorId(
        authorId,
        questionId,
        activeSession,
      );
      if (isAlreadyResponded && !type) {
        throw new BadRequestError('You’ve already submitted an answer!');
      }

      const isFinalAnswer = false;
      const metrics: IQuestionMetrics | null = null;

      const updatedAnswerCount = question.totalAnswersCount + 1;

      let textEmbedding: number[] = [];
      const ENABLE_AI_SERVER = appConfig.ENABLE_AI_SERVER;

      if (ENABLE_AI_SERVER) {
        const { embedding } = await this.aiService.getEmbedding(answer);
        textEmbedding = embedding;
      }

      const { insertedId } = await this.answerRepo.addAnswer(
        questionId,
        authorId,
        answer,
        sources,
        textEmbedding,
        isFinalAnswer,
        updatedAnswerCount,
        activeSession,
        status,
        remarks,
        type,
      );

      await this.questionRepo.updateQuestion(
        questionId,
        {
          totalAnswersCount: updatedAnswerCount,
          metrics,
        },
        activeSession,
      );

      return { insertedId, isFinalAnswer };
    };

    if (session) {
      return execute(session);
    }

    return this._withTransaction(async (newSession: ClientSession) =>
      execute(newSession),
    );
  }

  async getAnswerById(answerId: string): Promise<IAnswer> {
    return await this.answerRepo.getById(answerId);
  }

  async deleteAnswer(
    questionId: string,
    answerId: string,
  ): Promise<{ deletedCount: number }> {
    return this._withTransaction(async (session: ClientSession) => {
      const answer = await this.answerRepo.getById(answerId);
      if (!answer) {
        throw new BadRequestError(`Answer with ID ${answerId} not found`);
      }
      const question = await this.questionRepo.getById(questionId);

      if (!question) {
        throw new BadRequestError(`Question with ID ${questionId} not found`);
      }
      const updatedAnswerCount = question.totalAnswersCount - 1;

      const isFinalAnswer = answer.isFinalAnswer;

      await this.questionRepo.updateQuestion(
        questionId,
        {
          totalAnswersCount: updatedAnswerCount,
          status: isFinalAnswer ? 'open' : 'closed',
          ...(!isFinalAnswer && {
            paeValidation: 'pending',
            autoAllocatePaeValidationExpert: true,
          }),
        },
        session,
      );

      return this.answerRepo.deleteAnswer(answerId, session);
    });
  }

  async incrementApprovalCount(
    answerId: string,
    session?: ClientSession,
  ): Promise<number> {
    const answer = await this.answerRepo.getById(answerId);
    if (!answer) {
      throw new NotFoundError(
        `Failed to find answer while trying increment approvalcount!`,
      );
    }
    return await this.answerRepo.incrementApprovalCount(answerId, session);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELEGATED METHODS — REVIEW
  // ─────────────────────────────────────────────────────────────────────────────

  async reviewAnswer(
    userId: string,
    body: ReviewAnswerBody,
  ): Promise<{ message: string }> {
    return this.answerReviewService.reviewAnswer(userId, body);
  }

  async reRouteReviewAnswer(
    userId: string,
    body: ReviewAnswerBody,
  ): Promise<{ message: string }> {
    return this.answerReviewService.reRouteReviewAnswer(userId, body);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELEGATED METHODS — APPROVAL & CONFIRM
  // ─────────────────────────────────────────────────────────────────────────────

  async approveAnswer(
    userId: string,
    updates: UpdateAnswerBody,
  ): Promise<{ modifiedCount: number } | { insertedId: string }> {
    return this.answerApprovalService.approveAnswer(userId, updates);
  }

  async approveLLMAnswer(
    userId: string,
    updates: UpdateAnswerBody,
  ): Promise<{ modifiedCount: number }> {
    return this.answerApprovalService.approveLLMAnswer(userId, updates);
  }

  async confirmDuplicate(
    userId: string,
    questionId: string,
  ): Promise<{ status: QuestionStatus; closed: boolean }> {
    return this.answerApprovalService.confirmDuplicate(userId, questionId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELEGATED METHODS — SUBMISSIONS & HISTORY
  // ─────────────────────────────────────────────────────────────────────────────

  async getSubmissions(
    userId: string,
    page: number,
    limit: number,
    dateRange?: { from: string | undefined; to: string | undefined },
    selectedHistoryId?: string | undefined,
    expertId?: string | undefined,
  ): Promise<SubmissionResponse[]> {
    return this.answerSubmissionService.getSubmissions(
      userId,
      page,
      limit,
      dateRange,
      selectedHistoryId,
      expertId,
    );
  }

  async getFinalAnswerQuestions(
    userId: string,
    currentUserId: string,
    date: string,
    status: string,
  ): Promise<{
    finalizedSubmissions: any[];
  }> {
    return this.answerSubmissionService.getFinalAnswerQuestions(
      userId,
      currentUserId,
      date,
      status,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELEGATED METHODS — AI & FAQ
  // ─────────────────────────────────────────────────────────────────────────────

  async fetchAiInitialAnswer(body: FetchAiInitialAnswerBody): Promise<any> {
    return this.answerAiService.fetchAiInitialAnswer(body);
  }

  async goldenFaq(
    userId: string,
    page: number,
    limit: number,
    search: string,
  ): Promise<{ faqs: any[]; totalFaqs: number }> {
    return this.answerFaqService.goldenFaq(userId, page, limit, search);
  }
}
