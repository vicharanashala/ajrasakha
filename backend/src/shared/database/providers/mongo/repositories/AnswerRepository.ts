import {
  IAnswer,
  IQuestion,
  IUser,
  SourceItem,
  IQuestionSubmission,
} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {isValidObjectId} from '#root/utils/isValidObjectId.js';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {SubmissionResponse} from '#root/modules/core/classes/validators/AnswerValidators.js';
import {ModeratorApprovalRate} from '#root/modules/core/classes/validators/DashboardValidators.js';

export class AnswerRepository implements IAnswerRepository {
  private AnswerCollection: Collection<IAnswer>;
  private QuestionCollection: Collection<IQuestion>;
  private usersCollection!: Collection<IUser>;
  private QuestionSubmissionCollection: Collection<IQuestionSubmission>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.AnswerCollection = await this.db.getCollection<IAnswer>('answers');
    this.QuestionCollection = await this.db.getCollection<IQuestion>(
      'questions',
    );
    this.usersCollection = await this.db.getCollection<IUser>('users');
    this.QuestionSubmissionCollection =
      await this.db.getCollection<IQuestionSubmission>('question_submissions');
    await this.db.getCollection<IQuestionSubmission>('question_submissions');
  }

  async addAnswer(
    questionId: string,
    authorId: string,
    answer: string,
    sources: SourceItem[],
    embedding: number[],
    isFinalAnswer: boolean = false,
    answerIteration: number = 1,
    session?: ClientSession,
    status?: string,
    remarks?: string,
  ): Promise<{insertedId: string}> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }
      if (!authorId || !isValidObjectId(authorId)) {
        throw new BadRequestError('Invalid or missing authorId');
      }
      if (!answer || typeof answer !== 'string') {
        throw new BadRequestError('Answer must be a non-empty string');
      }

      const doc: IAnswer = {
        questionId: new ObjectId(questionId),
        authorId: new ObjectId(authorId),
        answer,
        isFinalAnswer,
        answerIteration,
        approvalCount: 0,
        remarks,
        status,
        embedding,
        sources,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await this.AnswerCollection.insertOne(doc, {session});

      return {insertedId: result.insertedId.toString()};
    } catch (error) {
      throw new InternalServerError(
        `Error while adding answer, More/ ${error}`,
      );
    }
  }

  async getByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<Partial<IAnswer>[]> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }

      const answers = await this.AnswerCollection.find(
        {questionId: new ObjectId(questionId)},
        {session},
      )
        .sort({createdAt: 1})
        .toArray();

      return answers.map(a => ({
        _id: a._id?.toString(),
        answer: a.answer,
        isFinalAnswer: a.isFinalAnswer,
        createdAt: a.createdAt,
      }));
    } catch (error) {
      throw new InternalServerError(`Failed to fetch answers, More/ ${error}`);
    }
  }
  async getById(answerId: string, session?: ClientSession): Promise<IAnswer> {
    try {
      await this.init();

      if (!answerId || !isValidObjectId(answerId)) {
        throw new BadRequestError('Invalid or missing answerId');
      }

      const answer = await this.AnswerCollection.findOne(
        {
          _id: new ObjectId(answerId),
        },
        {session},
      );
      return {
        ...answer,
        _id: answer._id?.toString(),
        questionId: answer.questionId?.toString(),
        authorId: answer.authorId?.toString(),
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch answers, More/ ${error}`);
    }
  }

  async getByAuthorId(
    authorId: string,
    questionId: string,
    session?: ClientSession,
  ): Promise<IAnswer | null> {
    try {
      await this.init();

      return await this.AnswerCollection.findOne(
        {
          authorId: new ObjectId(authorId),
          questionId: new ObjectId(questionId),
        },
        {session},
      );
    } catch (error) {
      throw new InternalServerError(`Failed to fetch answer, More/ ${error}`);
    }
  }

  async getAllSubmissions(
    userId: string,
    page: number,
    limit: number,
    session?: ClientSession,
  ): Promise<SubmissionResponse[]> {
    try {
      await this.init();
      const skip = (page - 1) * limit;
      const user = await this.usersCollection.findOne({
        _id: new ObjectId(userId),
      });
      const role = user.role;
      if (role === 'moderator') {
        const submissions = await this.AnswerCollection.aggregate([
          {$match: {approvedBy: new ObjectId(userId)}},
          {
            $lookup: {
              from: 'questions',
              localField: 'questionId',
              foreignField: '_id',
              as: 'question',
            },
          },

          {$unwind: {path: '$question', preserveNullAndEmptyArrays: true}},
          {
            $group: {
              _id: '$question._id',
              text: {$first: '$question.question'},
              createdAt: {$first: '$question.createdAt'},
              updatedAt: {$first: '$question.updatedAt'},
              totalAnswersCount: {$sum: 1},
              questionStatus: {$first: '$question.status'},
              responses: {
                $push: {
                  answer: '$answer',
                  id: {$toString: '$_id'},
                  isFinalAnswer: '$isFinalAnswer',
                  createdAt: '$createdAt',
                  answerStatus: '$status',
                },
              },
            },
          },
          {$match: {_id: {$ne: null}}},
          {$sort: {updatedAt: -1}},
          {$skip: skip},
          {$limit: limit},
        ]).toArray();
        return submissions.map(sub => ({
          id: sub._id.toString(),
          text: sub.text,
          createdAt: sub.createdAt.toISOString(),
          updatedAt: sub.updatedAt.toISOString(),
          totalAnwersCount: sub.totalAnswersCount,
          reponse: sub.responses[0] || [],
        }));
      } else {
        const submissions = await this.QuestionSubmissionCollection.aggregate([
          {
            $addFields: {
              historyArray: '$history',
            },
          },
          // 1️⃣ Unwind history to process each phase
          {$unwind: '$history'},

          // 2️⃣ Filter only phases performed by the current user

          {
            $match: {
              'history.updatedBy': new ObjectId(userId),
              $or: [
                // ✅ Include all except "in-review"
                {'history.status': {$ne: 'in-review'}},

                // ✅ Include "in-review" only if it has an answer / approvedAnswer / rejectedAnswer
                {
                  $and: [
                    {'history.status': 'in-review'},
                    {
                      $or: [
                        {'history.answer': {$exists: true, $ne: null}},
                        {'history.approvedAnswer': {$exists: true, $ne: null}},
                        {'history.rejectedAnswer': {$exists: true, $ne: null}},
                      ],
                    },
                  ],
                },
              ],
            },
          },

          // 3️⃣ Lookup question details
          {
            $lookup: {
              from: 'questions',
              localField: 'questionId',
              foreignField: '_id',
              as: 'question',
            },
          },
          {$unwind: {path: '$question', preserveNullAndEmptyArrays: true}},

          // 4️⃣ Lookup all related answers (answer, approvedAnswer, rejectedAnswer)
          {
            $lookup: {
              from: 'answers',
              let: {
                answerId: '$history.answer',
                approvedAnswerId: '$history.approvedAnswer',
                rejectedAnswerId: '$history.rejectedAnswer',
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $or: [
                        {$eq: ['$_id', '$$answerId']},
                        {$eq: ['$_id', '$$approvedAnswerId']},
                        {$eq: ['$_id', '$$rejectedAnswerId']},
                      ],
                    },
                  },
                },
                {
                  $project: {
                    _id: 1,
                    answer: 1,
                    sources: 1,
                    createdAt: 1,
                    status: 1,
                  },
                },
              ],
              as: 'answerDetails',
            },
          },

          // 5️⃣ Construct docs for each possible status
          {
            $project: {
              question: '$question',
              history: '$history',
              // 🟡 Newly created (updated) answer document
              updatedAnswerDoc: {
                $cond: [
                  {
                    $and: [
                      {$ifNull: ['$history.rejectedAnswer', false]}, // previous rejection exists
                      {$ifNull: ['$history.answer', false]}, // new answer created
                    ],
                  },
                  {
                    status: 'Answer Created',
                    answer: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$answerDetails',
                            as: 'a',
                            cond: {$eq: ['$$a._id', '$history.answer']},
                          },
                        },
                        0,
                      ],
                    },

                    // 🧩 Added: reasonForRejection (from either this or previous doc)
                    reasonForRejection: {
                      $cond: [
                        {
                          // CASE 1️⃣: current document has a reasonForRejection
                          $and: [
                            {$ne: ['$history.reasonForRejection', null]},
                            {$ne: ['$history.reasonForRejection', '']},
                          ],
                        },
                        '$history.reasonForRejection',

                        // CASE 2️⃣: fallback - find from previous history where answer == rejectedAnswer
                        {
                          $let: {
                            vars: {
                              matchedHistory: {
                                $filter: {
                                  input: '$historyArray',
                                  as: 'h',
                                  cond: {
                                    $eq: [
                                      '$$h.answer',
                                      '$history.rejectedAnswer',
                                    ],
                                  },
                                },
                              },
                            },
                            in: {
                              $ifNull: [
                                {
                                  $arrayElemAt: [
                                    {
                                      $filter: {
                                        input: {
                                          $map: {
                                            input: '$$matchedHistory',
                                            as: 'mh',
                                            in: '$$mh.reasonForRejection',
                                          },
                                        },
                                        as: 'r',
                                        cond: {
                                          $and: [
                                            {$ne: ['$$r', null]},
                                            {$ne: ['$$r', '']},
                                          ],
                                        },
                                      },
                                    },
                                    0,
                                  ],
                                },
                                null,
                              ],
                            },
                          },
                        },
                      ],
                    },
                  },
                  null,
                ],
              },

              // 🔴 Rejected answer document
              rejectedDoc: {
                $cond: [
                  {$ifNull: ['$history.rejectedAnswer', false]},
                  {
                    status: 'rejected',
                    reasonForRejection: {
                      $let: {
                        vars: {
                          matchedHistory: {
                            $filter: {
                              input: '$historyArray', // the full history array (kept before unwind)
                              as: 'h',
                              cond: {
                                $eq: ['$$h.answer', '$history.rejectedAnswer'],
                              },
                            },
                          },
                        },
                        in: {
                          $ifNull: [
                            {
                              $arrayElemAt: [
                                {
                                  $map: {
                                    input: '$$matchedHistory',
                                    as: 'mh',
                                    in: '$$mh.reasonForRejection',
                                  },
                                },
                                0,
                              ],
                            },
                            '$history.reasonForRejection',
                          ],
                        },
                      },
                    },
                    answer: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$answerDetails',
                            as: 'a',
                            cond: {$eq: ['$$a._id', '$history.rejectedAnswer']},
                          },
                        },
                        0,
                      ],
                    },
                  },
                  null,
                ],
              },

              // 🟢 Approved answer document
              approvedDoc: {
                $cond: [
                  {$ifNull: ['$history.approvedAnswer', false]},
                  {
                    status: 'approved',
                    answer: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$answerDetails',
                            as: 'a',
                            cond: {$eq: ['$$a._id', '$history.approvedAnswer']},
                          },
                        },
                        0,
                      ],
                    },
                  },
                  null,
                ],
              },

              // 🧩 For initial "answer created" or "reviewed"
              createdOrReviewedDoc: {
                $cond: [
                  {
                    $and: [
                      {$not: [{$ifNull: ['$history.rejectedAnswer', false]}]},
                      {$not: [{$ifNull: ['$history.approvedAnswer', false]}]},
                    ],
                  },
                  {
                    status: {
                      $cond: [
                        {
                          $eq: [
                            {$arrayElemAt: ['$queue', 0]},
                            new ObjectId(userId),
                          ],
                        },
                        'Answer Created',
                        '$history.status',
                      ],
                    },
                    answer: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$answerDetails',
                            as: 'a',
                            cond: {$eq: ['$$a._id', '$history.answer']},
                          },
                        },
                        0,
                      ],
                    },
                  },
                  null,
                ],
              },
            },
          },

          // 6️⃣ Combine all existing documents into one array
          {
            $project: {
              docs: {
                $setUnion: [
                  {$cond: [{$not: ['$approvedDoc']}, [], ['$approvedDoc']]},
                  {$cond: [{$not: ['$rejectedDoc']}, [], ['$rejectedDoc']]},
                  {
                    $cond: [
                      {$not: ['$updatedAnswerDoc']},
                      [],
                      ['$updatedAnswerDoc'],
                    ],
                  },
                  {
                    $cond: [
                      {$not: ['$createdOrReviewedDoc']},
                      [],
                      ['$createdOrReviewedDoc'],
                    ],
                  },
                ],
              },
              question: 1,
              history: 1,
            },
          },

          // 7️⃣ Unwind the combined docs array
          {$unwind: '$docs'},

          // 8️⃣ Final projection
          {
            $project: {
              _id: '$question._id',
              text: '$question.question',
              createdAt: '$question.createdAt',
              updatedAt: '$history.updatedAt',
              questionStatus: '$question.status',
              responses: [
                {
                  id: {$toString: '$docs.answer._id'},
                  answer: '$docs.answer.answer',
                  sources: '$docs.answer.sources',
                  status: '$docs.status',
                  reasonForRejection: '$docs.reasonForRejection',
                  createdAt: '$docs.answer.createdAt',
                  updatedAt: '$history.updatedAt',
                  answerStatus: '$docs.answer.status',
                },
              ],
            },
          },
          {
            $addFields: {
              answerUpdatedAt: {
                $ifNull: [
                  {$arrayElemAt: ['$responses.updatedAt', 0]},
                  '$updatedAt', // fallback to history.updatedAt
                ],
              },
              statusPriority: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $eq: [
                          {$arrayElemAt: ['$responses.status', 0]},
                          'Answer Created',
                        ],
                      },
                      then: 1,
                    },
                    {
                      case: {
                        $eq: [
                          {$arrayElemAt: ['$responses.status', 0]},
                          'approved',
                        ],
                      },
                      then: 2,
                    },
                    {
                      case: {
                        $eq: [
                          {$arrayElemAt: ['$responses.status', 0]},
                          'reviewed',
                        ],
                      },
                      then: 3,
                    },
                    {
                      case: {
                        $eq: [
                          {$arrayElemAt: ['$responses.status', 0]},
                          'rejected',
                        ],
                      },
                      then: 4,
                    },
                    {
                      case: {
                        $eq: [
                          {$arrayElemAt: ['$responses.status', 0]},
                          'answer created',
                        ],
                      },
                      then: 5,
                    },
                  ],
                  default: 6,
                },
              },
            },
          },

          // 9️⃣ Sort & paginate
          {$sort: {updatedAt: -1, statusPriority: 1}},
          {$skip: skip},
          {$limit: limit},
        ]).toArray();
        return submissions.map(sub => ({
          id: sub._id.toString(),
          text: sub.text,
          createdAt: sub.createdAt.toISOString(),
          updatedAt: sub.updatedAt.toISOString(),
          totalAnwersCount: sub.totalAnswersCount,
          questionStatus: sub.questionStatus,
          reponse: sub.responses[0],
        }));
      }
    } catch (error) {
      console.error(error);
      throw new InternalServerError(`Failed to fetch submissions: ${error}`);
    }
  }
  async getAllFinalizedAnswers(
    userId: string,
    currentUserId: string,
    date: string,
    status: string,
    session?: ClientSession,
  ): Promise<{
    finalizedSubmissions: any[];
  }> {
    try {
      await this.init();

      let userObjectId = null;

      if (userId && userId !== 'all') {
        // Check if it's an email
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userId);

        if (isEmail) {
          const user = await this.usersCollection.findOne({email: userId});
          if (user) userObjectId = user._id;
        } else {
          // Treat it as an ObjectId
          userObjectId = new ObjectId(userId);
        }
      }
      let dateMatch: any = {};

      if (date && date !== 'all') {
        if (date.includes(':')) {
          const [start, end] = date.split(':');
          dateMatch.createdAt = {
            $gte: new Date(start),
            $lte: new Date(end + 'T23:59:59.999Z'),
          };
        }
      }
      //console.log("the date match===",dateMatch)

      // Build status filter dynamically
      let statusFilter: any = {};
      if (status !== 'all') {
        statusFilter['status'] = status;
      }

      const submissions = await this.AnswerCollection.aggregate([
        // Join question details
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'question',
          },
        },
        {$unwind: '$question'},

        // ✅ Date filter (works for both cases)
        ...(Object.keys(dateMatch).length > 0 ? [{$match: dateMatch}] : []),

        // ✅ If user selected a specific user → restrict questions to that user
        ...(userId !== 'all'
          ? status == 'in-review'
            ? [
                {
                  $match: {
                    status: 'pending-with-moderator',
                  },
                },

                // Sort latest answers first so we can pick the final/latest one
                {$sort: {createdAt: -1}},

                // ✅ Group → get only the latest answer for each question
                {
                  $group: {
                    _id: '$questionId',
                    latestAnswer: {$first: '$$ROOT'},
                  },
                },
                {$replaceRoot: {newRoot: '$latestAnswer'}}, // flatten result
              ]
            : [
                {
                  $match: {
                    approvedBy: userObjectId,
                    ...statusFilter, // applies status only if status != "all"
                  },
                },

                // Sort latest answers first so we can pick the final/latest one
                {$sort: {createdAt: -1}},

                // ✅ Group → get only the latest answer for each question
                {
                  $group: {
                    _id: '$questionId',
                    latestAnswer: {$first: '$$ROOT'},
                  },
                },
                {$replaceRoot: {newRoot: '$latestAnswer'}}, // flatten result
              ]
          : status !== 'all'
          ? [
              // ✅ If status chosen while user = all → just filter status
              {
                $match: {
                  ...statusFilter,
                },
              },
            ]
          : []),

        // ✅ Sort final results newest first (applies to both cases)
        {$sort: {createdAt: -1}},
      ]).toArray();
      const finalizedSubmissions = submissions.map(sub => ({
        id: sub._id.toString(),

        // Answer fields
        answer: sub.answer,
        isFinalAnswer: sub.isFinalAnswer,
        approvalCount: sub.approvalCount,
        authorId: sub.authorId?.toString() || null,
        questionId: sub.questionId?.toString() || null,
        sources: sub.sources || [],

        createdAt: sub.createdAt?.toISOString(),
        updatedAt: sub.updatedAt?.toISOString(),
        details: sub.question?.details,
        status: sub.status,
        // Question fields (nested)
        question: {
          id: sub.question?._id?.toString(),
          text: sub.question?.question,
          status: sub.question?.status,
          // details: sub.question?.details,
          priority: sub.question?.priority,
          source: sub.question?.source,
          totalAnswersCount: sub.question?.totalAnswersCount || 0,
          createdAt: sub.question?.createdAt?.toISOString(),
          updatedAt: sub.question?.updatedAt?.toISOString(),
        },
      }));
      return {
        finalizedSubmissions,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch submissions: ${error}`);
    }
  }
  async getCurrentUserWorkLoad(
    currentUserId: string,
    session?: ClientSession,
  ): Promise<{
    currentUserAnswers: any[];
    totalQuestionsCount: number;
    totalInreviewQuestionsCount: number;
  }> {
    try {
      await this.init();

      const currentUserAnswers = await this.AnswerCollection.aggregate([
        {
          $match: {
            isFinalAnswer: true,
            approvedBy: new ObjectId(currentUserId),
          },
        },

        // Sort latest answers first so we can pick the final/latest one
        {$sort: {createdAt: -1}},

        // ✅ Group → get only the latest answer for each question
        {
          $group: {
            _id: '$questionId',
            latestAnswer: {$first: '$$ROOT'},
          },
        },
        {
          $lookup: {
            from: 'questions',
            localField: '_id', // since _id now holds questionId
            foreignField: '_id',
            as: 'question',
          },
        },
        {$unwind: {path: '$question', preserveNullAndEmptyArrays: true}},

        {
          $group: {
            _id: {$toString: '$question._id'},
            text: {$first: '$question.question'},
            createdAt: {$first: '$question.createdAt'},
            updatedAt: {$first: '$question.updatedAt'},
            totalAnswersCount: {$sum: 1},
            details: {$first: '$question.details'},
            status: {$first: '$question.status'},
            responses: {
              $push: {
                answer: '$answer',
                id: {$toString: '$_id'},
                isFinalAnswer: '$isFinalAnswer',
                createdAt: '$createdAt',
              },
            },
          },
        },

        {$sort: {createdAt: -1}},
      ]).toArray();
      const totalInreviewQuestionsCount =
        await this.QuestionCollection.countDocuments({
          status: {$in: ['in-review']},
        });
      const totalQuestionsCount = await this.QuestionCollection.countDocuments(
        {},
      );
      //console.log("the total questions====",totalQuestionsCount)
      return {
        currentUserAnswers,
        totalQuestionsCount,
        totalInreviewQuestionsCount,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch submissions: ${error}`);
    }
  }

  async updateAnswer(
    answerId: string,
    updates: Partial<IAnswer>,
    session?: ClientSession,
  ): Promise<{modifiedCount: number}> {
    try {
      await this.init();

      if (!answerId || !isValidObjectId(answerId)) {
        throw new BadRequestError('Invalid or missing answerId');
      }
      if (!updates || Object.keys(updates).length === 0) {
        throw new BadRequestError('Updates object cannot be empty');
      }

      const result = await this.AnswerCollection.updateOne(
        {_id: new ObjectId(answerId)},
        {$set: {...updates, updatedAt: new Date()}},
        {session},
      );

      return {modifiedCount: result.modifiedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while updating answer, More/ ${error}`,
      );
    }
  }

  async deleteAnswer(
    answerId: string,
    session?: ClientSession,
  ): Promise<{deletedCount: number}> {
    try {
      await this.init();

      if (!answerId || !isValidObjectId(answerId)) {
        throw new BadRequestError('Invalid or missing answerId');
      }

      const result = await this.AnswerCollection.deleteOne(
        {_id: new ObjectId(answerId)},
        {session},
      );

      return {deletedCount: result.deletedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while deleting answer, More/ ${error}`,
      );
    }
  }

  async incrementApprovalCount(
    answerId: string,
    session?: ClientSession,
  ): Promise<number> {
    try {
      await this.init();

      const result = await this.AnswerCollection.findOneAndUpdate(
        {_id: new ObjectId(answerId)},
        {$inc: {approvalCount: 1}},
        {
          session,
          returnDocument: 'after',
        },
      );

      if (!result) {
        throw new InternalServerError(`Answer not found with ID ${answerId}`);
      }

      return result.approvalCount ?? 0;
    } catch (error) {
      throw new InternalServerError(
        `Error while incrementing approval count of answer ${answerId}. More: ${error}`,
      );
    }
  }

  async deleteByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<void> {
    try {
      await this.init();
      await this.AnswerCollection.deleteMany(
        {questionId: new ObjectId(questionId)},
        {session},
      );
    } catch (error) {
      throw new InternalServerError(
        `Error while deleting answer, More/ ${error}`,
      );
    }
  }

  async getGoldenFaqs(
    userId: string,
    page: number,
    limit: number,
    search?: string,
    session?: ClientSession,
  ): Promise<{faqs: any[]; totalFaqs: number}> {
    try {
      await this.init();
      const skip = (page - 1) * limit;
      const filter: any = {isFinalAnswer: true};
      if (userId) {
        filter.approvedBy = new ObjectId(userId);
      }

      // if (search) {
      //   filter.answer = {$regex: search, $options: 'i'};
      // }

      const pipeline: any[] = [
        {$match: filter},

        // Lookup Question
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'question',
          },
        },
        {$unwind: {path: '$question', preserveNullAndEmptyArrays: true}},

        // Lookup User (author)
        {
          $lookup: {
            from: 'users',
            localField: 'approvedBy',
            foreignField: '_id',
            as: 'moderator',
          },
        },
        {$unwind: {path: '$moderator', preserveNullAndEmptyArrays: true}},
        {$skip: skip},
        {$limit: limit},
      ];

      // const pipeline: any[] = [
      //   {$match: filter}]
      const faqs = await this.AnswerCollection.aggregate(pipeline, {
        session,
      }).toArray();

      // Count total (with same filters)
      const totalFaqs = await this.AnswerCollection.countDocuments(filter, {
        session,
      });

      // Convert ObjectIds to strings
      const formattedFaqs = faqs.map(faq => ({
        ...faq,
        _id: faq._id?.toString(),
        questionId: faq.questionId?.toString(),
        authorId: faq.authorId?.toString(),
        approvedBy: faq.approvedBy?.toString(),
        question: faq.question
          ? {
              ...faq.question,
              _id: faq.question._id?.toString(),
              userId: faq.question.userId?.toString(),
              contextId: faq.question.contextId?.toString() ?? null,
            }
          : null,
        moderator: faq.moderator
          ? {
              ...faq.moderator,
              _id: faq.moderator._id?.toString(),
            }
          : null,
      }));
      return {faqs: formattedFaqs, totalFaqs};
      // if(userId){
      //   const faqs = await this.AnswerCollection.find({isFinalAnswer:true,approvedBy:new ObjectId(userId)}).skip(skip).limit(limit).toArray()
      //   const totalFaqs = await this.AnswerCollection.countDocuments({isFinalAnswer:true,approvedBy:new ObjectId(userId)})
      //   return {faqs,totalFaqs}
      // }else{
      //   const faqs = await this.AnswerCollection.find({isFinalAnswer:true}).skip(skip).limit(limit).toArray()
      //   const totalFaqs = await this.AnswerCollection.countDocuments({isFinalAnswer:true})
      //   return {faqs,totalFaqs}
      // }
    } catch (error) {
      console.error(error);
      throw new InternalServerError(
        `Error while deleting answer, More/ ${error}`,
      );
    }
  }

  async updateAnswerStatus(
    answerId: string,
    updates: Partial<IAnswer>,
    session?: ClientSession,
  ): Promise<{modifiedCount: number}> {
    try {
      await this.init();

      if (!answerId || !isValidObjectId(answerId)) {
        throw new BadRequestError('Invalid or missing answerId');
      }
      if (!updates || Object.keys(updates).length === 0) {
        throw new BadRequestError('Updates object cannot be empty');
      }

      const result = await this.AnswerCollection.updateOne(
        {_id: new ObjectId(answerId)},
        {$set: {...updates, updatedAt: new Date()}},
        {session},
      );

      return {modifiedCount: result.modifiedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while updating answer, More/ ${error}`,
      );
    }
  }

  async getModeratorApprovalRate(
    currentUserId: string,
    session?: ClientSession,
  ): Promise<ModeratorApprovalRate> {
    try {
      await this.init();

      // count of answer which completed expert review
      const totalReviews = await this.AnswerCollection.countDocuments(
        {
          status: {$in: ['approved', 'pending-with-moderator']},
        },
        {session},
      );

      const approvedCount = await this.AnswerCollection.countDocuments(
        {status: 'approved'},
        {session},
      );

      const approvalRate =
        totalReviews > 0
          ? Number(((approvedCount / totalReviews) * 100).toFixed(2))
          : 0;

      return {
        totalReviews,
        approvalRate,
      };
    } catch (error) {
      console.error('Error fetching moderator approval rate:', error);
      throw new InternalServerError('Failed to fetch moderator approval rate');
    }
  }
}
