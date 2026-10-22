import 'reflect-metadata';
import { inject, injectable } from 'inversify';
import { ClientSession } from 'mongodb';
import { BaseService, MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { IAnswerRepository } from '#root/shared/database/interfaces/IAnswerRepository.js';
import { IQuestionSubmissionRepository } from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { SubmissionResponse } from '../classes/validators/AnswerValidator.js';
import { IAnswerSubmissionService } from '../interfaces/IAnswerSubmissionService.js';

/**
 * Service responsible for answer submissions and activity history queries.
 */
@injectable()
export class AnswerSubmissionService extends BaseService implements IAnswerSubmissionService {
  constructor(
    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async getSubmissions(
    userId: string,
    page: number,
    limit: number,
    dateRange?: { from: string | undefined; to: string | undefined },
    selectedHistoryId?: string | undefined,
    expertId?: string | undefined,
  ): Promise<SubmissionResponse[]> {
    return await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId);
      // Moderator/admin viewing another user's activity history. Route by the
      // TARGET user's role (expert vs moderator pipelines differ), and never
      // expose an admin's history.
      if (expertId && (user.role === 'moderator' || user.role === 'admin')) {
        const target = await this.userRepo.findById(expertId);
        if (!target || target.role === 'admin') {
          return [];
        }
        if (target.role === 'moderator') {
          return await this.answerRepo.getModeratorActivityHistory(
            expertId,
            page,
            limit,
            dateRange,
            selectedHistoryId,
            session,
          );
        }
        return await this.questionSubmissionRepo.getUserActivityHistory(
          expertId,
          page,
          limit,
          dateRange,
          session,
          selectedHistoryId,
        );
      }
      if (user.role === 'expert') {
        return await this.questionSubmissionRepo.getUserActivityHistory(
          userId,
          page,
          limit,
          dateRange,
          session,
          selectedHistoryId,
        );
      } else if (user.role === 'moderator') {
        return await this.answerRepo.getModeratorActivityHistory(
          userId,
          page,
          limit,
          dateRange,
          selectedHistoryId,
          session,
        );
      }
    });
  }

  async getFinalAnswerQuestions(
    userId: string,
    currentUserId: string,
    date: string,
    status: string,
  ): Promise<{
    finalizedSubmissions: any[];
  }> {
    const { finalizedSubmissions } = await this.answerRepo.getAllFinalizedAnswers(
      userId,
      currentUserId,
      date,
      status,
    );
    return {
      finalizedSubmissions,
    };
  }
}
