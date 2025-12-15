
import {IReRouteRepository} from '#root/shared/database/interfaces/IReRouteRepository.js'
import {
  IAnswer,
  IContext,
  IQuestion,
  IQuestionSubmission,
  IReview,
  IUser,
  QuestionStatus,
  IReroute,
  IRerouteHistory
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
    payload:IReroute,
    session?: ClientSession,
  ): Promise<string> {
    try {
      await this.init();
      const result = await this.ReRouteCollection.insertOne(payload,session)
      return result.insertedId.toString()
    } catch (error) {
      throw new InternalServerError(`Error while adding question: ${error}`);
    }
  }

  async pushRerouteHistory(
  rerouteId: string,
  history: IRerouteHistory,
  updatedAt: Date,
  session?: ClientSession,
): Promise<void> {
  try {
    await this.init();

    await this.ReRouteCollection.updateOne(
      { _id: new ObjectId(rerouteId) },
      {
        $push: { reroutes: history },
        $set: { updatedAt },
      },
      { session },
    );
  } catch (error) {
    throw new InternalServerError(
      `Error while pushing reroute history: ${error}`,
    );
  }
}


 
  async findByQuestionId(questionId: string, session?: ClientSession): Promise<IReroute> {
    try {
      await this.init()
      const reroute = await this.ReRouteCollection.findOne({questionId:new ObjectId(questionId)})
      return reroute
    } catch (error) {
      throw new InternalServerError(`Error while Finding Reroute: ${error}`);
    }
  }
  
 

  

 
}
