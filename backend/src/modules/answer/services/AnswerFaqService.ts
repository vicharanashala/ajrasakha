import 'reflect-metadata';
import { inject, injectable } from 'inversify';
import { ClientSession } from 'mongodb';
import { BaseService, MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { IAnswerRepository } from '#root/shared/database/interfaces/IAnswerRepository.js';
import { IAnswerFaqService } from '../interfaces/IAnswerFaqService.js';

/**
 * Service responsible for Golden FAQ operations.
 */
@injectable()
export class AnswerFaqService extends BaseService implements IAnswerFaqService {
  constructor(
    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async goldenFaq(
    userId: string,
    page: number,
    limit: number,
    search: string,
  ): Promise<{ faqs: any[]; totalFaqs: number }> {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.answerRepo.getGoldenFaqs(
        userId,
        page,
        limit,
        search,
        session,
      );
    });
  }
}
