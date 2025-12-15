import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {
  IQuestion,
  IQuestionSubmission,
  ISubmissionHistory,
  IAnswer,
  INotificationType,
  IQuestionPriority,
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from 'routing-controllers';

import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {IReRouteRepository}from '#root/shared/database/interfaces/IReRouteRepository.js'


@injectable()
export class ReRouteService extends BaseService {
  constructor(
  

    


    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,

    @inject(GLOBAL_TYPES.ReRouteRepository)
    private readonly reRouteRepository: IReRouteRepository,
    
  ) {
    super(mongoDatabase);
  }

  async addrerouteAnswer(
    userId?: string,
    contextId?: string,
    questions?: string[],
    session?: ClientSession,
  ) {
    try {
      await this.reRouteRepository.addrerouteAnswer(
        
      );

     

      
    } catch (error) {
      throw new InternalServerError(`Failed to add questions: ${error}`);
    }
  }

 

  
}
