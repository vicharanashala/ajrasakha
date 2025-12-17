import {IReRouteRepository} from '#root/shared/database/interfaces/IReRouteRepository.js';
import {
  IAnswer,
  IContext,
  IQuestion,
  IQuestionSubmission,
  IReview,
  IUser,
  QuestionStatus,
  IReroute,
  IRerouteHistory,
  RerouteStatus,
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
import {GetDetailedQuestionsQuery} from '#root/modules/core/classes/validators/QuestionValidators.js';

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
    payload: IReroute,
    session?: ClientSession,
  ): Promise<string> {
    try {
      await this.init();
      const result = await this.ReRouteCollection.insertOne(payload, session);
      return result.insertedId.toString();
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
        {_id: new ObjectId(rerouteId)},
        {
          $push: {reroutes: history},
          $set: {updatedAt},
        },
        {session},
      );
    } catch (error) {
      throw new InternalServerError(
        `Error while pushing reroute history: ${error}`,
      );
    }
  }

  async findByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<IReroute> {
    try {
      await this.init();
      const reroute = await this.ReRouteCollection.findOne({
        questionId: new ObjectId(questionId),
      });
      return reroute;
    } catch (error) {
      throw new InternalServerError(`Error while Finding Reroute: ${error}`);
    }
  }

  async getAllocatedQuestions(
    userId: string,
    query: GetDetailedQuestionsQuery,
    session?: ClientSession,
  ) {
    try {
      await this.init();

      const safePage = query.page && query.page > 0 ? query.page : 1;
      const safeLimit = query.limit && query.limit > 0 ? query.limit : 10;
      const skip = (safePage - 1) * safeLimit;

      const sortStage =
        query.filter === 'oldest'
          ? {'latestReroute.reroutedAt': 1}
          : {'latestReroute.reroutedAt': -1}; // newest default

      const pipeline = [
        // 1️⃣ Match reroutes assigned to expert
        {
          $match: {
            reroutes: {
              $elemMatch: {
                reroutedTo: new ObjectId(userId),
                status: "pending",
              },
            },
          },
        },


        // 2️⃣ Get latest reroute for this expert
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

        // 3️⃣ Sort
        {$sort: sortStage},

        // 4️⃣ Facet → data + totalCount
        {
          $facet: {
            data: [
              {$skip: skip},
              {$limit: safeLimit},

              // Lookup moderator
              {
                $lookup: {
                  from: 'users',
                  localField: 'latestReroute.reroutedBy',
                  foreignField: '_id',
                  as: 'moderator',
                  pipeline: [
                    {
                      $project: {
                        _id: {$toString: '$_id'},
                        email: 1,
                        firstName: 1,
                        lastName: 1,
                      },
                    },
                  ],
                },
              },
              {$unwind: '$moderator'},

              // Lookup question
              {
                $lookup: {
                  from: 'questions',
                  localField: 'questionId',
                  foreignField: '_id',
                  as: 'question',
                  pipeline: [
                    {
                      $project: {
                        _id: {$toString: '$_id'},
                        question: 1,
                        status: 1,
                        details: 1,
                        createdAt: 1,
                        priority: 1,
                      },
                    },
                  ],
                },
              },
              {$unwind: '$question'},

              // Lookup answer
              {
                $lookup: {
                  from: 'answers',
                  localField: 'answerId',
                  foreignField: '_id',
                  as: 'answer',
                },
              },
              {$unwind: '$answer'},

              // Final projection
              {
                $project: {
                  _id: 0,
                  rerouteId: {$toString: '$_id'},

                  reroute: {
                    status: '$latestReroute.status',
                    comment: '$latestReroute.comment',
                    reroutedAt: '$latestReroute.reroutedAt',
                    updatedAt: '$latestReroute.updatedAt',
                    reroutedBy: {$toString: '$latestReroute.reroutedBy'},
                    reroutedTo: {$toString: '$latestReroute.reroutedTo'},
                  },

                  moderator: 1,
                  question: 1,
                  text: '$question.question',
                  status: '$question.status',
                  details: '$question.details',
                  createdAt: '$question.createdAt',
                  priority: '$question.priority',
                  id: '$question._id',

                  answer: {
                    _id: {$toString: '$answer._id'},
                    questionId: {$toString: '$answer.questionId'},
                    authorId: {$toString: '$answer.authorId'},
                    answerIteration: 1,
                    approvalCount: 1,
                    isFinalAnswer: 1,
                    remarks: 1,
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
            ],

            totalCount: [{$count: 'count'}],
          },
        },
      ];

      const [aggResult] = await this.ReRouteCollection.aggregate(pipeline, {
        session,
      }).toArray();

      const totalCount = aggResult?.totalCount?.[0]?.count ?? 0;

      return {
        totalCount,
        page: safePage,
        totalPages: Math.ceil(totalCount / safeLimit),
        // limit: safeLimit,
        data: aggResult?.data ?? [],
      };
    } catch (error) {
      throw new InternalServerError(`Error while Fetching Questions: ${error}`);
    }
  }

  async rejectRerouteRequest(
    rerouteId: string,
    reason: string,
    session?: ClientSession,
  ): Promise<number> {
    try {
      await this.init();
      const reroute = await this.ReRouteCollection.findOne(
        {_id: new ObjectId(rerouteId)},
        {session},
      );
      if (!reroute) {
        throw new NotFoundError('Re route not found');
      }
      const latestReroute = await this.ReRouteCollection.findOne(
        {_id: new ObjectId(rerouteId)},
        {projection: {reroutes: {$slice: -1}}, session},
      );
      const last = latestReroute?.reroutes?.[0];
      if (!last) {
        if (!reroute) {
          throw new NotFoundError('Last Re route not found');
        }
      }
      const result = await this.ReRouteCollection.updateOne(
        {
          _id: new ObjectId(rerouteId),
          'reroutes.updatedAt': last.updatedAt,
        },
        {
          $set: {
            'reroutes.$.status': 'expert_rejected',
            'reroutes.$.updatedAt': new Date(),
            'reroutes.$.rejectionReason': reason,
            updatedAt: new Date(),
          },
        },
        {session},
      );
      return result.modifiedCount;
    } catch (error) {
      throw new InternalServerError(
        `Error while Rejecting re-route request: ${error}`,
      );
    }
  }

  async getRerouteHistory(answerId: string, session?: ClientSession) {
    try {
      await this.init();
      const pipeline = [
        // 1️⃣ Match reroute
        {
  $match: {
    $or: [
      { answerId: new ObjectId(answerId) },
      { answerId: answerId },
    ],
  },
},

        // 2️⃣ Lookup Question
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'question',
          },
        },
        {$unwind: '$question'},

        // 3️⃣ Unwind reroutes array
        {
          $unwind: '$reroutes',
        },

        // 4️⃣ Lookup Moderator (reroutedBy)
        {
          $lookup: {
            from: 'users',
            localField: 'reroutes.reroutedBy',
            foreignField: '_id',
            as: 'reroutedByUser',
          },
        },
        {
          $unwind: {
            path: '$reroutedByUser',
            preserveNullAndEmptyArrays: true,
          },
        },

        // 5️⃣ Lookup Expert (reroutedTo)
        {
          $lookup: {
            from: 'users',
            localField: 'reroutes.reroutedTo',
            foreignField: '_id',
            as: 'reroutedToUser',
          },
        },
        {
          $unwind: {
            path: '$reroutedToUser',
            preserveNullAndEmptyArrays: true,
          },
        },

        // 6️⃣ Lookup Answer (optional)
        {
          $lookup: {
            from: 'answers',
            localField: 'reroutes.answerId',
            foreignField: '_id',
            as: 'answer',
          },
        },
        {
          $unwind: {
            path: '$answer',
            preserveNullAndEmptyArrays: true,
          },
        },

        // 7️⃣ Group back reroutes
        {
          $group: {
            _id: '$_id',
            question: {$first: '$question'},
            answerId: {$first: '$answerId'},
            questionId: {$first: '$questionId'},
            createdAt: {$first: '$createdAt'},
            updatedAt: {$first: '$updatedAt'},

            reroutes: {
              $push: {
                reroutedAt: '$reroutes.reroutedAt',
                status: '$reroutes.status',
                rejectionReason: '$reroutes.rejectionReason',
                comment: '$reroutes.comment',
                updatedAt: '$reroutes.updatedAt',

                reroutedBy: {
                  _id: {$toString: '$reroutedByUser._id'},
                  email: '$reroutedByUser.email',
                  firstName: '$reroutedByUser.firstName',
                  lastName: '$reroutedByUser.lastName',
                  role: '$reroutedByUser.role',
                  reputation_score: '$reroutedByUser.reputation_score',
                },

                reroutedTo: {
                  _id: {$toString: '$reroutedToUser._id'},
                  email: '$reroutedToUser.email',
                  firstName: '$reroutedToUser.firstName',
                  lastName: '$reroutedToUser.lastName',
                  role: '$reroutedToUser.role',
                  reputation_score: '$reroutedToUser.reputation_score',
                },

                answer: {
                  _id: {$toString: '$answer._id'},
                  answer: '$answer.answer',
                  status: '$answer.status',
                  isFinalAnswer: '$answer.isFinalAnswer',
                  sources: '$answer.sources',
                  createdAt: '$answer.createdAt',
                },
              },
            },
          },
        },

        // 8️⃣ Final shape + ObjectId → string
        {
          $project: {
            _id: {$toString: '$_id'},
            questionId: {$toString: '$questionId'},
            createdAt: 1,
            updatedAt: 1,

            question: {
              _id: {$toString: '$question._id'},
              question: '$question.question',
              text: '$question.text',
              priority: '$question.priority',
              status: '$question.status',
              details: '$question.details',
              totalAnswersCount: '$question.totalAnswersCount',
              createdAt: '$question.createdAt',
            },

            reroutes: 1,
          },
        },
      ];
      const result = await this.ReRouteCollection.aggregate(pipeline, {
        session,
      }).toArray();
      return result;
    } catch (error) {
      throw new InternalServerError(`Error while loading re-routes: ${error}`);
    }
  }
  async getAllocatedQuestionsByID(
    questionId?:string,
    userId?:string,
    session?: ClientSession,
    
  ): Promise<any[]> {
    try {
      await this.init();
      const result =await this.ReRouteCollection.aggregate([
        {
        $match: {
        'questionId': new ObjectId(questionId),
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
        id: { $toString: '$id' },
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
        id: { $toString: '$id' },
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
        id: { $toString: '$answer.id' },
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
        ],session).toArray()
        return result
        } catch (error) {
        throw new InternalServerError('eroor while fetching question details');
        }
        

      
      
      };
    
  async updateStatus(questionId:string,expertId:string,status:RerouteStatus,answerId?:string,moderatorRejectedReason?:string,session?:ClientSession){
    try {
      await this.init()
  const questionObjectId = new ObjectId(questionId);
  const expertObjectId = new ObjectId(expertId);

  /**
   * Step 1: Fetch only reroutes for this question
   */
  const rerouteDoc = await this.ReRouteCollection.findOne(
    {
      questionId: questionObjectId,
      'reroutes.reroutedTo': expertObjectId,
    },
    {
      projection: { reroutes: 1 },session
    },
  );

  if (!rerouteDoc || !rerouteDoc.reroutes?.length) {
    throw new Error('No reroute found for this expert and question');
  }
   let latestIndex = -1;
  let latestTime = 0;

  rerouteDoc.reroutes.forEach((reroute: any, index: number) => {
    if (String(reroute.reroutedTo) !== String(expertObjectId)) return;

    const time = new Date(
      reroute.reroutedAt ?? reroute.updatedAt,
    ).getTime();

    if (time > latestTime) {
      latestTime = time;
      latestIndex = index;
    }
  });

  if (latestIndex === -1) {
    throw new Error('No matching reroute history found');
  }
  let updateSet: Record<string, any> = {
    [`reroutes.${latestIndex}.status`]: status,
    [`reroutes.${latestIndex}.updatedAt`]: new Date(),
    updatedAt: new Date(),
  };
  if(answerId){
    updateSet[`reroutes.${latestIndex}.answerId`]= new ObjectId(answerId)
  }
  if(moderatorRejectedReason){
    updateSet[`reroutes.${latestIndex}.moderatorRejectionReason`]= moderatorRejectedReason
  }

  const result = await this.ReRouteCollection.updateOne(
    { questionId: questionObjectId },
    { $set: updateSet },
    {session}
  );

  if (result.matchedCount === 0) {
    throw new Error('Failed to update reroute status');
  }
  return result
    } catch (error) {
      throw new InternalServerError('eroor while fetching question details');
    }
  }
}
