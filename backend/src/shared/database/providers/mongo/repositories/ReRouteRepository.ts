
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
  
 async getAllocatedQuestions(userId: string, session?: ClientSession) {
   try {
    await this.init()
    const result =await this.ReRouteCollection.aggregate([
      // 1️⃣ Match reroutes where expert exists
      {
        $match: {
          'reroutes.reroutedTo': new ObjectId(userId),
        },
      },

      // 2️⃣ Extract latest reroute for this expert
      {
        $addFields: {
          latestReroute: {
            $last: {
              $filter: {
                input: '$reroutes',
                as: 'r',
                cond: {
                  $eq: ['$$r.reroutedTo', new ObjectId(userId)],
                },
              },
            },
          },
        },
      },

      // 3️⃣ Lookup moderator
      {
        $lookup: {
          from: 'users',
          localField: 'latestReroute.reroutedBy',
          foreignField: '_id',
          as: 'moderator',
          pipeline: [
            {
              $project: {
                _id: { $toString: '$_id' },
                email: 1,
                firstName: 1,
                lastName: 1,
              },
            },
          ],
        },
      },
      { $unwind: '$moderator' },

      // 4️⃣ Lookup question
      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'question',
          pipeline: [
            {
              $project: {
                _id: { $toString: '$_id' },
                question: 1,
                status: 1,
                details:1,
                createdAt:1,
                priority:1
              },
            },
          ],
        },
      },
      { $unwind: '$question' },

      // 5️⃣ Lookup answer (FULL document)
      {
        $lookup: {
          from: 'answers',
          localField: 'answerId',
          foreignField: '_id',
          as: 'answer',
        },
      },
      { $unwind: '$answer' },

      // 6️⃣ Final projection (convert remaining ObjectIds)
      {
        $project: {
          _id: 0,

          rerouteId: { $toString: '$_id' },

          reroute: {
            status: '$latestReroute.status',
            comment: '$latestReroute.comment',
            reroutedAt: '$latestReroute.reroutedAt',
            updatedAt: '$latestReroute.updatedAt',
            reroutedBy: { $toString: '$latestReroute.reroutedBy' },
            reroutedTo: { $toString: '$latestReroute.reroutedTo' },
            answerId: {
              $cond: [
                { $ifNull: ['$latestReroute.answerId', false] },
                { $toString: '$latestReroute.answerId' },
                null,
              ],
            },
          },

          moderator: 1,

          question: 1,
          text:'$question.question',
          status: "$question.status",
                details:"$question.details",
                createdAt:"$question.createdAt",
                priority:"$question.priority",
                id:"$question._id",

          answer: {
            _id: { $toString: '$answer._id' },
            questionId: { $toString: '$answer.questionId' },
            authorId: { $toString: '$answer.authorId' },
            answerIteration: 1,
            approvalCount: 1,
            isFinalAnswer: 1,
            remarks: 1,
            approvedBy: {
              $cond: [
                { $ifNull: ['$answer.approvedBy', false] },
                { $toString: '$answer.approvedBy' },
                null,
              ],
            },
            status: 1,
            answer: 1,
            reRouted: 1,
            modifications: 1,
            sources: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      },
    ]).toArray()
    return result
   } catch (error) {
    throw new InternalServerError(`Error while Fetching Questions: ${error}`);
   }
 }

  

 
}
