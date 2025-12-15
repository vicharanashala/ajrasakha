
import {IReRouteRepository} from '#root/shared/database/interfaces/IReRouteRepository.js'
import {
  IAnswer,
  IContext,
  IQuestion,
  IQuestionSubmission,
  IReview,
  IUser,
  QuestionStatus,
  IReroute
} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from 'routing-controllers';




export class ReRouteRepository implements IReRouteRepository {
 
  private ReRouteCollection: Collection<IReroute>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    
    this.ReRouteCollection = await this.db.getCollection<IReroute>('reroute');
  }

  async addrerouteAnswer(
    userId?: string,
    contextId?: string,
    question?: string,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();

   
      const rerouteDoc: IReroute = {
        _id: new ObjectId("665f1b2a9c1a4e8f0a111111"),
      
        answerId: new ObjectId("665f1b2a9c1a4e8f0a222222"),
        questionId: new ObjectId("665f1b2a9c1a4e8f0a333333"),
      
        reroutes: [
          {
            reroutedBy: new ObjectId("665f1b2a9c1a4e8f0a444444"),
            reroutedTo: new ObjectId("665f1b2a9c1a4e8f0a555555"),
            reroutedAt: new Date("2025-01-15T10:00:00Z"),
      
            status: "pending",
            comment: "Please review this answer",
      
            updatedAt: new Date("2025-01-15T10:00:00Z"),
          },
        ],
      
        createdAt: new Date("2025-01-15T10:00:00Z"),
        updatedAt: new Date("2025-01-15T10:00:00Z"),
      };

      
       
      const result = await this.ReRouteCollection.insertOne(rerouteDoc, {
        session,
      });

      return null;
    } catch (error) {
      throw new InternalServerError(`Error while adding question: ${error}`);
    }
  }

 

  
 

  

 
}
