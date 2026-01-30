import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {
  IAnswer,
  IContext,
  IQuestion,
  IQuestionSubmission,
  IReview,
  IUser,
  QuestionStatus,
  IReroute,
} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {isValidObjectId} from '#root/utils/isValidObjectId.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from 'routing-controllers';

import {
  detailsArray,
  dummyEmbeddings,
  priorities,
  questionStatus,
  sources,
} from '#root/modules/core/utils/questionGen.js';
import {
  Analytics,
  AnalyticsItem,
  DashboardResponse,
  GoldenDatasetEntry,
  GoldenDataViewType,
  ModeratorApprovalRate,
  QuestionStatusOverview,
} from '#root/modules/core/classes/validators/DashboardValidators.js';
import {promises} from 'dns';
import {getReviewerQueuePosition} from '#root/utils/getReviewerQueuePosition.js';
import {
  QuestionLevelResponse,
  ReviewLevelTimeValue,
} from '#root/modules/core/classes/transformers/QuestionLevel.js';
import {buildQuestionFilter} from '#root/utils/buildQuestionFilter.js';
import {
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '#root/modules/question/classes/validators/QuestionVaidators.js';

const VECTOR_INDEX_NAME = 'questions_vector_index';
const EMBEDDING_FIELD = 'embedding';
const VECTOR_NUM_CANDIDATES = 200;
const VECTOR_COUNT_LIMIT = 20000;

export class QuestionRepository implements IQuestionRepository {
  private QuestionCollection: Collection<IQuestion>;
  private QuestionSubmissionCollection: Collection<IQuestionSubmission>;
  private AnswersCollection: Collection<IAnswer>;
  private UsersCollection!: Collection<IUser>;
  private ContextCollection: Collection<IContext>;
  private ReviewCollection: Collection<IReview>;
  private ReRouteCollection: Collection<IReroute>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.ContextCollection = await this.db.getCollection<IContext>('contexts');

    this.QuestionCollection =
      await this.db.getCollection<IQuestion>('questions');
    this.QuestionSubmissionCollection =
      await this.db.getCollection<IQuestionSubmission>('question_submissions');
    this.UsersCollection = await this.db.getCollection<IUser>('users');
    this.AnswersCollection = await this.db.getCollection<IAnswer>('answers');
    this.ReviewCollection = await this.db.getCollection<IReview>('reviews');
    this.ReRouteCollection = await this.db.getCollection<IReroute>('reroutes');
  }

  private async ensureIndexes() {
    try {
      await this.QuestionCollection.createIndex({status: 1, createdAt: 1});
    } catch (error) {
      console.error('Failed to create index:', error);
    }
  }

  private async getEmbeddingForText(text: string): Promise<number[]> {
    throw new Error(
      'getEmbeddingForText not implemented. Replace with your embedding call.',
    );
  }

  async addQuestions(
    userId: string,
    contextId: string,
    questions: string[],
    session?: ClientSession,
  ): Promise<{insertedCount: number}> {
    try {
      await this.init();

      if (!userId || !isValidObjectId(userId)) {
        throw new BadRequestError('Invalid or missing userId');
      }
      if (!contextId || !isValidObjectId(contextId)) {
        throw new BadRequestError('Invalid or missing contextId');
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new BadRequestError('Questions must be a non-empty array');
      }

      const uploadData: IQuestion[] = questions.map((question: string) => {
        const randomDetails =
          detailsArray[Math.floor(Math.random() * detailsArray.length)];
        const randomSource =
          sources[Math.floor(Math.random() * sources.length)];
        const randomPrioriy =
          priorities[Math.floor(Math.random() * priorities.length)];

        return {
          question,
          userId: new ObjectId(userId),
          context: new ObjectId(contextId),
          status: 'open',
          details: randomDetails,
          source: randomSource,
          embedding: dummyEmbeddings,
          metrics: null,
          text: `Question: ${question}`,
          totalAnswersCount: 0,
          isAutoAllocate: true,
          priority: randomPrioriy,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      const result = await this.QuestionCollection.insertMany(uploadData, {
        session,
      });

      return {insertedCount: result.insertedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while adding questions, More/ ${error}`,
      );
    }
  }
  async addDummyQuestion(
    userId: string,
    contextId: string,
    question: string,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();

      if (!userId || !isValidObjectId(userId)) {
        throw new BadRequestError('Invalid or missing userId');
      }
      if (!contextId || !isValidObjectId(contextId)) {
        throw new BadRequestError('Invalid or missing contextId');
      }
      if (!question || typeof question !== 'string') {
        throw new BadRequestError('Question must be a non-empty string');
      }

      const randomDetails =
        detailsArray[Math.floor(Math.random() * detailsArray.length)];
      const randomSource = sources[Math.floor(Math.random() * sources.length)];
      const randomPrioriy =
        priorities[Math.floor(Math.random() * priorities.length)];
      const randomStatus =
        questionStatus[Math.floor(Math.random() * questionStatus.length)];

      const newQuestion: IQuestion = {
        question,
        userId: new ObjectId(userId),
        contextId: new ObjectId(contextId),
        status: randomStatus,
        details: randomDetails,
        source: randomSource,
        embedding: dummyEmbeddings,
        metrics: null,
        text: `Question: ${question}`,
        totalAnswersCount: 0,
        isAutoAllocate: true,
        priority: randomPrioriy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await this.QuestionCollection.insertOne(newQuestion, {
        session,
      });

      return {...newQuestion, _id: result.insertedId};
    } catch (error) {
      throw new InternalServerError(`Error while adding question: ${error}`);
    }
  }

  async addQuestion(
    question: IQuestion,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();
      if (!question._id) question._id = new ObjectId();

      await this.QuestionCollection.insertOne(question, {session});

      return {...question, _id: question._id.toString()};
    } catch (error) {
      throw new InternalServerError(`Failed to add question ${error}`);
    }
  }

  async getByContextId(
    contextId: string,
    session?: ClientSession,
  ): Promise<IQuestion[]> {
    try {
      await this.init();

      if (!contextId || !isValidObjectId(contextId)) {
        throw new BadRequestError('Invalid or missing contextId');
      }

      const questions = await this.QuestionCollection.find(
        {
          context: new ObjectId(contextId),
        },
        {session},
      ).toArray();

      const formattedQuestions: IQuestion[] = questions.map(q => ({
        ...q,
        _id: q._id?.toString(),
        userId: q.userId?.toString(),
        contextId: q.contextId?.toString(),
      }));
      return formattedQuestions;
    } catch (error) {
      throw new InternalServerError(`Failed to get Question:, More/ ${error}`);
    }
  }

  async getById(
    questionId: string,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }

      const question = await this.QuestionCollection.findOne(
        {
          _id: new ObjectId(questionId),
        },
        {session},
      );

      if (!question)
        throw new NotFoundError(`Faile to find question ${questionId}`);

      const formattedQuestion: IQuestion = {
        ...question,
        _id: question._id?.toString(),
        userId: question.userId?.toString(),
        contextId: question.contextId?.toString(),
      };

      return formattedQuestion;
    } catch (error) {
      throw new InternalServerError(`Failed to get Question:, More/ ${error}`);
    }
  }

  async findDetailedQuestions(
    query: GetDetailedQuestionsQuery & {searchEmbedding: number[] | null},
  ): Promise<{questions: IQuestion[]; totalPages: number; totalCount: number}> {
    try {
      await this.init();

      const caseInsensitiveStringFilter = (field: string, value?: string) => {
        if (value && value !== 'all') {
          filter[field] = {$regex: `^${value}$`, $options: 'i'};
        }
      };

      const {
        search,
        searchEmbedding,
        status,
        source,
        state,
        crop,
        priority,
        answersCountMin,
        answersCountMax,
        dateRange,
        startTime,
        endTime,
        domain,
        user,
        page = 1,
        limit = 10,
        review_level,
        closedAtStart,
        closedAtEnd,
        consecutiveApprovals
      } = query;
      

      const filter: any = {};

      // --- Filters ---

      caseInsensitiveStringFilter('status', status);
      caseInsensitiveStringFilter('source', source);
      caseInsensitiveStringFilter('priority', priority);
      caseInsensitiveStringFilter('details.state', state);
      caseInsensitiveStringFilter('details.crop', crop);
      caseInsensitiveStringFilter('details.domain', domain);
      const approvalCount =
  consecutiveApprovals && consecutiveApprovals !== 'all'
    ? parseInt(consecutiveApprovals, 10)
    : null;
    // --- Consecutive Approvals Filter ---
if (approvalCount !== null && !isNaN(approvalCount)) {
  const answers = await this.AnswersCollection.aggregate([
    // 1. Sort so latest answer comes first per question
    {
      $sort: {
        createdAt: -1, // or answerIteration: -1
      },
    },
  
    // 2. Group by questionId and take only the latest answer
    {
      $group: {
        _id: "$questionId",
        latestAnswer: { $first: "$$ROOT" },
      },
    },
  
    // 3. Replace root with the latest answer document
    {
      $replaceRoot: {
        newRoot: "$latestAnswer",
      },
    },
  
    // 4. Match approvalCount with payload
    {
      $match: {
        approvalCount: approvalCount,
      },
    },
  ]).toArray();
  

  const approvalFilteredIds = answers.map(a =>
    a.questionId.toString(),
  );

  if (approvalFilteredIds.length === 0) {
    return { questions: [], totalPages: 0, totalCount: 0 };
  }

  // Intersect with existing _id filter if present
  if (filter._id) {
    filter._id = {
      $in: approvalFilteredIds
        .map(id => new ObjectId(id))
        .filter(id =>
          filter._id.$in.some((existing: any) => existing.equals(id)),
        ),
    };
  } else {
    filter._id = {
      $in: approvalFilteredIds.map(id => new ObjectId(id)),
    };
  }
}


      if (answersCountMin !== undefined || answersCountMax !== undefined) {
        filter.totalAnswersCount = {};
        if (answersCountMin !== undefined)
          filter.totalAnswersCount.$gte = answersCountMin;
        if (answersCountMax !== undefined)
          filter.totalAnswersCount.$lte = answersCountMax;
      }

      // --- Date Range Filter ---
      //  Priority: Custom date > Predefined dateRange
      if (startTime || endTime) {
        const filterDate: any = {};

        if (startTime) {
          filterDate.$gte = new Date(`${startTime}T00:00:00.000+05:30`);
        }

        if (endTime) {
          filterDate.$lte = new Date(`${endTime}T23:59:59.999+05:30`);
        }

        filter.createdAt = filterDate;
      } else if (dateRange && dateRange !== 'all') {
        const now = new Date();
        let startDate: Date | undefined;

        switch (dateRange) {
          case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
          case 'week':
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
          case 'month':
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
          case 'quarter':
            startDate = new Date(now.setMonth(now.getMonth() - 3));
            break;
          case 'year':
            startDate = new Date(now.setFullYear(now.getFullYear() - 1));
            break;
        }

        if (startDate) filter.createdAt = {$gte: startDate};
      } else if (closedAtEnd || closedAtStart) {
        const filterDate: any = {};

        if (closedAtStart) {
          filterDate.$gte = new Date(`${closedAtStart}T00:00:00.000+05:30`);
        }

        if (closedAtEnd) {
          filterDate.$lte = new Date(`${closedAtEnd}T23:59:59.999+05:30`);
        }

        filter.closedAt = filterDate;
      }

      let questionIdsByUser: string[] | null = null;
      if (user && user !== 'all') {
        const submissions = await this.QuestionSubmissionCollection.find({
          'history.updatedBy': new ObjectId(user),
        })
          .project({questionId: 1})
          .toArray();

        questionIdsByUser = submissions.map(s => s.questionId.toString());

        if (questionIdsByUser.length === 0) {
          return {questions: [], totalPages: 0, totalCount: 0};
        }

        filter._id = {$in: questionIdsByUser.map(id => new ObjectId(id))};
      }
      // --- review_level filter (Level 1–9) ---
      // --- review_level filter ---
      if (review_level && review_level !== 'all') {
        const numericLevel = parseInt(
          review_level.replace('Level ', '').trim(),
        );

        if (!isNaN(numericLevel)) {
          let requiredSize = numericLevel + 1;

          // Special rule: Level 1 → history.length = 0
          /*  if (numericLevel === 1) {
      requiredSize = 0;
    }*/

          const submissions = await this.QuestionSubmissionCollection.find({
            history: {$size: requiredSize},
          })
            .project({questionId: 1})
            .toArray();

          const levelFilteredIds = submissions.map(s =>
            s.questionId.toString(),
          );

          if (levelFilteredIds.length === 0) {
            return {questions: [], totalPages: 0, totalCount: 0};
          }

          if (filter._id) {
            filter._id = {
              $in: levelFilteredIds
                .map(id => new ObjectId(id))
                .filter(id => filter._id.$in.some((u: any) => u.equals(id))),
            };
          } else {
            filter._id = {$in: levelFilteredIds.map(id => new ObjectId(id))};
          }
        }
      }

      let totalCount = 0;
      let result = [];

      const isSearchTermObjectId = isValidObjectId(search);
      if (
        !isSearchTermObjectId &&
        searchEmbedding &&
        searchEmbedding.length > 0
      ) {
        const countPipeline = [
          {
            $vectorSearch: {
              index: 'review_questions_vector_index',
              path: 'embedding',
              queryVector: searchEmbedding,
              numCandidates: 500,
              limit,
            },
          },
          {$match: filter},
          {$count: 'count'},
        ];

        const countResult =
          await this.QuestionCollection.aggregate(countPipeline).toArray();
        totalCount = countResult[0]?.count ?? 0;

        const totalPages = Math.ceil(totalCount / limit);

        if (totalCount === 0) {
          return {questions: [], totalPages, totalCount};
        }

        // --- DATA FETCH with vector search ---
        const pipeline = [
          {
            $vectorSearch: {
              index: 'review_questions_vector_index',
              path: 'embedding',
              queryVector: searchEmbedding,
              numCandidates: 500,
              limit,
            },
          },
          {$match: filter},
          {
            $lookup: {
              from: 'question_submissions',
              localField: '_id',
              foreignField: 'questionId',
              as: 'submissionData',
            },
          },

          // ---- APPLY REVIEW LEVEL LOGIC ----
          {
            $addFields: {
              review_level_number: {
                $let: {
                  vars: {
                    len: {
                      $cond: {
                        if: {$gt: [{$size: '$submissionData'}, 0]},
                        then: {
                          $size: {$arrayElemAt: ['$submissionData.history', 0]},
                        },
                        else: 0,
                      },
                    },
                  },
                  in: {
                    $cond: {
                      if: {$lte: ['$$len', 1]}, // 0 or 1 → return 0
                      then: 'Author',
                      else: {$subtract: ['$$len', 1]}, // >=2 → len-1
                    },
                  },
                },
              },
            },
          },
          {
            $project: {
              submissionData: 0,
              userId: 0,
              updatedAt: 0,
              contextId: 0,
              metrics: 0,
              embedding: 0,
              isAutoAllocate:0,
              text:0,
              aiInitialAnswer:0,
              score: {$meta: 'vectorSearchScore'},
            },
          },
          {$sort: {score: -1}},
          {$skip: (page - 1) * limit},
          {$limit: limit},
        ];

        result = await this.QuestionCollection.aggregate(pipeline).toArray();

        const formattedQuestions: IQuestion[] = result.map((q: any) => ({
          ...q,
          _id: q._id.toString(),
          details: {...q.details},
        }));

        return {questions: formattedQuestions, totalPages, totalCount};
      }

      if (search && search.trim() !== '') {
        filter.$or = [
          {_id: {$regex: search, $options: 'i'}},
          {question: {$regex: search, $options: 'i'}},
          {'details.crop': {$regex: search, $options: 'i'}},
          {'details.state': {$regex: search, $options: 'i'}},
          {'details.domain': {$regex: search, $options: 'i'}},
          {
            $expr: {
              $regexMatch: {
                input: {$toString: '$_id'},
                regex: search,
                options: 'i',
              },
            },
          },
        ];
      }

      totalCount = await this.QuestionCollection.countDocuments(filter);
      const totalPages = Math.ceil(totalCount / limit);

      /*  result = await this.QuestionCollection.find(filter)
        .sort({createdAt: -1})
        .skip((page - 1) * limit)
        .limit(limit)
        .project({
          userId: 0,
          updatedAt: 0,
          contextId: 0,
          metrics: 0,
          embedding: 0,
        })
        .toArray();*/
      result = await this.QuestionCollection.aggregate([
        {$match: filter},
        {$sort: {createdAt: -1, _id: -1}},
        {$skip: (page - 1) * limit},
        {$limit: limit},

        // JOIN submissions → extract history length
        {
          $lookup: {
            from: 'question_submissions',
            localField: '_id',
            foreignField: 'questionId',
            as: 'submissionData',
          },
        },
        {
          $addFields: {
            review_level_number: {
              $let: {
                vars: {
                  len: {
                    $cond: {
                      if: {$gt: [{$size: '$submissionData'}, 0]},
                      then: {
                        $size: {$arrayElemAt: ['$submissionData.history', 0]},
                      },
                      else: 0,
                    },
                  },
                },
                in: {
                  $cond: {
                    if: {$lte: ['$$len', 1]}, // length 0 or 1 → return 0
                    then: 'Author',
                    else: {$subtract: ['$$len', 1]}, // length >=2 → length-1
                  },
                },
              },
            },
          },
        },

        {
          $project: {
            submissionData: 0,
            userId: 0,
            updatedAt: 0,
            contextId: 0,
            metrics: 0,
            embedding: 0,
            isAutoAllocate:0,
            text:0,
            aiInitialAnswer:0
          },
        },
      ]).toArray();

      // // --- Total count for pagination ---
      // const totalCount = await this.QuestionCollection.countDocuments(filter);
      // const totalPages = Math.ceil(totalCount / limit);

      // // --- Paginated data ---
      // const result = await this.QuestionCollection.find(filter)
      //   .sort({createdAt: -1})
      //   .skip((page - 1) * limit)
      //   .limit(limit)
      //   .project({
      //     userId: 0,
      //     updatedAt: 0,
      //     contextId: 0,
      //     metrics: 0,
      //     embedding: 0,
      //   })
      //   .toArray();

      // --- Convert ObjectIds to string ---
      const formattedQuestions: IQuestion[] = result.map((q: any) => ({
        ...q,
        _id: q._id.toString(),
        details: {...q.details},
      }));

      return {questions: formattedQuestions, totalPages, totalCount};
    } catch (error) {
      throw new InternalServerError(`Failed to get Questions: ${error}`);
    }
  }

  async getAllocatedQuestions(
    userId: string,
    query: GetDetailedQuestionsQuery,
    // userPreference: IUser['preference'] | null,
    session?: ClientSession,
  ): Promise<QuestionResponse[]> {
    try {
      await this.init();

      const {filter: sortFilter, page = 1, limit = 10} = query;

      const skip = (page - 1) * limit;

      const userObjectId = new ObjectId(userId);

      /* const submissions = await this.QuestionSubmissionCollection.aggregate([
        {
          $addFields: {
            lastHistory: {$arrayElemAt: ['$history', -1]},
            historyCount: {$size: {$ifNull: ['$history', []]}},
            firstInQueue: {$arrayElemAt: ['$queue', 0]},
          },
        },
        {
          $match: {
            $or: [
              {
                'lastHistory.updatedBy': userObjectId,
                'lastHistory.status': 'in-review',
                $or: [
                  {'lastHistory.answer': {$exists: false}},
                  {'lastHistory.answer': null},
                  {'lastHistory.answer': ''},
                ],
              },
              {
                historyCount: 0, // if there is no history means , there is no submision yet so this is the first expert who is submitting
                firstInQueue: userObjectId,
              },
            ],
          },
        },
      ]).toArray();*/
      const submissions = await this.QuestionSubmissionCollection.aggregate([
        // --------------------------------------------------
        // 1. Minimal helper fields
        // --------------------------------------------------
        {
          $addFields: {
            historyCount: {$size: {$ifNull: ['$history', []]}},
            lastHistory: {$arrayElemAt: ['$history', -1]},
            firstInQueue: {$arrayElemAt: ['$queue', 0]},
          },
        },

        // --------------------------------------------------
        // 2. Main match logic (INLINE review_level handling)
        // --------------------------------------------------
        {
          $match: {
            $expr: {
              $and: [
                // ===============================
                // Review level vs history length
                // ===============================
                {
                  $or: [
                    // all → no filtering
                    {$eq: [query.review_level, 'all']},

                    // Author → historyCount = 0
                    {
                      $and: [
                        {$eq: [query.review_level, 'Author']},
                        {$eq: ['$historyCount', 0]},
                      ],
                    },

                    // Level X → historyCount = X + 1
                    {
                      $and: [
                        {
                          $regexMatch: {
                            input: query.review_level,
                            regex: /^Level\s\d+$/,
                          },
                        },
                        {
                          $eq: [
                            '$historyCount',
                            {
                              $add: [
                                {
                                  $toInt: {
                                    $arrayElemAt: [
                                      {$split: [query.review_level, ' ']},
                                      1,
                                    ],
                                  },
                                },
                                1,
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },

                // ===============================
                // Submission visibility logic
                // ===============================
                {
                  $or: [
                    // Case 1: User is current reviewer
                    {
                      $and: [
                        {$eq: ['$lastHistory.updatedBy', userObjectId]},
                        {$eq: ['$lastHistory.status', 'in-review']},
                        {
                          $or: [
                            {$not: ['$lastHistory.answer']},
                            {$eq: ['$lastHistory.answer', null]},
                            {$eq: ['$lastHistory.answer', '']},
                          ],
                        },
                      ],
                    },

                    // Case 2: First reviewer
                    {
                      $and: [
                        {$eq: ['$historyCount', 0]},
                        {$eq: ['$firstInQueue', userObjectId]},
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ]).toArray();

      const questionIdsToAttempt = submissions.map(
        sub => new ObjectId(sub?.questionId),
      );

      const filter: any = {
        status: {$in: ['open', 'delayed']},
        _id: {$in: questionIdsToAttempt},
      };

      const pipeline: any = [{$match: filter}];

      // if (sortFilter === 'newest') {
      //   pipeline.push({$sort: {createdAt: -1}});
      // } else if (sortFilter === 'oldest') {
      //   pipeline.push({$sort: {createdAt: 1}});
      // } else if (sortFilter === 'leastResponses') {
      //   pipeline.push({$sort: {totalAnswersCount: 1}});
      // } else if (sortFilter === 'mostResponses') {
      //   pipeline.push({$sort: {totalAnswersCount: -1}});
      // }

      pipeline.push({
        $addFields: {
          priorityOrder: {
            $switch: {
              branches: [
                {case: {$eq: ['$priority', 'high']}, then: 1},
                {case: {$eq: ['$priority', 'medium']}, then: 2},
                {case: {$eq: ['$priority', 'low']}, then: 3},
              ],
              default: 4,
            },
          },
        },
      });

      pipeline.push({$sort: {priorityOrder: 1, createdAt: 1, _id: 1}});

      pipeline.push({$skip: skip});
      pipeline.push({$limit: limit});

      pipeline.push({
        $project: {
          id: {$toString: '$_id'},
          text: '$question',
          priority: '$priority',
          createdAt: '$createdAt',
          updatedAt: '$updatedAt',
          totalAnswersCount: 1,
          'details.crop': 1,
          'details.state': 1,
          source: 1,
          _id: 0,
        },
      });

      const results = await this.QuestionCollection.aggregate<QuestionResponse>(
        pipeline,
        {session},
      ).toArray();

      return results;
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch unanswered questions: ${error}`,
      );
    }
  }

  async getQuestionWithFullData(
    questionId: string,
    userId: string,
    isExpert: boolean,
  ) {
    await this.init();

    const questionObjectId = new ObjectId(questionId);

    try {
      // 1 Fetch the question
      const question = await this.QuestionCollection.findOne(
        {
          _id: questionObjectId,
        },
        {projection: {userId: 0, embedding: 0}},
      );
      if (!question) return null;

      // 2 Fetch submissions for this question
      const submission = await this.QuestionSubmissionCollection.findOne({
        questionId: questionObjectId,
      });

      // 2.1 Fetch reroutes for this question
      const reroutes = await this.ReRouteCollection.find({
        questionId: questionObjectId,
      }).toArray();

      // 3 Collect all user IDs for lastRespondedBy
      let lastRespondedId = submission?.lastRespondedBy?.toString();

      // 3.1 Check if there's an expert_completed reroute - that becomes lastRespondedBy
      let latestExpertCompletedReroute = null;
      let latestExpertCompletedTime = null;

      reroutes?.forEach(reroute => {
        reroute.reroutes?.forEach(r => {
          if (r.status === 'rejected') {
            const updatedTime = r.updatedAt || r.reroutedAt;
            if (
              !latestExpertCompletedTime ||
              updatedTime > latestExpertCompletedTime
            ) {
              latestExpertCompletedTime = updatedTime;
              latestExpertCompletedReroute = r;
            }
          }
        });
      });

      // Update lastRespondedBy if there's an expert_completed reroute
      if (latestExpertCompletedReroute) {
        lastRespondedId = latestExpertCompletedReroute.reroutedTo?.toString();
      }

      // 4 Collect all updatedBy and answer IDs from submission histories
      const allUpdatedByIds: ObjectId[] = [];
      const allAnswerIds: ObjectId[] = [];

      submission?.history?.forEach(h => {
        if (h.updatedBy) allUpdatedByIds.push(h.updatedBy as ObjectId);
        if (h.answer) allAnswerIds.push(h.answer as ObjectId);
      });

      // 4.1 Collect answer IDs from reroutes with status "expert_completed"
      reroutes?.forEach(reroute => {
        reroute.reroutes?.forEach(r => {
          if (r.status === 'rejected' && r.answerId) {
            allAnswerIds.push(r.answerId as ObjectId);
          }
          // Also collect reroutedTo IDs for user lookup
          if (r.reroutedTo) {
            allUpdatedByIds.push(r.reroutedTo as ObjectId);
          }
          if (r.reroutedBy) {
            allUpdatedByIds.push(r.reroutedBy as ObjectId);
          }
        });
      });
      // 4.2 Remove duplicate answer IDs
      const uniqueAnswerIds = Array.from(
        new Set(allAnswerIds.map(id => id.toString())),
      ).map(id => new ObjectId(id));

      // 5 Fetch all related users
      const users = await this.UsersCollection.find({
        // _id: {$in: [lastRespondedId, ...allUpdatedByIds]},
      }).toArray();

      const usersMap = new Map(users.map(u => [u._id?.toString(), u]));

      // 6 Fetch all related answers and reviews
      const answers = await this.AnswersCollection.find({
        _id: {$in: uniqueAnswerIds},
      }).toArray();

      const normalizedAnswers = answers.map(a => ({
        ...a,
        _id: a._id.toString(),
        questionId: a.questionId?.toString(),
        authorId: a.authorId?.toString(),
        approvedBy: a.approvedBy?.toString(),

        modifications:
          a.modifications?.map(m => ({
            ...m,
            modifiedBy: m.modifiedBy?.toString(),
          })) ?? [],
      }));

      const answersMap = new Map(
        normalizedAnswers.map(a => [a._id?.toString(), a]),
      );

      const isAlreadySubmitted = allUpdatedByIds
        .map(id => id.toString())
        .includes(userId);

      // Fetch associated reviews and reviewer details
      const reviews = await this.ReviewCollection.find({
        questionId: new ObjectId(questionId),
        answerId: {$in: uniqueAnswerIds},
      })
        .sort({createdAt: -1})
        .toArray();

      const reviewerIds: ObjectId[] = reviews
        .map(r => r.reviewerId.toString())
        .filter(Boolean)
        .map(id => new ObjectId(id));

      const reviewerUsers = await this.UsersCollection.find({
        _id: {$in: reviewerIds},
      }).toArray();

      const reviewerMap = new Map(
        reviewerUsers.map(u => [u._id.toString(), u]),
      );

      const normalizedReviews = reviews.map(r => {
        const reviewer = reviewerMap.get(r.reviewerId?.toString());

        return {
          ...r,
          _id: r._id?.toString(),
          questionId: r.questionId?.toString(),
          answerId: r.answerId?.toString(),
          answer: answersMap.get(r.answerId.toString()),
          reviewerId: r.reviewerId?.toString(),

          reviewer: reviewer
            ? {
                _id: reviewer._id.toString(),
                firstName: isExpert
                  ? getReviewerQueuePosition(
                      submission.queue,
                      reviewer._id.toString(),
                    ) == 0
                    ? 'Author'
                    : `Reviewer ${getReviewerQueuePosition(
                        submission.queue,
                        reviewer._id.toString(),
                      )}`
                  : reviewer.firstName + reviewer.lastName,
                email: !isExpert && reviewer.email,
              }
            : null,
        };
      });

      const reviewsByAnswer = new Map();
      normalizedReviews.forEach(r => {
        const aId = r.answerId;
        if (!reviewsByAnswer.has(aId)) reviewsByAnswer.set(aId, []);
        reviewsByAnswer.get(aId).push(r);
      });

      // 6.1 Convert reroutes to history format
      // 6.1 Convert reroutes to history format and keep only latest per answerId
      const rerouteHistoryMap = new Map();

      reroutes?.forEach(reroute => {
        reroute.reroutes?.forEach(r => {
          const answerIdKey = r.answerId?.toString();
          const updatedTime = r.updatedAt || r.reroutedAt;

          // If answerId exists and status is expert_completed, check if we should keep this one
          if (answerIdKey && r.status === 'rejected') {
            const existing = rerouteHistoryMap.get(answerIdKey);
            const existingTime = existing?.updatedAt || existing?.reroutedAt;

            // Only keep this entry if it's newer than the existing one
            if (!existing || new Date(updatedTime) > new Date(existingTime)) {
              const reroutedToUser = usersMap.get(r.reroutedTo?.toString());

              rerouteHistoryMap.set(answerIdKey, {
                updatedBy: r.reroutedTo
                  ? {
                      _id: r.reroutedTo?.toString(),
                      name: isExpert
                        ? getReviewerQueuePosition(
                            submission?.queue,
                            r.reroutedTo?.toString(),
                          ) == 0
                          ? 'Author'
                          : `Reviewer ${getReviewerQueuePosition(
                              submission?.queue,
                              r.reroutedTo?.toString(),
                            )}`
                        : reroutedToUser?.firstName,
                      email: !isExpert && reroutedToUser?.email,
                    }
                  : null,
                answer: {
                  _id: r.answerId?.toString(),
                  authorId: answersMap
                    .get(r.answerId?.toString())
                    ?.authorId?.toString(),
                  answerIteration: answersMap.get(r.answerId?.toString())
                    ?.answerIteration,
                  isFinalAnswer: answersMap.get(r.answerId?.toString())
                    ?.isFinalAnswer,
                  answer: answersMap.get(r.answerId?.toString())?.answer,
                  sources: answersMap.get(r.answerId?.toString())?.sources,
                  approvalCount: answersMap.get(r.answerId?.toString())
                    ?.approvalCount,
                  remarks: answersMap.get(r.answerId?.toString())?.remarks,
                  createdAt: answersMap.get(r.answerId?.toString())?.createdAt,
                  updatedAt: answersMap.get(r.answerId?.toString())?.updatedAt,
                  reviews: reviewsByAnswer.get(r.answerId?.toString()) || [],
                },
                status: r.status,
                reasonForRejection: r.rejectionReason || null,
                comment: r.comment,
                reroutedBy: r.reroutedBy?.toString(),
                reroutedAt: r.reroutedAt,
                updatedAt: r.updatedAt,
                isReroute: true,
              });
            }
          } else {
            // For non-expert_completed or no answerId, add all entries
            const reroutedToUser = usersMap.get(r.reroutedTo?.toString());
            const uniqueKey = `${r.reroutedTo?.toString()}_${updatedTime}`;

            rerouteHistoryMap.set(uniqueKey, {
              updatedBy: r.reroutedTo
                ? {
                    _id: r.reroutedTo?.toString(),
                    name: isExpert
                      ? getReviewerQueuePosition(
                          submission?.queue,
                          r.reroutedTo?.toString(),
                        ) == 0
                        ? 'Author'
                        : `Reviewer ${getReviewerQueuePosition(
                            submission?.queue,
                            r.reroutedTo?.toString(),
                          )}`
                      : reroutedToUser?.firstName,
                    email: !isExpert && reroutedToUser?.email,
                  }
                : null,
              answer: null,
              status: r.status,
              reasonForRejection: r.rejectionReason || null,
              comment: r.comment,
              reroutedBy: r.reroutedBy?.toString(),
              reroutedAt: r.reroutedAt,
              updatedAt: r.updatedAt,
              isReroute: true,
            });
          }
        });
      });

      const rerouteHistory = Array.from(rerouteHistoryMap.values());

      // 7 Populate submissions manually
      const submissionHistory =
        submission?.history?.map(h => ({
          updatedBy: h.updatedBy
            ? {
                _id: h.updatedBy?.toString(),
                name: isExpert
                  ? getReviewerQueuePosition(
                      submission.queue,
                      h.updatedBy?.toString(),
                    ) == 0
                    ? 'Author'
                    : `Reviewer ${getReviewerQueuePosition(
                        submission.queue,
                        h.updatedBy?.toString(),
                      )}`
                  : usersMap.get(h.updatedBy?.toString())?.firstName,
                email:
                  !isExpert && usersMap.get(h.updatedBy?.toString())?.email,
              }
            : [],
          answer: h.answer
            ? {
                _id: h.answer?.toString(),
                authorId: answersMap
                  .get(h.answer?.toString())
                  ?.authorId?.toString(),
                answerIteration: answersMap.get(h.answer?.toString())
                  ?.answerIteration,
                isFinalAnswer: answersMap.get(h.answer?.toString())
                  ?.isFinalAnswer,
                answer: answersMap.get(h.answer?.toString())?.answer,
                sources: answersMap.get(h.answer?.toString())?.sources,
                approvalCount: answersMap.get(h.answer?.toString())
                  ?.approvalCount,
                remarks: answersMap.get(h.answer?.toString())?.remarks,
                createdAt: answersMap.get(h.answer?.toString())?.createdAt,
                updatedAt: answersMap.get(h.answer?.toString())?.updatedAt,
                reviews: reviewsByAnswer.get(h.answer?.toString()) || [],
              }
            : null,
          status: h.status,
          reasonForRejection: h.reasonForRejection,
          approvedAnswer: h.approvedAnswer?.toString(),
          rejectedAnswer: h.rejectedAnswer?.toString(),
          modifiedAnswer: h.modifiedAnswer?.toString(),
          reasonForLastModification: h.reasonForLastModification?.toString(),
          reviewId: h.reviewId?.toString(),
          isReroute: false,
        })) || [];

      // 7.1 Merge submission history with reroute history and sort by date
      const combinedHistory = [...submissionHistory, ...rerouteHistory].sort(
        (a, b) => {
          const dateA = a.updatedAt || a.reroutedAt || new Date(0);
          const dateB = b.updatedAt || b.reroutedAt || new Date(0);
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        },
      );

      const populatedSubmission = {
        _id: submission?._id?.toString(),
        questionId: submission?.questionId?.toString(),
        lastRespondedBy: lastRespondedId
          ? {
              _id: lastRespondedId,
              name: isExpert
                ? getReviewerQueuePosition(
                    submission?.queue,
                    lastRespondedId,
                  ) == 0
                  ? 'Author'
                  : `Reviewer ${getReviewerQueuePosition(
                      submission?.queue,
                      lastRespondedId,
                    )}`
                : usersMap.get(lastRespondedId)?.firstName,
              email: !isExpert && usersMap.get(lastRespondedId)?.email,
            }
          : null,
        queue: submission?.queue?.map(q => ({
          _id: q.toString(),
          name: isExpert
            ? getReviewerQueuePosition(submission.queue, q.toString()) == 0
              ? 'Author'
              : `Reviewer ${getReviewerQueuePosition(
                  submission.queue,
                  q.toString(),
                )}`
            : usersMap.get(q.toString())?.firstName,
          email: !isExpert && usersMap.get(q.toString())?.email,
        })),
        history: combinedHistory,
        createdAt: submission?.createdAt,
        updatedAt: submission?.updatedAt,
      };

      // 8 Attach context
      const contextId = question.contextId || '';
      let context = '';
      if (isValidObjectId(contextId.toString())) {
        const contextData = await this.ContextCollection.findOne({
          _id: contextId,
        });
        context = contextData.text || '';
      }

      // 9 Final assembled question
      const result = {
        ...{
          ...question,
          contextId: question.contextId?.toString(),
          isAutoAllocate: question.isAutoAllocate ?? true,
        },
        _id: question._id?.toString(),
        userId: question.userId?.toString(),
        isAlreadySubmitted,
        context,
        submission: populatedSubmission,
      };

      return result;
    } catch (error) {
      console.log('Error: ', error);
      throw new InternalServerError(
        `Failed to fetch full question data: ${error}`,
      );
    }
  }

  async updateExpiredAfterFourHours(): Promise<void> {
    try {
      await this.init();
      await this.ensureIndexes();

      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

      // const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);

      const result = await this.QuestionCollection.updateMany(
        {
          status: {$nin: ['closed', 'in-review', 're-routed']},
          createdAt: {$lte: fourHoursAgo},
        },
        {$set: {status: 'delayed'}},
      );

      console.log(
        ` Updated ${result.modifiedCount} questions to "delayed" status`,
      );
    } catch (error) {
      console.error('Error updating expired questions', error);
    }
  }

  async updateAutoAllocate(
    questionId: string,
    isAutoAllocate: boolean,
    session?: ClientSession,
  ): Promise<IQuestion | null> {
    try {
      await this.init();
      const autoAllocateValue =
        typeof isAutoAllocate === 'boolean' ? !isAutoAllocate : false;
      return await this.QuestionCollection.findOneAndUpdate(
        {_id: new ObjectId(questionId)},
        {$set: {isAutoAllocate: autoAllocateValue}},
        {session, returnDocument: 'after'},
      );
    } catch (error) {
      throw new InternalServerError(
        `Error while updating auto allocate field: ${error}`,
      );
    }
  }

  async getQuestionByQuestionText(
    text: string,
    session?: ClientSession,
  ): Promise<IQuestion> {
    try {
      await this.init();
      return this.QuestionCollection.findOne({question: text}, {session});
    } catch (error) {
      throw new InternalServerError(
        `Failed to find question by text /More: ${error}`,
      );
    }
  }

  async updateQuestion(
    questionId: string,
    updates: Partial<IQuestion>,
    session?: ClientSession,
    addText?: boolean,
  ): Promise<{modifiedCount: number}> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }
      if (!updates || Object.keys(updates).length === 0) {
        throw new BadRequestError('Updates object cannot be empty');
      }

      const forbiddenFields = [
        '_id',
        'id',
        'createdAt',
        'updatedAt',
        'review_level_number',
      ];

      if (!addText) {
        forbiddenFields.push('text');
      }

      for (const field of forbiddenFields) {
        delete (updates as any)[field];
      }

      if (updates.closedAt) {
        updates.closedAt = new Date(updates.closedAt);
      }

      const result = await this.QuestionCollection.updateOne(
        {_id: new ObjectId(questionId)},
        {$set: {...updates, updatedAt: new Date()}},
        {session},
      );

      if (updates.status === 'in-review') {
        const submission = await this.QuestionSubmissionCollection.findOne(
          {questionId: new ObjectId(questionId)},
          {session},
        );

        if (submission) {
          const history = submission.history || [];
          const queue = submission.queue || [];

          const lastHistory = history.at(-1);
          const lastUpdatedById = lastHistory?.updatedBy?.toString();

          if (lastUpdatedById && queue.length > 0) {
            const currentIndex = queue.findIndex(
              (id: any) => id?.toString() === lastUpdatedById,
            );

            //  If found, remove all users that come after this index
            if (currentIndex !== -1 && currentIndex < queue?.length - 1) {
              const remainingQueue = queue?.slice(0, currentIndex + 1);

              await this.QuestionSubmissionCollection.updateOne(
                {questionId: new ObjectId(questionId)},
                {$set: {queue: remainingQueue}},
                {session},
              );
            }
          }
        }
      }

      return {modifiedCount: result.modifiedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while updating Question: More info: ${error}`,
      );
    }
  }

  async deleteQuestion(
    questionId: string,
    session?: ClientSession,
  ): Promise<{deletedCount: number}> {
    try {
      await this.init();

      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }

      const result = await this.QuestionCollection.deleteOne(
        {_id: new ObjectId(questionId)},
        {session},
      );
      const result1 = await this.ReRouteCollection.deleteOne(
        {questionId: new ObjectId(questionId)},
        {session},
      );

      return {deletedCount: result.deletedCount};
    } catch (error) {
      throw new InternalServerError(
        `Error while deleting Question::, More/ ${error}`,
      );
    }
  }

  async getAllocatedQuestionPage(
    userId: string,
    questionId: string,
    session?: ClientSession,
  ): Promise<number> {
    await this.init();

    const userObjectId = new ObjectId(userId);
    const questionObjectId = new ObjectId(questionId);

    // 1. Fetch submissions to know what questions are assigned to this user
    const submissions = await this.QuestionSubmissionCollection.aggregate([
      {
        $addFields: {
          lastHistory: {$arrayElemAt: ['$history', -1]},
          historyCount: {$size: {$ifNull: ['$history', []]}},
          firstInQueue: {$arrayElemAt: ['$queue', 0]},
        },
      },
      {
        $match: {
          $or: [
            {
              'lastHistory.updatedBy': userObjectId,
              'lastHistory.status': 'in-review',
              $or: [
                {'lastHistory.answer': {$exists: false}},
                {'lastHistory.answer': null},
                {'lastHistory.answer': ''},
              ],
            },
            {
              historyCount: 0,
              firstInQueue: userObjectId,
            },
          ],
        },
      },
    ]).toArray();

    const questionIdsToAttempt = submissions.map(
      sub => new ObjectId(sub.questionId),
    );

    // 2. Same match filter as your main query
    const filter: any = {
      status: {$in: ['open', 'delayed']},
      _id: {$in: questionIdsToAttempt},
    };

    // 3. Recreate the same sorting pipeline
    const sortedQuestions = await this.QuestionCollection.aggregate([
      {$match: filter},
      {
        $addFields: {
          priorityOrder: {
            $switch: {
              branches: [
                {case: {$eq: ['$priority', 'high']}, then: 1},
                {case: {$eq: ['$priority', 'medium']}, then: 2},
                {case: {$eq: ['$priority', 'low']}, then: 3},
              ],
              default: 4,
            },
          },
        },
      },
      {$sort: {priorityOrder: 1, createdAt: 1, _id: 1}},
      {$project: {_id: 1}},
    ]).toArray();

    const index = sortedQuestions.findIndex(
      q => q._id.toString() === questionId,
    );

    if (index === -1) return 1;

    const limit = 10;
    return Math.floor(index / limit) + 1;
  }

  async insertMany(questions: IQuestion[]): Promise<string[]> {
    await this.init();
    if (!Array.isArray(questions) || questions.length === 0) return [];
    try {
      const result = await this.QuestionCollection.insertMany(questions);
      if (!result.acknowledged) {
        throw new InternalServerError('Failed to insert questions');
      }
      const ids = Object.values(result.insertedIds).map((id: any) =>
        id.toString(),
      );
      return ids;
    } catch (error: any) {
      throw new InternalServerError(
        error?.message || 'Failed to insertMany questions',
      );
    }
  }

  async updateQuestionStatus(
    id: string,
    status: string,
    errorMessage?: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    const update: any = {status, updatedAt: new Date()};
    if (errorMessage) update.errorMessage = errorMessage;
    await this.QuestionCollection.updateOne(
      {_id: new ObjectId(id)},
      {$set: update},
      {session},
    );
  }

  async getQuestionsByStatus(
    status: QuestionStatus,
    session?: ClientSession,
  ): Promise<IQuestion[]> {
    await this.init();
    return await this.QuestionCollection.find({status}, {session}).toArray();
  }

  async getYearAnalytics(
    goldenDataSelectedYear: string,
    session?: ClientSession,
  ): Promise<{yearData: GoldenDatasetEntry[]; totalEntriesByType: number}> {
    await this.init();
    const selectedYearNum = Number(goldenDataSelectedYear);

    const startDate = new Date(selectedYearNum, 0, 1);
    const endDate = new Date(selectedYearNum + 1, 0, 1);

    const yearData = await this.QuestionCollection.aggregate(
      [
        {
          $match: {
            status: 'closed',
            closedAt: {$gte: startDate, $lt: endDate},
          },
        },
        {
          $group: {
            _id: {month: {$month: '$closedAt'}},
            totalClosed: {$sum: 1},
          },
        },
        {$sort: {'_id.month': 1}},
      ],
      {session},
    ).toArray();

    const formattedMonths = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    const formattedData: GoldenDatasetEntry[] = Array.from(
      {length: 12},
      (_, i) => {
        const match = yearData.find(m => m._id.month === i + 1);
        return {
          month: formattedMonths[i],
          entries: 0,
          verified: match?.totalClosed ?? 0,
        };
      },
    );
    const totalEntriesByType = formattedData.reduce(
      (sum, m) => sum + m.verified,
      0,
    );

    return {yearData: formattedData, totalEntriesByType};
  }
  async getMonthAnalytics(
    goldenDataSelectedYear: string,
    goldenDataSelectedMonth: string,
    session?: ClientSession,
  ): Promise<{weeksData: GoldenDatasetEntry[]; totalEntriesByType: number}> {
    await this.init();

    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const yearNum = Number(goldenDataSelectedYear);
    const monthNum = monthNames.indexOf(goldenDataSelectedMonth);
    if (monthNum === -1) throw new BadRequestError('Invalid month name');

    const startDate = new Date(yearNum, monthNum, 1);
    const endDate = new Date(yearNum, monthNum + 1, 1);

    const weeksDataRaw = await this.QuestionCollection.aggregate(
      [
        {
          $match: {
            status: 'closed',
            closedAt: {$gte: startDate, $lt: endDate},
          },
        },
        {
          $addFields: {
            weekOfMonth: {
              $ceil: {
                $divide: [{$dayOfMonth: '$closedAt'}, 7],
              },
            },
          },
        },
        {
          $group: {
            _id: {week: '$weekOfMonth'},
            totalClosed: {$sum: 1},
          },
        },
        {$sort: {'_id.week': 1}},
      ],
      {session},
    ).toArray();

    const formattedWeeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];

    const weeksData: GoldenDatasetEntry[] = formattedWeeks.map((w, i) => {
      const match = weeksDataRaw.find(x => x._id.week === i + 1);
      return {
        week: w,
        entries: 0,
        verified: match?.totalClosed ?? 0,
      };
    });
    const totalEntriesByType = weeksDataRaw.reduce(
      (acc, curr) => acc + curr.totalClosed,
      0,
    );
    return {weeksData, totalEntriesByType};
  }

  async getWeekAnalytics(
    goldenDataSelectedYear: string,
    goldenDataSelectedMonth: string,
    goldenDataSelectedWeek: string,
    session?: ClientSession,
  ): Promise<{dailyData: GoldenDatasetEntry[]; totalEntriesByType: number}> {
    await this.init();
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const monthNum = monthNames.indexOf(goldenDataSelectedMonth);
    if (monthNum === -1) throw new BadRequestError('Invalid month name');

    const yearNum = Number(goldenDataSelectedYear);

    // Calculate start and end dates for the selected week
    const weekNum = Number(goldenDataSelectedWeek.replace('Week ', ''));
    const startDay = (weekNum - 1) * 7 + 1; // start day of the week
    const endDay = startDay + 6; // end day of the week

    const startDate = new Date(yearNum, monthNum, startDay);
    const endDate = new Date(yearNum, monthNum, endDay + 1); // +1 for exclusive range

    // Aggregate closed questions grouped by day of week
    const dailyDataRaw = await this.QuestionCollection.aggregate(
      [
        {
          $match: {
            status: 'closed',
            closedAt: {$gte: startDate, $lt: endDate},
          },
        },
        {
          $addFields: {
            dayOfWeek: {$dayOfWeek: '$closedAt'}, // 1 = Sunday, 2 = Monday ...
          },
        },
        {
          $group: {
            _id: {day: '$dayOfWeek'},
            totalClosed: {$sum: 1},
          },
        },
        {$sort: {'_id.day': 1}},
      ],
      {session},
    ).toArray();

    const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const dailyData: GoldenDatasetEntry[] = Array.from({length: 7}, (_, i) => {
      // MongoDB: 1 = Sunday, so index = dayOfWeek - 1
      const match = dailyDataRaw.find(d => d._id.day === i + 1);
      return {
        day: daysMap[i],
        entries: 0,
        verified: match?.totalClosed ?? 0,
      };
    });

    const totalEntriesByType = dailyDataRaw.reduce(
      (acc, curr) => acc + curr.totalClosed,
      0,
    );

    return {dailyData, totalEntriesByType};
  }

  async getDailyAnalytics(
    goldenDataSelectedYear: string,
    goldenDataSelectedMonth: string,
    goldenDataSelectedWeek: string,
    goldenDataSelectedDay: string,
    session?: ClientSession,
  ): Promise<{
    dayHourlyData: Record<string, GoldenDatasetEntry[]>;
    totalEntriesByType: number;
  }> {
    await this.init();
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const monthNum = monthNames.indexOf(goldenDataSelectedMonth);
    if (monthNum === -1) throw new BadRequestError('Invalid month name');

    const yearNum = Number(goldenDataSelectedYear);
    const weekNum = Number(goldenDataSelectedWeek.replace('Week ', ''));

    // Calculate start and end day for the week
    const startDay = (weekNum - 1) * 7 + 1;
    const endDay = startDay + 6;

    const startDate = new Date(yearNum, monthNum, startDay);
    const endDate = new Date(yearNum, monthNum, endDay + 1); // exclusive

    // Map day names to numbers (JS: 0=Sun, 1=Mon...)
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    const selectedDayNum = dayMap[goldenDataSelectedDay];
    if (selectedDayNum === undefined) throw new BadRequestError('Invalid day');
    const answers = await this.QuestionCollection.aggregate(
      [
        {
          $match: {
            status: 'closed',
            closedAt: {$gte: startDate, $lt: endDate},
          },
        },
        {
          $addFields: {
            dateIST: {
              $dateToParts: {
                date: '$closedAt',
                timezone: 'Asia/Kolkata',
              },
            },
            dayOfWeek: {
              $dayOfWeek: {
                date: '$closedAt',
                timezone: 'Asia/Kolkata',
              },
            },
          },
        },
        {
          $addFields: {
            hourOfDay: '$dateIST.hour',
          },
        },
        {
          $match: {
            dayOfWeek: selectedDayNum + 1,
          },
        },
        {
          $group: {
            _id: '$hourOfDay',
            totalClosed: {$sum: 1},
          },
        },
        {$sort: {_id: 1}},
      ],
      {session},
    ).toArray();

    // const answers = await this.QuestionCollection.aggregate(
    //   [
    //     {
    //       $match: {
    //         status: 'closed',
    //         closedAt: {$gte: startDate, $lt: endDate},
    //       },
    //     },
    //     {
    //       $addFields: {
    //         dayOfWeek: {$dayOfWeek: '$closedAt'}, // 1=Sun, 2=Mon...
    //         hourOfDay: {$hour: '$closedAt'},
    //       },
    //     },
    //     {
    //       $match: {
    //         dayOfWeek: selectedDayNum + 1, // MongoDB: 1=Sun
    //       },
    //     },
    //     {
    //       $group: {
    //         _id: '$hourOfDay',
    //         totalClosed: {$sum: 1},
    //       },
    //     },
    //     {$sort: {_id: 1}},
    //   ],
    //   {session},
    // ).toArray();

    // Initialize all 24 hours with 0 entries
    const hourlyData: GoldenDatasetEntry[] = Array.from(
      {length: 24},
      (_, i) => {
        const match = answers.find(a => a._id === i);
        return {
          hour: i.toString().padStart(2, '0') + ':00',
          entries: 0,
          verified: match?.totalClosed ?? 0,
        };
      },
    );

    const totalEntriesByType = answers.reduce(
      (acc, curr) => acc + curr.totalClosed,
      0,
    );

    return {
      dayHourlyData: {[goldenDataSelectedDay]: hourlyData},
      totalEntriesByType,
    };
  }

  async getCountBySource(
    timeRange: string, // 90d, 30d, 7d ,...
    session?: ClientSession,
  ): Promise<DashboardResponse['questionContributionTrend']> {
    await this.init();

    const rangeMatch = timeRange.match(/^(\d+)d$/);
    if (!rangeMatch) throw new Error('Invalid time range format');
    const days = Number(rangeMatch[1]);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await this.QuestionCollection.aggregate(
      [
        {
          $match: {
            createdAt: {$gte: startDate},
          },
        },
        {
          $group: {
            _id: {
              source: '$source',
              day: {
                $dateToString: {format: '%Y-%m-%d', date: '$createdAt'},
              },
            },
            count: {$sum: 1},
          },
        },
        {
          $group: {
            _id: '$_id.day',
            counts: {
              $push: {
                source: '$_id.source',
                count: '$count',
              },
            },
          },
        },
        {
          $sort: {
            _id: 1, // sort by date asc
          },
        },
      ],
      {session},
    ).toArray();

    const chartData = results.map(r => {
      const dataObj = {
        date: r._id,
        Ajrasakha: 0,
        Moderator: 0,
      };

      r.counts.forEach((item: any) => {
        if (item.source === 'AJRASAKHA') dataObj.Ajrasakha = item.count;
        if (item.source === 'AGRI_EXPERT') dataObj.Moderator = item.count;
      });

      return dataObj;
    });

    return chartData;
  }

  async getQuestionOverviewByStatus(
    session?: ClientSession,
  ): Promise<QuestionStatusOverview[]> {
    await this.init();

    const results = await this.QuestionCollection.aggregate(
      [
        {
          $group: {
            _id: '$status',
            count: {$sum: 1},
          },
        },
        {
          $project: {
            _id: 0,
            status: '$_id',
            value: '$count',
          },
        },
      ],
      {session},
    ).toArray();

    const allStatuses = ['open', 'delayed', 'in-review'];
    const overview: QuestionStatusOverview[] = allStatuses.map(status => {
      const found = results.find(r => r.status === status);
      return {
        status,
        value: found?.value ?? 0,
      };
    });

    return overview;
  }

  async getQuestionAnalytics(
    startTime?: string,
    endTime?: string,
    session?: ClientSession,
  ): Promise<{analytics: Analytics}> {
    await this.init();

    const filterDate: any = {};
    if (startTime) filterDate.$gte = new Date(`${startTime}T00:00:00.000Z`);
    if (endTime) filterDate.$lte = new Date(`${endTime}T23:59:59.999Z`);

    const matchStage: any = {};
    if (Object.keys(filterDate).length > 0) {
      matchStage.createdAt = filterDate;
    }

    // Aggregate crop data
    const cropDataRaw = (await this.QuestionCollection.aggregate(
      [
        {$match: matchStage},
        {$group: {_id: '$details.crop', count: {$sum: 1}}},
        {$project: {name: '$_id', count: 1, _id: 0}},
      ],
      {session},
    ).toArray()) as AnalyticsItem[];

    // Aggregate state data
    const stateDataRaw = (await this.QuestionCollection.aggregate(
      [
        {$match: matchStage},
        {$group: {_id: '$details.state', count: {$sum: 1}}},
        {$project: {name: '$_id', count: 1, _id: 0}},
      ],
      {session},
    ).toArray()) as AnalyticsItem[];

    // Aggregate domain data
    const domainDataRaw = (await this.QuestionCollection.aggregate(
      [
        {$match: matchStage},
        {$group: {_id: '$details.domain', count: {$sum: 1}}},
        {$project: {name: '$_id', count: 1, _id: 0}},
      ],
      {session},
    ).toArray()) as AnalyticsItem[];

    return {
      analytics: {
        cropData: cropDataRaw,
        stateData: stateDataRaw,
        domainData: domainDataRaw,
      },
    };
  }

  async getModeratorApprovalRate(
    currentUserId: string,
    session?: ClientSession,
  ): Promise<ModeratorApprovalRate> {
    try {
      await this.init();

      const pending = await this.QuestionCollection.countDocuments(
        {status: 'in-review'},
        {session},
      );

      const approved = await this.QuestionCollection.countDocuments(
        {status: 'closed'},
        {session},
      );

      const totalReviews = pending + approved || 0;

      const approvedCount = await this.QuestionCollection.countDocuments(
        {status: 'closed'},
        {session},
      );

      const approvalRate =
        totalReviews > 0
          ? Number(((approvedCount / totalReviews) * 100).toFixed(2))
          : 0;

      return {
        approved,
        pending,
        approvalRate,
      };
    } catch (error) {
      console.error('Error fetching moderator approval rate:', error);
      throw new InternalServerError('Failed to fetch moderator approval rate');
    }
  }
  async getAll(session?: ClientSession): Promise<IQuestion[]> {
    await this.init();
    return await this.QuestionCollection.find({}, {session})
      .sort({createdAt: -1})
      .toArray();
  }

  async getByStatus(
    status: IQuestion['status'],
    session?: ClientSession,
  ): Promise<IQuestion[]> {
    await this.init();
    return await this.QuestionCollection.find({status}, {session})
      .sort({createdAt: -1})
      .toArray();
  }

  async bulkDeleteByIds(
    questionIds: string[],
    session?: ClientSession,
  ): Promise<{deletedCount: number}> {
    await this.init();

    const objectIds = questionIds.map(id => new ObjectId(id));
    const result = await this.QuestionCollection.deleteMany(
      {_id: {$in: objectIds}},
      {session},
    );

    return {
      deletedCount: result.deletedCount ?? 0,
    };
  }

   async getTodayApproved(session?:ClientSession):Promise<{todayApproved:number}>{
    await this.init();
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);
    const count = await this.QuestionCollection.countDocuments(
    {
      status: "closed",
      closedAt: {
        $gte: startOfToday,
        $lte: endOfToday,
      },
    },
    { session })
    return {todayApproved:count};
  }

  async getQuestionsAndReviewLevel(
    query: GetDetailedQuestionsQuery & {searchEmbedding: number[] | null},
    session?: ClientSession,
  ): Promise<QuestionLevelResponse> {
    await this.init();
    const {page = 1, limit = 10, search, sort = ''} = query;
    const skip = (page - 1) * limit;
    
     const { filter } = await buildQuestionFilter(
    query,
    this.QuestionSubmissionCollection,
    this.AnswersCollection
  );
    if (search && search.trim().length) {
    filter.question = { $regex: search.trim(), $options: "i" };
  }
   
    //implement sort by level
    const levelMap: any = {
      level_0: 0,
      level_1: 1,
      level_2: 2,
      level_3: 3,
      level_4: 4,
      level_5: 5,
      level_6: 6,
      level_7: 7,
      level_8: 8,
      level_9: 9,
      level_10: 10,
    };

    const [levelKey, order] = sort.split('___');
    const levelIndex = levelMap[levelKey];
    const hasLevelSort =
      sort && sort.includes('___') && levelIndex !== undefined;
    const isTotalTurnAroundTimeSort =
      sort && sort.startsWith('totalTurnAround___');

    const sortDir = order === 'asc' ? 1 : -1;

    const dataPipeLine: any[] = [
      {
        $project: {
          _id: 1,
          question: 1,
          status: 1,
          createdAt: 1,
        },
      },

      {
        $lookup: {
          from: 'question_submissions',
          localField: '_id',
          foreignField: 'questionId',
          as: 'submission',
        },
      },

      {$unwind: {path: '$submission', preserveNullAndEmptyArrays: true}},

      {
        $addFields: {
          history: {$ifNull: ['$submission.history', []]},
          submissionCreatedAt: '$submission.createdAt',

          currentLevel: {
            $cond: [
              {$gt: [{$size: {$ifNull: ['$submission.history', []]}}, 0]},
              {
                $subtract: [{$size: {$ifNull: ['$submission.history', []]}}, 1],
              },
              -1,
            ],
          },
        },
      },

      {
        $addFields: {
          reviewLevels: {
            $map: {
              input: {$range: [0, 11]},
              as: 'idx',

              in: {
                $let: {
                  vars: {
                    hist: {$arrayElemAt: ['$history', '$$idx']},
                    nextHist: {
                      $arrayElemAt: ['$history', {$add: ['$$idx', 1]}],
                    },

                    isAuthorNoHistory: {
                      $and: [
                        {$eq: ['$$idx', 0]},
                        {$eq: ['$currentLevel', -1]},
                        {$ne: ['$submissionCreatedAt', null]},
                      ],
                    },
                  },

                  in: {
                    $let: {
                      vars: {
                        // pending only applies to last level
                        isPending: {
                          $and: [
                            {$eq: ['$$idx', '$currentLevel']},
                            {$ne: ['$$hist', null]},
                            {
                              $or: [
                                {$eq: ['$$hist.updatedAt', null]},
                                {
                                  $eq: ['$$hist.updatedAt', '$$hist.createdAt'],
                                },
                              ],
                            },
                          ],
                        },

                        secs: {
                          $cond: [
                            // submission exists + no history
                            '$$isAuthorNoHistory',

                            {
                              $dateDiff: {
                                startDate: '$submissionCreatedAt',
                                endDate: '$$NOW',
                                unit: 'second',
                              },
                            },

                            // normal
                            {
                              $cond: [
                                {$eq: ['$$idx', 0]},

                                {
                                  $cond: [
                                    {
                                      $and: [
                                        {$ne: ['$$hist', null]},
                                        {
                                          $ne: ['$submissionCreatedAt', null],
                                        },
                                      ],
                                    },
                                    {
                                      $dateDiff: {
                                        startDate: '$submissionCreatedAt',
                                        endDate: '$$hist.createdAt',
                                        unit: 'second',
                                      },
                                    },
                                    null,
                                  ],
                                },

                                // ===== NON-AUTHOR =====
                                {
                                  $cond: [
                                    {$lt: ['$$idx', '$currentLevel']},

                                    // non-last
                                    {
                                      $cond: [
                                        {
                                          $and: [
                                            {$ne: ['$$hist', null]},
                                            {$ne: ['$$nextHist', null]},
                                          ],
                                        },
                                        {
                                          $dateDiff: {
                                            startDate: '$$hist.createdAt',
                                            endDate: '$$nextHist.createdAt',
                                            unit: 'second',
                                          },
                                        },
                                        null,
                                      ],
                                    },

                                    // last level
                                    {
                                      $cond: [
                                        {
                                          $and: [
                                            {$ne: ['$$hist', null]},
                                            {
                                              $or: [
                                                {
                                                  $eq: [
                                                    '$$hist.updatedAt',
                                                    null,
                                                  ],
                                                },
                                                {
                                                  $eq: [
                                                    '$$hist.updatedAt',
                                                    '$$hist.createdAt',
                                                  ],
                                                },
                                              ],
                                            },
                                          ],
                                        },

                                        // pending → now - createdAt
                                        {
                                          $dateDiff: {
                                            startDate: '$$hist.createdAt',
                                            endDate: '$$NOW',
                                            unit: 'second',
                                          },
                                        },

                                        // completed → updatedAt - createdAt
                                        {
                                          $cond: [
                                            {$ne: ['$$hist', null]},
                                            {
                                              $dateDiff: {
                                                startDate: '$$hist.createdAt',
                                                endDate: '$$hist.updatedAt',
                                                unit: 'second',
                                              },
                                            },
                                            null,
                                          ],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      },

                      in: {
                        column: {
                          $cond: [
                            {$eq: ['$$idx', 0]},
                            'author',
                            {$concat: ['level ', {$toString: '$$idx'}]},
                          ],
                        },

                        value: {
                          $cond: [
                            {
                              $and: [
                                {$gt: ['$$idx', '$currentLevel']},
                                {$not: '$$isAuthorNoHistory'},
                              ],
                            },
                            'NA',

                            {
                              $cond: [
                                {$eq: ['$$secs', null]},
                                'NA',

                                {
                                  $let: {
                                    vars: {
                                      h: {
                                        $floor: {
                                          $divide: ['$$secs', 3600],
                                        },
                                      },
                                      m: {
                                        $floor: {
                                          $mod: [{$divide: ['$$secs', 60]}, 60],
                                        },
                                      },
                                      s: {$mod: ['$$secs', 60]},
                                    },

                                    in: {
                                      time: {
                                        $concat: [
                                          {$toString: '$$h'},
                                          ':',
                                          {$toString: '$$m'},
                                          ':',
                                          {$toString: '$$s'},
                                        ],
                                      },

                                      yet_to_complete: {
                                        $or: [
                                          '$$isPending',
                                          '$$isAuthorNoHistory',
                                        ],
                                      },
                                    },
                                  },
                                },
                              ],
                            },
                          ],
                        },
                        //time taken in seconds
                        sortSecs: '$$secs',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ];

    if (isTotalTurnAroundTimeSort) {
      dataPipeLine.push(
        {
          $addFields: {
            totalTurnAround: {
              $sum: {
                $filter: {
                  input: '$reviewLevels.sortSecs',
                  as: 's',
                  cond: {$ne: ['$$s', null]},
                },
              },
            },
          },
        },
        {$sort: {totalTurnAround: sortDir}},
      );
    } else if (hasLevelSort) {
      dataPipeLine.push(
        // Extract the requested level for sorting
        {
          $addFields: {
            sortValue: {
              $arrayElemAt: ['$reviewLevels.sortSecs', levelIndex],
            },
          },
        },
        {$sort: {sortValue: sortDir}},
      );
    } else {
      dataPipeLine.push({$sort: {createdAt: -1}});
    }
    dataPipeLine.push(
      {$skip: skip},
      {$limit: limit},

      {
        $project: {
          _id: 1,
          question: 1,
          status: 1,
          createdAt: 1,
          reviewLevels: 1,
          totalTurnAround: 1,
        },
      },
    );
    const pipeline: any[] = [
      {$match: filter},

      {
        $facet: {
          metadata: [{$count: 'totalDocs'}],
          data: dataPipeLine,
        },
      },
    ];
    const result = await this.QuestionCollection.aggregate(pipeline, {
      session,
    }).toArray();

    const meta = result[0]?.metadata?.[0] ?? {totalDocs: 0};
    const docs = result[0]?.data ?? [];

    const totalDocs = meta.totalDocs;
    const totalPages = Math.max(1, Math.ceil(totalDocs / limit));

    return {
      page,
      limit,
      totalDocs,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,

      data: docs.map(doc => ({
        _id: doc._id?.toString(),
        question: doc.question,
        status: doc.status,
        createdAt: doc.createdAt,
        reviewLevels: doc.reviewLevels,
      })),
    };
  }
}
