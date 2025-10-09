import {IContextRepository} from '#root/shared/database/interfaces/IContextRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {IContext} from '#root/shared/interfaces/models.js';
import {InternalServerError, BadRequestError} from 'routing-controllers';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {dummyQuestions} from '../utils/questionGen.js';
import { QuestionService } from './QuestionService.js';

@injectable()
export class ContextService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.ContextRepository)
    private readonly contextRepo: IContextRepository,
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: QuestionService,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async addContext(
    userId: string,
    text: string,
  ): Promise<{insertedId: string}> {
    try {
      if (!text || text.trim().length === 0) {
        throw new BadRequestError('Context text required');
      }

      return this._withTransaction(async (session: ClientSession) => {
        const result = await this.contextRepo.addContext(text, session);

        const contextId = result.insertedId;

        // await this.questionService.addQuestions(
        //   userId,
        //   contextId,
        //   dummyQuestions,
        //   session,
        // );

        return result;
      });
    } catch (error) {
      throw new InternalServerError(`Failed to add context: ${error}`);
    }
  }

  async getById(contextId: string): Promise<IContext | null> {
    try {
      if (!contextId) {
        throw new BadRequestError('ContextId is required');
      }

      return this._withTransaction(async (session: ClientSession) => {
        const context = await this.contextRepo.getById(contextId, session);
        if (!context) {
          throw new BadRequestError(`Context with ID ${contextId} not found`);
        }
        return context;
      });
    } catch (error) {
      throw new InternalServerError(`Failed to get context: ${error}`);
    }
  }
}
