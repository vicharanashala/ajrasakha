import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {
  IAnswer,
  IContext,
  IQuestion,
  IQuestionSubmission,
  IReview,
  IUser,
  QuestionStatus,
  QuestionSource,
  IReroute,
  ISimilarQuestion,
  ICheckStatusResponse,
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
} from '#root/modules/question/utils/questionGen.js';
import {
  Analytics,
  AnalyticsItem,
  AnalyticsTableRow,
  DashboardResponse,
  GoldenDatasetEntry,
  GoldenDataViewType,
  ModeratorApprovalRate,
  QuestionStateBreakdownBySource,
  QuestionStatusOverview,
} from '#root/modules/dashboard/validators/DashboardValidators.js';
import {getReviewerQueuePosition} from '#root/utils/getReviewerQueuePosition.js';
import {
  QuestionLevelResponse,
  ReviewLevelTimeValue,
} from '#root/modules/question/classes/transformers/QuestionLevel.js';
import {buildQuestionFilter} from '#root/utils/buildQuestionFilter.js';
import {
  AllocatedQuestionsBodyDto,
  DetailedQuestionsBodyDto,
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '#root/modules/question/classes/validators/QuestionVaidators.js';
import {buildReviewTimeline} from '#root/utils/buildReviewTat.js';
import {getShiftFilter} from '#root/utils/date.utils.js';
import {
  QueueQuestionData,
  RawQueueQuestionRow,
} from '#root/modules/question/interfaces/IQuestionService.js';

const VECTOR_INDEX_NAME = 'questions_vector_index';
const EMBEDDING_FIELD = 'embedding';
const VECTOR_NUM_CANDIDATES = 200;
const VECTOR_COUNT_LIMIT = 20000;

export class QuestionRepository implements IQuestionRepository {
  private QuestionCollection: Collection<IQuestion>;
  private DuplicateQuestionCollection: Collection<ISimilarQuestion>;
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
    this.DuplicateQuestionCollection =
      await this.db.getCollection<ISimilarQuestion>('duplicate_questions');
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
      // New questions are eligible for moderator auto-allocation by default.
      if (question.autoAllocateModerator === undefined) {
        question.autoAllocateModerator = true;
      }

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
        throw new NotFoundError(`Failed to find question ${questionId}`);

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

  /** Find questions that reference the given question (referenceQuestionId), optionally
   *  filtered by status. Used to propagate a close to queue-duplicate children. */
  async findByReferenceQuestionId(
    referenceQuestionId: string,
    status?: QuestionStatus,
    session?: ClientSession,
  ): Promise<IQuestion[]> {
    await this.init();
    if (!isValidObjectId(referenceQuestionId)) return [];
    const filter: Record<string, unknown> = {
      referenceQuestionId: new ObjectId(referenceQuestionId),
    };
    if (status) filter.status = status;
    return this.QuestionCollection.find(filter, {session}).toArray();
  }

  async findDetailedQuestions(
    query: GetDetailedQuestionsQuery & {searchEmbedding: number[] | null},
    body?: DetailedQuestionsBodyDto,
  ): Promise<{questions: IQuestion[]; totalPages: number; totalCount: number}> {
    try {
      await this.init();
      const escapeRegex = (str: string) =>
        str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const caseInsensitiveStringFilter = (field: string, value?: string) => {
        if (value && value !== 'all') {
          const escapedValue = escapeRegex(value);
          // filter[field] = {$regex: `^${value}$`, $options: 'i'};
          filter[field] = {$regex: `^${escapedValue}$`, $options: 'i'};
        }
      };

      let {
        search,
        searchEmbedding,
        status,
        source,
        state,
        crop,
        normalised_crop,
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
        consecutiveApprovals,
        autoAllocateFilter,
        sort,
        closedInTwoHrs,
        hiddenQuestions,
        duplicateQuestions,
        isOnHold,
        unallocatedQuestions,
        pae_review,
        is_non_agri,
        moderatorId,
      } = query;
      //  const filter: any = {};
      const filter: any = {
        // isHidden: { $ne: true }, // default to exclude hidden questions
        // isOnHold: { $ne: true }, // default to exclude on hold questions
        isTesting:{$ne:true},
      };
      if (pae_review) {
        filter.pae_review = {$eq: true};
      }
      if (!pae_review) {
        filter.$or = [
          {pae_review: {$eq: false}},
          {pae_review: {$exists: false}},
        ];
      }

      // --- Hidden question filter ---
      if (hiddenQuestions === 'true' || status === 'pass') {
        filter.isHidden = {$eq: true}; // filter by hidden questions
      }

      // --- on Hold question filter ---
      if (isOnHold === 'true') filter.isOnHold = {$eq: true}; // filter by on hold questions

      // --- Unallocated questions filter ---
      // Single aggregation: join questions (open/delayed) with question_submissions,
      // then match: no submission, OR empty queue, OR last history status != 'in-review' with non-empty queue
      if (unallocatedQuestions === 'true') {
        const unallocatedDocs = await this.QuestionCollection.aggregate([
          {$match: {status: {$in: ['open', 'delayed']}}},
          {
            $lookup: {
              from: 'question_submissions',
              let: {qId: '$_id'},
              pipeline: [
                {$match: {$expr: {$eq: ['$questionId', '$$qId']}}},
                {$project: {queue: 1, history: 1}},
              ],
              as: 'sub',
            },
          },
          {$addFields: {sub: {$arrayElemAt: ['$sub', 0]}}},
          {
            $match: {
              $or: [
                // No submission OR empty queue
                {$expr: {$eq: [{$size: {$ifNull: ['$sub.queue', []]}}, 0]}},
                // Queue not empty + history not empty + last history status != 'in-review'
                {
                  $and: [
                    {$expr: {$gt: [{$size: {$ifNull: ['$sub.queue', []]}}, 0]}},
                    {
                      $expr: {
                        $gt: [{$size: {$ifNull: ['$sub.history', []]}}, 0],
                      },
                    },
                    {
                      $expr: {
                        $ne: [
                          {
                            $arrayElemAt: [
                              {
                                $map: {
                                  input: {$ifNull: ['$sub.history', []]},
                                  as: 'h',
                                  in: '$$h.status',
                                },
                              },
                              -1,
                            ],
                          },
                          'in-review',
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          },
          {$project: {_id: 1}},
        ]).toArray();

        filter._id = {$in: unallocatedDocs.map(d => d._id)};
      }

      //for duplicate questions.
      // duplicateQuestions === 'true'
      //       ? this.DuplicateQuestionCollection
      //       :

      // --- setting the collection with respect to the duplicate questions filter ---
      const questionsCollection = this
        .QuestionCollection as Collection<IQuestion>;

      // --- Auto Allocate Filter ---
      if (autoAllocateFilter && autoAllocateFilter !== 'all') {
        if (autoAllocateFilter === 'on') {
          filter.isAutoAllocate = true;
        } else if (autoAllocateFilter === 'off') {
          filter.isAutoAllocate = false;
        }
      }

      // --- Filters ---

      caseInsensitiveStringFilter('status', status);
      caseInsensitiveStringFilter('source', source);
      caseInsensitiveStringFilter('priority', priority);

      // --- Non-Agri / Dynamic tab filter ---
      // When on Non-Agri tab → only show non_agri questions.
      // On any OTHER tab (and no explicit status filter) → exclude non_agri and dynamic.
      // Dynamic tab sends status=dynamic via caseInsensitiveStringFilter above.
      if (is_non_agri === 'true' || is_non_agri === true) {
        filter.status = 'non_agri';
      } else if (filter.status === undefined) {
        filter.status = {$nin: ['non_agri']};
      }

      // --- Dedicated (moderator-assigned) tab filter ---
      // When filtering by moderatorId, always restrict to active statuses only
      // (in-review, re-routed, duplicate or pae_submitted), overriding any status filter
      // the frontend sent. 'duplicate' and 'pae_submitted' are included because the
      // moderator-queue cron assigns those to moderators alongside in-review ones.
      if (moderatorId) {
        const modOid = new ObjectId(moderatorId as string);
        // Match both a correct ObjectId AND any legacy doc where moderatorId was
        // persisted as a serialized Buffer ({ buffer: { data: [...12 bytes...] } }),
        // so those still surface in the moderator's assignments until migrated.
        if (!filter.$and) filter.$and = [];
        filter.$and.push({
          $or: [
            { moderatorId: modOid },
            { 'moderatorId.buffer.data': Array.from(modOid.id) },
          ],
        });
        filter.status = { $in: ['in-review', 're-routed', 'duplicate', 'pae_submitted'] };
        // A moderator's assignments span all question types (including PAE questions),
        // so drop the pae_review restriction applied above for the normal tabs —
        // otherwise pae_review:true assignments would be hidden from "My Assignments".
        delete filter.$or;
        delete filter.pae_review;
      }

      // --- State filter (from body array) ---
      if (body?.states && body.states.length > 0) {
        filter['details.state'] = {$in: body.states};
      }
      if (crop && crop.length > 0) {
        const validCrops = crop.filter(c => c && c !== 'all');
        if (validCrops.length === 1) {
          filter['details.crop'] = {
            $regex: `^${escapeRegex(validCrops[0])}$`,
            $options: 'i',
          };
        } else if (validCrops.length > 1) {
          filter['details.crop'] = {
            $in: validCrops.map(c => new RegExp(`^${escapeRegex(c)}$`, 'i')),
          };
        }
      }
      caseInsensitiveStringFilter('details.domain', domain);

      // --- Normalized Crop Filter (from body array) ---
      if (body?.normalisedCrops && body.normalisedCrops.length > 0) {
        const hasNotSet = body.normalisedCrops.includes('__NOT_SET__');
        const realCrops = body.normalisedCrops.filter(c => c !== '__NOT_SET__');
        if (!hasNotSet) {
          filter['details.normalised_crop'] = {$in: realCrops};
        } else {
          const orConditions: any[] = [
            {'details.normalised_crop': {$exists: false}},
            {'details.normalised_crop': null},
            {'details.normalised_crop': ''},
          ];
          if (realCrops.length > 0) {
            orConditions.push({'details.normalised_crop': {$in: realCrops}});
          }
          if (!filter.$and) filter.$and = [];
          filter.$and.push({$or: orConditions});
        }
      }
      const approvalCount =
        consecutiveApprovals && consecutiveApprovals !== 'all'
          ? parseInt(consecutiveApprovals, 10)
          : null;
      // --- Consecutive Approvals Filter ---
      if (approvalCount !== null && !isNaN(approvalCount)) {
        // Only exclude closed questions for consecutive approvals
        filter.status = {$not: {$regex: '^closed$', $options: 'i'}};

        const answers = await this.AnswersCollection.aggregate(
          [
            {
              $group: {
                _id: '$questionId',
                latestCreatedAt: {$max: '$createdAt'},
              },
            },
            {
              $lookup: {
                from: 'answers',
                let: {qId: '$_id', created: '$latestCreatedAt'},
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          {$eq: ['$questionId', '$$qId']},
                          {$eq: ['$createdAt', '$$created']},
                        ],
                      },
                    },
                  },
                  {
                    $project: {
                      _id: 1,
                      questionId: 1,
                      approvalCount: 1,
                      createdAt: 1,
                    },
                  },
                ],
                as: 'latestAnswer',
              },
            },
            {$unwind: '$latestAnswer'},

            {
              $match: {
                'latestAnswer.approvalCount': approvalCount,
              },
            },

            {
              $project: {
                questionId: '$_id',
              },
            },
          ],
          {allowDiskUse: true},
        ).toArray();

        const approvalFilteredIds = answers.map(a => a.questionId.toString());

        if (approvalFilteredIds.length === 0) {
          return {questions: [], totalPages: 0, totalCount: 0};
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

      if (closedInTwoHrs) {
        // Filter for questions closed within 2 hours of creation
        filter.status = 'closed';
        filter.$expr = {
          $lte: [
            {$subtract: ['$closedAt', '$createdAt']},
            2 * 60 * 60 * 1000, // 2 hours in milliseconds
          ],
        };
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

          // Special rule: Level 0 (Author) → history.length = 0
          if (numericLevel === 0) {
            requiredSize = 0;
          }

          const submissionQuery: any = {history: {$size: requiredSize}};
          // For levels > 0, only include submissions where the current level is still in-review
          if (numericLevel > 0) {
            submissionQuery[`history.${numericLevel}.status`] = 'in-review';
          }

          const submissions = await this.QuestionSubmissionCollection.find(
            submissionQuery,
          )
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
      // Vector search is disabled for the keyword search path — users expect
      // exact/regex keyword matching, not semantic similarity results.
      // The semantic path is kept but will never trigger when search is set.
      const isSemanticQuery = false;
      if (
        !isSearchTermObjectId &&
        isSemanticQuery &&
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

        const countResult = await questionsCollection
          .aggregate(countPipeline)
          .toArray();
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
            $lookup: {
              from: 'contexts',
              localField: 'contextId',
              foreignField: '_id',
              as: 'contextDoc',
            },
          },
          {
            $addFields: {
              context: {
                $ifNull: ['$context', {$arrayElemAt: ['$contextDoc.text', 0]}],
              },
            },
          },
          // JOIN submissions to get queue and history for timer calculation
          {
            $lookup: {
              from: 'question_submissions',
              localField: '_id',
              foreignField: 'questionId',
              as: 'submission',
            },
          },
          {
            $addFields: {
              submission: {
                $cond: {
                  if: {$gt: [{$size: '$submission'}, 0]},
                  then: {$arrayElemAt: ['$submission', 0]},
                  else: null,
                },
              },
            },
          },
          // Convert ObjectIds to strings for submission data
          {
            $addFields: {
              submission: {
                $cond: {
                  if: {$ne: ['$submission', null]},
                  then: {
                    _id: {$toString: '$submission._id'},
                    questionId: {$toString: '$submission.questionId'},
                    createdAt: '$submission.createdAt',
                    updatedAt: '$submission.updatedAt',
                    queue: {
                      $map: {
                        input: {$ifNull: ['$submission.queue', []]},
                        as: 'q',
                        in: {$toString: '$$q'},
                      },
                    },
                    history: {
                      $map: {
                        input: {$ifNull: ['$submission.history', []]},
                        as: 'h',
                        in: {
                          updatedBy: {
                            _id: {
                              $toString: {
                                $ifNull: ['$$h.updatedBy._id', '$$h.updatedBy'],
                              },
                            },
                            name: '$$h.updatedBy.name',
                          },
                          status: '$$h.status',
                          createdAt: '$$h.createdAt',
                        },
                      },
                    },
                  },
                  else: null,
                },
              },
            },
          },
          // JOIN authors_history from question document
          {
            $addFields: {
              authors_history: {
                $map: {
                  input: {$ifNull: ['$authors_history', []]},
                  as: 'ah',
                  in: {
                    authorId: {
                      $toString: {$ifNull: ['$$ah.authorId', '$$ah.authorId']},
                    },
                    newAuthorId: {
                      $toString: {
                        $ifNull: ['$$ah.newAuthorId', '$$ah.newAuthorId'],
                      },
                    },
                    createdAt: '$$ah.createdAt',
                    reasonForChange: '$$ah.reasonForChange',
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
              contextDoc: 0,
              score: {$meta: 'vectorSearchScore'},
            },
          },
          {
            $addFields: {
              statusOrder: {
                $cond: {
                  if: {$eq: [{$toLower: '$status'}, 'closed']},
                  then: 1,
                  else: 0,
                },
              },
            },
          },
          {$sort: {statusOrder: 1, score: -1}},
          {$skip: (page - 1) * limit},
          {$limit: limit},
        ];

        result = await questionsCollection.aggregate(pipeline).toArray();

        const formattedQuestions: IQuestion[] = result.map((q: any) => ({
          ...q,
          _id: q._id.toString(),
          details: {...q.details},
        }));

        return {questions: formattedQuestions, totalPages, totalCount};
      }

      if (search && search.trim() !== '') {
        // Search spans ALL questions regardless of status/source — drop those filters
        // so a matching question surfaces no matter which tab/status it's in.
        delete filter.status;
        delete filter.source;

        // Escape special regex characters so literal strings like "How to control weeds?"
        // are matched as-is rather than being interpreted as regex patterns.
        const escapedSearch = escapeRegex(search.trim());
        const searchConditions = [
          {question: {$regex: escapedSearch, $options: 'i'}},
          {'details.crop': {$regex: escapedSearch, $options: 'i'}},
          {'details.state': {$regex: escapedSearch, $options: 'i'}},
          {'details.domain': {$regex: escapedSearch, $options: 'i'}},
          {threadId: {$regex: escapedSearch, $options: 'i'}},
          {
            $expr: {
              $regexMatch: {
                input: {$toString: '$_id'},
                regex: escapedSearch,
                options: 'i',
              },
            },
          },
        ];

        // If filter.$or already exists (e.g. from pae_review), combine using $and
        // to avoid overwriting the existing $or condition
        if (filter.$or) {
          if (!filter.$and) filter.$and = [];
          filter.$and.push({$or: filter.$or});
          filter.$and.push({$or: searchConditions});
          delete filter.$or;
        } else {
          filter.$or = searchConditions;
        }
      }

      totalCount = await questionsCollection.countDocuments(filter);
      const totalPages = Math.ceil(totalCount / limit);

      // Determine sort order
      // let sortStage: any = { statusOrder: 1, createdAt: -1, _id: -1 };
      let sortStage: any = {createdAt: -1, _id: -1};
      let needsPriorityMapping = false;
      let needsReviewLevelSort = false;

      if (sort) {
        const lastUnderscore = sort.lastIndexOf('_');
        const field =
          lastUnderscore === -1 ? sort : sort.slice(0, lastUnderscore);
        const order =
          lastUnderscore === -1 ? 'desc' : sort.slice(lastUnderscore + 1);
        const sortOrder = order === 'asc' ? 1 : -1;

        if (field === 'question') {
          sortStage = {statusOrder: 1, question: sortOrder, _id: -1};
        } else if (field === 'state') {
          sortStage = {statusOrder: 1, 'details.state': sortOrder, _id: -1};
        } else if (field === 'crop') {
          sortStage = {statusOrder: 1, 'details.crop': sortOrder, _id: -1};
        } else if (field === 'domain') {
          sortStage = {statusOrder: 1, 'details.domain': sortOrder, _id: -1};
        } else if (field === 'priority') {
          needsPriorityMapping = true;
          sortStage = {statusOrder: 1, priorityOrder: sortOrder, _id: -1};
        } else if (field === 'status') {
          sortStage = {statusOrder: sortOrder, _id: -1};
        } else if (field === 'answers') {
          sortStage = {statusOrder: 1, totalAnswersCount: sortOrder, _id: -1};
        } else if (field === 'created') {
          sortStage = {statusOrder: 1, createdAt: sortOrder, _id: -1};
        } else if (field === 'review_level') {
          needsReviewLevelSort = true;
          sortStage = {
            statusOrder: 1,
            review_level_sort_value: sortOrder,
            _id: -1,
          };
        }
      }

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

      const aggregationPipeline: any[] = [
        {$match: filter},
        {
          $addFields: {
            statusOrder: {
              $switch: {
                branches: [
                  {case: {$eq: [{$toLower: '$status'}, 'open']}, then: 1},
                  {case: {$eq: [{$toLower: '$status'}, 'delayed']}, then: 2},
                  {case: {$eq: [{$toLower: '$status'}, 're-routed']}, then: 3},
                  {case: {$eq: [{$toLower: '$status'}, 'in-review']}, then: 4},
                  {case: {$eq: [{$toLower: '$status'}, 'closed']}, then: 5},
                  {case: {$eq: [{ $toLower: "$status" }, "hold"] }, then: 6},
                ],
                default: 7,
              },
            },
          },
        },
      ];

      // Add priority mapping if needed
      if (needsPriorityMapping) {
        aggregationPipeline.push({
          $addFields: {
            priorityOrder: {
              $switch: {
                branches: [
                  {case: {$eq: ['$priority', 'critical']}, then: 1},
                  {case: {$eq: ['$priority', 'high']}, then: 2},
                  {case: {$eq: ['$priority', 'medium']}, then: 3},
                  {case: {$eq: ['$priority', 'low']}, then: 4},
                ],
                default: 5,
              },
            },
          },
        });
      }

      if (needsReviewLevelSort) {
        aggregationPipeline.push(
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
              review_level_sort_value: {
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
                      if: {$lte: ['$$len', 1]},
                      then: 0,
                      else: {$subtract: ['$$len', 1]},
                    },
                  },
                },
              },
            },
          },
        );
      }

      aggregationPipeline.push(
        {$sort: sortStage},
        {$skip: (page - 1) * limit},
        {$limit: limit},
      );

      result = await questionsCollection
        .aggregate([
          ...aggregationPipeline,

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
            $lookup: {
              from: 'contexts',
              localField: 'contextId',
              foreignField: '_id',
              as: 'contextDoc',
            },
          },
          {
            $addFields: {
              context: {
                $ifNull: ['$context', {$arrayElemAt: ['$contextDoc.text', 0]}],
              },
            },
          },

          // JOIN submissions to get queue and history for timer calculation
          {
            $lookup: {
              from: 'question_submissions',
              localField: '_id',
              foreignField: 'questionId',
              as: 'submission',
            },
          },
          {
            $addFields: {
              submission: {
                $cond: {
                  if: {$gt: [{$size: '$submission'}, 0]},
                  then: {$arrayElemAt: ['$submission', 0]},
                  else: null,
                },
              },
            },
          },
          // Convert ObjectIds to strings for submission data
          {
            $addFields: {
              submission: {
                $cond: {
                  if: {$ne: ['$submission', null]},
                  then: {
                    _id: {$toString: '$submission._id'},
                    questionId: {$toString: '$submission.questionId'},
                    createdAt: '$submission.createdAt',
                    updatedAt: '$submission.updatedAt',
                    queue: {
                      $map: {
                        input: {$ifNull: ['$submission.queue', []]},
                        as: 'q',
                        in: {$toString: '$$q'},
                      },
                    },
                    history: {
                      $map: {
                        input: {$ifNull: ['$submission.history', []]},
                        as: 'h',
                        in: {
                          updatedBy: {
                            _id: {
                              $toString: {
                                $ifNull: ['$$h.updatedBy._id', '$$h.updatedBy'],
                              },
                            },
                            name: '$$h.updatedBy.name',
                          },
                          status: '$$h.status',
                          createdAt: '$$h.createdAt',
                        },
                      },
                    },
                  },
                  else: null,
                },
              },
            },
          },
          // JOIN authors_history from question document
          {
            $addFields: {
              authors_history: {
                $map: {
                  input: {$ifNull: ['$authors_history', []]},
                  as: 'ah',
                  in: {
                    authorId: {
                      $toString: {$ifNull: ['$$ah.authorId', '$$ah.authorId']},
                    },
                    newAuthorId: {
                      $toString: {
                        $ifNull: ['$$ah.newAuthorId', '$$ah.newAuthorId'],
                      },
                    },
                    createdAt: '$$ah.createdAt',
                    reasonForChange: '$$ah.reasonForChange',
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
              contextDoc: 0,
              priorityOrder: 0,
              review_level_sort_value: 0,
            },
          },
        ])
        .toArray();

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
    session?: ClientSession,
    body?: AllocatedQuestionsBodyDto,
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
      const reviewLevelByQuestionId = new Map(
        submissions.map((sub: any) => {
          const historyCount = sub?.historyCount ?? 0;
          const reviewLevelNumber = historyCount <= 1 ? 'Author' : historyCount - 1;
          return [sub?.questionId?.toString(), reviewLevelNumber];
        }),
      );

      // Rerouted questions live in the `reroutes` collection, not in the
      // submission history/queue, so the allocation logic above never surfaces
      // them. Pull the ones still pending action for this expert and merge them
      // in — but ONLY when the caller explicitly opts in via includeRerouted
      // (the Expert Management dashboard). The normal answering queue
      // (QA interface) must stay reroute-free since reroutes have their own
      // dedicated flow. Also limit to the unfiltered ('all') or dedicated
      // 'rerouted' level views.
      const includeRerouted =
        query.includeRerouted === 'true' &&
        (query.review_level === 'all' || query.review_level === 'rerouted');

      let reroutedQuestionIds: ObjectId[] = [];
      if (includeRerouted) {
        const reroutedDocs = await this.ReRouteCollection.find(
          {
            reroutes: {
              $elemMatch: {
                reroutedTo: userObjectId,
                status: 'pending',
              },
            },
          },
          {projection: {questionId: 1}, session},
        ).toArray();

        reroutedQuestionIds = reroutedDocs
          .filter(doc => doc?.questionId)
          .map(doc => new ObjectId(doc.questionId));
      }

      const reroutedQuestionIdSet = new Set(
        reroutedQuestionIds.map(id => id.toString()),
      );

      // De-duplicate in case a question is both a normal allocation and a reroute.
      const questionIdsToAttempt = Array.from(
        new Map(
          [
            ...submissions.map(sub => new ObjectId(sub?.questionId)),
            ...reroutedQuestionIds,
          ].map(id => [id.toString(), id]),
        ).values(),
      );

      const escapeRegex = (str: string) =>
        str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const filter: any = {
        _id: {$in: questionIdsToAttempt},
      };

      // Normal allocations must be in an open state. Rerouted questions are
      // typically already in-review/closed, so let them bypass that restriction
      // while preserving the original status filter for everything else.
      if (reroutedQuestionIdSet.size > 0) {
        filter.$or = [
          {_id: {$in: reroutedQuestionIds}},
          {status: {$nin: ['closed', 'in-review']}},
        ];
      } else {
        filter.status = {$nin: ['closed', 'in-review']};
      }

      // Apply preferences filters
      if (query.source && query.source !== 'all') {
        filter.source = {
          $regex: `^${escapeRegex(query.source)}$`,
          $options: 'i',
        };
      }
      if (body?.states && body.states.length > 0) {
        filter['details.state'] = {$in: body.states};
      }
      if (body?.crops && body.crops.length > 0) {
        filter['details.crop'] = {$in: body.crops};
      }

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
                // AJRASAKHA / WHATSAPP
                {
                  case: {
                    $and: [
                      { $eq: ['$priority', 'critical'] },
                      { $in: ['$source', ['AJRASAKHA', 'WHATSAPP']] },
                    ],
                  },
                  then: 1,
                },
                {
                  case: {
                    $and: [
                      { $eq: ['$priority', 'high'] },
                      { $in: ['$source', ['AJRASAKHA', 'WHATSAPP']] },
                    ],
                  },
                  then: 2,
                },
                {
                  case: {
                    $and: [
                      { $eq: ['$priority', 'medium'] },
                      { $in: ['$source', ['AJRASAKHA', 'WHATSAPP']] },
                    ],
                  },
                  then: 3,
                },
                {
                  case: {
                    $and: [
                      { $eq: ['$priority', 'low'] },
                      { $in: ['$source', ['AJRASAKHA', 'WHATSAPP']] },
                    ],
                  },
                  then: 4,
                },

                // Other sources
                { case: { $eq: ['$priority', 'critical'] }, then: 5 },
                { case: { $eq: ['$priority', 'high'] }, then: 6 },
                { case: { $eq: ['$priority', 'medium'] }, then: 7 },
                { case: { $eq: ['$priority', 'low'] }, then: 8 },
              ],
              default: 9,
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
          status: 1,
          _id: 0,
        },
      });

      const results = await this.QuestionCollection.aggregate<QuestionResponse>(
        pipeline,
        {session},
      ).toArray();
      return results.map((q: any) => ({
        ...q,
        review_level_number: reroutedQuestionIdSet.has(q.id)
          ? 'rerouted'
          : reviewLevelByQuestionId.get(q.id) ?? 'Author',
      }));
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
      const reviewTimeline = buildReviewTimeline(
        submission?.history || [],
        submission?.queue || [],
        question?.createdAt,
        question.status,
        question?.firstAllocationAt,
      );

      // 7 Populate submissions manually
      const submissionHistory =
        submission?.history?.map((h, index) => ({
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
                avatar:
                  (!isExpert &&
                    usersMap.get(h.updatedBy?.toString())?.avatar) ||
                  null,
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
          //tat
          assignedAt: reviewTimeline[index]?.assignedAt || null,
          completedAt: reviewTimeline[index]?.completedAt || null,
          timeTakenMs: reviewTimeline[index]?.timeTakenMs || null,
          isCompleted: reviewTimeline[index]?.isCompleted || false,
          reasonForRejection: h.reasonForRejection,
          approvedAnswer: h.approvedAnswer?.toString(),
          rejectedAnswer: h.rejectedAnswer?.toString(),
          modifiedAnswer: h.modifiedAnswer?.toString(),
          reasonForLastModification: h.reasonForLastModification?.toString(),
          reviewId: h.reviewId?.toString(),
          isReroute: false,
          updatedAt: h.updatedAt,
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
        authorTimeline: reviewTimeline[0],
        history: combinedHistory,
        // When the current (first-queue) expert was allocated — used by the UI to
        // show an "Assigned" time before that expert has any history entry.
        currentExpertAllocatedAt: submission?.currentExpertAllocatedAt ?? null,
        createdAt: submission?.createdAt,
        updatedAt: submission?.updatedAt,
      };

      // 7.2 If question is closed with no submission queue, fetch the final answer directly.
      // `dynamic_closed` (dynamic questions finalised via the Auditor "Notify User" flow)
      // is treated the same as `closed` so its final answer shows in the timeline too.
      let closedFinalAnswer: any = null;
      if (
        (question.status === 'closed' ||
          question.status === 'dynamic_closed') &&
        (submission?.queue?.length ?? 0) === 0
      ) {
        const fa = await this.AnswersCollection.findOne({
          questionId: questionObjectId,
          isFinalAnswer: true,
        });
        if (fa) {
          closedFinalAnswer = {
            ...fa,
            _id: fa._id?.toString(),
            questionId: fa.questionId?.toString(),
            authorId: fa.authorId?.toString(),
            approvedBy: fa.approvedBy?.toString() ?? null,
          };
        }
      }

      // 8 Attach context
      const contextId = question.contextId || '';
      let context = '';
      if (isValidObjectId(contextId.toString())) {
        const contextData = await this.ContextCollection.findOne({
          _id: contextId,
        });
        context = contextData.text || '';
      }

      // 9 Fetch reference question data if this is a duplicate
      let referenceQuestionData: {
        question: string;
        status: string;
        details: Record<string, any>;
        text: string;
        sources: {
          source: string;
          page?: string | number | null;
          sourceType?: string;
          sourceName?: string;
        }[];
      } | null = null;

      if (question.referenceQuestionId) {
        try {
          let refId: ObjectId;
          const rid = question.referenceQuestionId as any;
          if (rid instanceof ObjectId) {
            refId = rid;
          } else if (rid?.buffer?.data) {
            // stored as serialized Buffer object {buffer: {type:"Buffer", data:[...]}}
            refId = new ObjectId(Buffer.from(rid.buffer.data));
          } else if (rid?.buffer && Buffer.isBuffer(rid.buffer)) {
            // stored as BSON Binary with actual Buffer
            refId = new ObjectId(rid.buffer);
          } else {
            refId = new ObjectId(String(rid));
          }

          const [refQuestion, refFinalAnswer] = await Promise.all([
            this.QuestionCollection.findOne(
              {_id: refId},
              {projection: {question: 1, status: 1, details: 1, text: 1}},
            ) as any,
            this.AnswersCollection.findOne(
              {questionId: refId, isFinalAnswer: true},
              {projection: {sources: 1}},
            ) as any,
          ]);

          if (refQuestion) {
            referenceQuestionData = {
              question: refQuestion.question || '',
              status: refQuestion.status || '',
              details: refQuestion.details || {},
              text: refQuestion.text || '',
              sources: refFinalAnswer?.sources || [],
            };
          }
        } catch (e) {
          console.error('Failed to fetch referenceQuestionData:', e);
        }
      }

      // 10 Final assembled question
      const {aiApprovedAnswer, aiInitialAnswer, ...rest} = question;

      const result = {
        ...{
          ...rest,
          aiInitialAnswer:
            aiInitialAnswer && aiInitialAnswer.trim()
              ? aiInitialAnswer
              : aiApprovedAnswer,
          contextId: question.contextId?.toString(),
          isAutoAllocate: question.isAutoAllocate ?? true,
        },
        _id: question._id?.toString(),
        userId: question.userId?.toString(),
        isAlreadySubmitted,
        context,
        submission: populatedSubmission,
        referenceQuestionData,
        closedFinalAnswer,
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

      const now = new Date();
      const twoHoursMs = 2 * 60 * 60 * 1000;
      const oneAndHalfHoursMs = 1.5 * 60 * 60 * 1000;

      // const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);

      const result = await this.QuestionCollection.updateMany(
        {
          status: {$in: ['open']},
          isOnHold: {$ne: true},
          pae_review: {$ne: true},
        },
        [
          {
            $set: {
              priority: {
                $cond: [
                  {
                    $and: [
                      {
                        $lte: [
                          {
                            $add: [
                              '$createdAt',
                              oneAndHalfHoursMs,
                              {$ifNull: ['$accumulatedHoldMs', 0]},
                            ],
                          },
                          now,
                        ],
                      },
                      {
                        $ne: ['$priority', 'critical'],
                      },
                    ],
                  },
                  'critical',
                  '$priority',
                ],
              },

              status: {
                $cond: [
                  {
                    $lte: [
                      {
                        $add: [
                          '$createdAt',
                          twoHoursMs,
                          {$ifNull: ['$accumulatedHoldMs', 0]},
                        ],
                      },
                      now,
                    ],
                  },
                  'delayed',
                  '$status',
                ],
              },
            },
          },
        ],
      );

      console.log(
        ` Updated ${result.modifiedCount} questions to "delayed" status/ 'critical' priority.`,
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
        'submission',
        'statusOrder',
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

      const nextStatus = String((updates as any).status ?? '').toLowerCase();
      const isPassStatus = nextStatus === 'pass';
      if (isPassStatus) {
        const existingQuestion = await this.QuestionCollection.findOne(
          {_id: new ObjectId(questionId)},
          {projection: {passedAt: 1}, session},
        );
        updates.isClosed = true;
        if (!existingQuestion?.passedAt) {
          updates.passedAt = new Date();
        } else {
          delete (updates as any).passedAt;
        }
      }

      if (updates.referenceQuestionId) {
        const rid = updates.referenceQuestionId as any;
        if (rid instanceof ObjectId) {
          // already correct
        } else if (rid?.buffer?.data) {
          updates.referenceQuestionId = new ObjectId(
            Buffer.from(rid.buffer.data),
          );
        } else {
          updates.referenceQuestionId = new ObjectId(String(rid));
        }
      }

      // Same normalisation for moderatorId — callers (e.g. the edit-question flow)
      // can send it back JSON-serialized as a { buffer: { data: [...] } } object;
      // coerce it to a real ObjectId so it isn't persisted as a Buffer.
      if ((updates as any).moderatorId) {
        const mid = (updates as any).moderatorId;
        if (mid instanceof ObjectId) {
          // already correct
        } else if (mid?.buffer?.data) {
          (updates as any).moderatorId = new ObjectId(Buffer.from(mid.buffer.data));
        } else {
          (updates as any).moderatorId = new ObjectId(String(mid));
        }
      }

      const contextValue = (updates as any).context;
      if (contextValue) {
        delete (updates as any).context;
      }

      const updateOperation: any = {$set: {...updates, updatedAt: new Date()}};

      if (contextValue) {
        const q = await this.QuestionCollection.findOne(
          {_id: new ObjectId(questionId)},
          {session},
        );
        if (q && q.contextId) {
          await this.ContextCollection.updateOne(
            {_id: q.contextId},
            {$set: {text: contextValue}},
            {session},
          );
        }
        // Unset the context field from the question document to ensure it uses the one from context collection
        (updateOperation as any).$unset = {context: 1};
      }

      const result = await this.QuestionCollection.updateOne(
        {_id: new ObjectId(questionId)},
        updateOperation,
        {session},
      );

      // Keep the denormalised status on any moderator holding this question in sync.
      if (updates.status) {
        await this.syncModeratorAssignedStatus(questionId, updates.status, session);
      }

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

  async updateThreadId(
    questionId: string,
    threadId: string,
    session?: ClientSession,
  ): Promise<{modifiedCount: number}> {
    try {
      await this.init();
      if (!questionId || !isValidObjectId(questionId)) {
        throw new BadRequestError('Invalid or missing questionId');
      }
      if (!threadId) {
        throw new BadRequestError('Invalid or missing threadId');
      }
      return await this.QuestionCollection.updateOne(
        {_id: new ObjectId(questionId)},
        {$set: {threadId: threadId, updatedAt: new Date()}},
        {session},
      );
    } catch (error) {
      throw new InternalServerError(
        `Error while updating thread ID: More info: ${error}`,
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
                {case: {$eq: ['$priority', 'critical']}, then: 1},
                {case: {$eq: ['$priority', 'high']}, then: 2},
                {case: {$eq: ['$priority', 'medium']}, then: 3},
                {case: {$eq: ['$priority', 'low']}, then: 4},
              ],
              default: 5,
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
    const nextStatus = String(status).toLowerCase();
    if (nextStatus === 'pass') {
      update.isClosed = true;
      const existingQuestion = await this.QuestionCollection.findOne(
        {_id: new ObjectId(id)},
        {projection: {passedAt: 1}, session},
      );
      if (!existingQuestion?.passedAt) {
        update.passedAt = update.updatedAt;
      }
    }
    if (errorMessage) update.errorMessage = errorMessage;
    await this.QuestionCollection.updateOne(
      {_id: new ObjectId(id)},
      {$set: update},
      {session},
    );

    // Keep the denormalised status on any moderator holding this question in sync.
    await this.syncModeratorAssignedStatus(id, status as QuestionStatus, session);
  }

  /** Updates the denormalised status on whichever moderator currently holds this
   *  question in their assignedQuestionIds array (a question is held by at most one).
   *  No-op when no moderator holds it. Called from every question status-write path so
   *  the cron's free/busy decision stays accurate (e.g. in-review → re-routed frees the
   *  moderator; re-routed → in-review makes them busy again). */
  private async syncModeratorAssignedStatus(
    questionId: string,
    status: QuestionStatus,
    session?: ClientSession,
  ): Promise<void> {
    // Best-effort: this is a denormalised cache for free/busy. A failure here must not
    // break the primary question-status update; it self-heals on the next transition.
    try {
      await this.init();
      const qid = new ObjectId(questionId);
      await this.UsersCollection.updateOne(
        {'assignedQuestionIds.questionId': qid} as any,
        {
          $set: {
            'assignedQuestionIds.$[entry].status': status,
            updatedAt: new Date(),
          },
        } as any,
        {arrayFilters: [{'entry.questionId': qid}], session},
      );
    } catch (err: any) {
      console.error(
        `[assignedQuestionIds] Failed to sync status for question ${questionId}:`,
        err?.message,
      );
    }
  }

  async getQuestionsByStatus(
    status: QuestionStatus,
    session?: ClientSession,
  ): Promise<IQuestion[]> {
    await this.init();
    return await this.QuestionCollection.find({status}, {session}).toArray();
  }

  async getClosedQuestionsCount(session?: ClientSession): Promise<number> {
    await this.init();
    return await this.QuestionCollection.countDocuments(
      {status: 'closed'},
      {session},
    );
  }

  async getYearAnalytics(
    goldenDataSelectedYear: string,
    customStartTime?: string,
    customEndTime?: string,
    session?: ClientSession,
  ): Promise<{
    yearData: GoldenDatasetEntry[];
    totalEntriesByType: number;
    totalVerifiedByType: number;
    moderatorBreakdown?: {moderatorName: string; count: number}[];
    questionSourceBreakdown?: {whatsapp: number; ajrasakha: number};
    questionsAnsweredWithin120Min?: {whatsapp: number; ajrasakha: number};
    averageResponseTime?: {whatsapp: number; ajrasakha: number};
    questionsAnsweredAfter120Min?: {whatsapp: number; ajrasakha: number};
    questionStateBreakdown?: QuestionStateBreakdownBySource;
    paeMetrics?: {assigned: number; submitted: number; closed: number};
  }> {
    await this.init();
    const selectedYearNum = Number(goldenDataSelectedYear);

    const startDate = new Date(selectedYearNum, 0, 1);
    const endDate = new Date(selectedYearNum + 1, 0, 1);

    // Build match condition with optional time filtering
    const matchCondition: any = {
      createdAt: {$gte: startDate, $lt: endDate},
      status: {$ne: 'pass'},
    };

    const closedMatchCondition: any = {
      status: 'closed',
      closedAt: {
        $gte: startDate,
        $lt: endDate,
      },
    };

    // Add time filtering if provided
    if (customStartTime && customEndTime) {
      const [startHour, startMinute] = customStartTime.split(':').map(Number);
      const [endHour, endMinute] = customEndTime.split(':').map(Number);

      matchCondition.$expr = {
        $and: [
          {
            $gte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              startHour * 60 + startMinute,
            ],
          },
          {
            $lte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              endHour * 60 + endMinute,
            ],
          },
        ],
      };

      closedMatchCondition.$expr = {
        $and: [
          {
            $gte: [
              {
                $add: [
                  {
                    $multiply: [
                      {
                        $hour: {
                          date: '$closedAt',
                          timezone: 'Asia/Kolkata',
                        },
                      },
                      60,
                    ],
                  },
                  {
                    $minute: {
                      date: '$closedAt',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                ],
              },
              startHour * 60 + startMinute,
            ],
          },
          {
            $lte: [
              {
                $add: [
                  {
                    $multiply: [
                      {
                        $hour: {
                          date: '$closedAt',
                          timezone: 'Asia/Kolkata',
                        },
                      },
                      60,
                    ],
                  },
                  {
                    $minute: {
                      date: '$closedAt',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                ],
              },
              endHour * 60 + endMinute,
            ],
          },
        ],
      };
    }

    const yearData = await this.QuestionCollection.aggregate(
      [
        {
          $match: matchCondition,
        },
        {
          $group: {
            _id: {month: {$month: '$createdAt'}},
            totalEntries: {$sum: 1},
            totalVerified: {
              $sum: {$cond: [{$eq: ['$status', 'closed']}, 1, 0]},
            },
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
          // entries: 0,
          // verified: match?.totalClosed ?? 0,
          entries: match?.totalEntries ?? 0,
          verified: match?.totalVerified ?? 0,
        };
      },
    );

    const [closedStats] = await this.QuestionCollection.aggregate(
      [
        {
          $match: closedMatchCondition,
        },
        {
          $count: 'totalVerified',
        },
      ],
      { session },
    ).toArray();
    const totalEntriesByType = formattedData.reduce(
      (sum, m) => sum + m.entries,
      0,
    );

    const totalVerifiedByType = closedStats?.totalVerified ?? 0;
    const {moderatorBreakdown} = await this.getTodayApproved(
      session,
      startDate,
      endDate,
    );
    const questionSourceBreakdown = await this.getQuestionSourceBreakdown(
      session,
      startDate,
      endDate,
      customStartTime,
      customEndTime,
    );
    const questionsAnsweredWithin120Min =
      await this.getQuestionsAnsweredWithin120Minutes(
        session,
        startDate,
        endDate,
        customStartTime,
        customEndTime,
      );
    const averageResponseTime = await this.getAverageResponseTime(
      session,
      startDate,
      endDate,
      customStartTime,
      customEndTime,
    );
    const questionsAnsweredAfter120Min =
      await this.getQuestionsAnsweredAfter120Minutes(
        session,
        startDate,
        endDate,
      );
    const questionStateBreakdown = await this.getQuestionStateBreakdown(
      session,
      startDate,
      endDate,
    );
    const paeMetrics = await this.getPAEMetrics(
      session,
      startDate,
      endDate,
      customStartTime,
      customEndTime,
    );
    return {
      yearData: formattedData,
      totalEntriesByType,
      totalVerifiedByType,
      moderatorBreakdown,
      questionSourceBreakdown,
      questionsAnsweredWithin120Min,
      averageResponseTime,
      questionsAnsweredAfter120Min,
      questionStateBreakdown,
      paeMetrics,
    };
  }

  /**
   * get yearly analytics.
   * @param session -MongoDB client session for transactions.
   * @returns A promise that resolves to question document
   */
  async getTodayApproved(
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    todayApproved: number;
    moderatorBreakdown?: {moderatorName: string; count: number}[];
  }> {
    await this.init();

    let start = startDate;
    let end = endDate;

    if (!start || !end) {
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    }

    // Get moderator breakdown
   const moderatorBreakdown = (await this.AnswersCollection.aggregate(
  [
    {
      $match: {
        status: 'approved',
        isFinalAnswer: true,
        approvedBy: {$exists: true, $ne: null},
      },
    },

    // Lookup question
    {
      $lookup: {
        from: 'questions',
        localField: 'questionId',
        foreignField: '_id',
        as: 'question',
      },
    },

    {
      $unwind: {
        path: '$question',
        preserveNullAndEmptyArrays: false,
      },
    },

    // Filter by question.closedAt
    {
      $match: {
        'question.closedAt': {
          $gte: start,
          $lt: end,
        },
      },
    },

    {
      $group: {
        _id: '$approvedBy',
        count: {$sum: 1},
      },
    },

    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'moderator',
      },
    },

    {
      $unwind: {
        path: '$moderator',
        preserveNullAndEmptyArrays: false,
      },
    },

    {
      $project: {
        _id: 0,
        moderatorName: {
          $concat: [
            '$moderator.firstName',
            ' ',
            {$ifNull: ['$moderator.lastName', '']},
          ],
        },
        count: 1,
      },
    },

    {
      $sort: {count: -1},
    },
  ],
  {session},
).toArray()) as {moderatorName: string; count: number}[];

    // Calculate total from the breakdown
    const totalApproved = moderatorBreakdown.reduce(
      (sum, item) => sum + item.count,
      0,
    );

    return {
      todayApproved: totalApproved,
      moderatorBreakdown: moderatorBreakdown,
    };
  }

  async getQuestionSourceBreakdown(
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
    customStartTime?: string,
    customEndTime?: string,
  ): Promise<{whatsapp: number; ajrasakha: number}> {
    await this.init();

    const matchCondition: any = {status: {$ne: 'pass'}};
    /* if (startDate && endDate) {
       matchCondition.createdAt = { $gte: startDate, $lt: endDate };
     }*/
    const parsedStartDate = startDate ? new Date(startDate) : undefined;
    const parsedEndDate = endDate ? new Date(endDate) : undefined;

    if (parsedStartDate && parsedEndDate) {
      matchCondition.createdAt = {
        $gte: parsedStartDate,
        $lt: parsedEndDate,
      };
    }

    // Add time filtering if provided
    if (customStartTime && customEndTime) {
      const [startHour, startMinute] = customStartTime.split(':').map(Number);
      const [endHour, endMinute] = customEndTime.split(':').map(Number);

      matchCondition.$expr = {
        $and: [
          {
            $gte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              startHour * 60 + startMinute,
            ],
          },
          {
            $lte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              endHour * 60 + endMinute,
            ],
          },
        ],
      };
    }

    const sourceBreakdown = (await this.QuestionCollection.aggregate(
      [
        ...(Object.keys(matchCondition).length > 0
          ? [{$match: matchCondition}]
          : []),
        {
          $group: {
            _id: '$source',
            count: {$sum: 1},
          },
        },
      ],
      {session},
    ).toArray()) as {_id: string; count: number}[];

    const whatsapp =
      sourceBreakdown.find(s => s._id?.toLowerCase() === 'whatsapp')?.count ??
      0;
    const ajrasakha =
      sourceBreakdown.find(s => s._id?.toLowerCase() === 'ajrasakha')?.count ??
      0;

    return {whatsapp, ajrasakha};
  }

  async getQuestionsAnsweredWithin120Minutes(
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
    customStartTime?: string,
    customEndTime?: string,
  ): Promise<{whatsapp: number; ajrasakha: number}> {
    await this.init();

    const matchCondition: any = {
      status: 'closed',
      closedAt: {$exists: true},
      createdAt: {$exists: true},
    };

    if (startDate && endDate) {
      // Filter by both createdAt and closedAt in IST format
      matchCondition.$or = [
        {
          createdAt: {
            $gte: new Date(
              `${startDate.toISOString().split('T')[0]}T00:00:00.000+05:30`,
            ),
            $lt: new Date(
              `${endDate.toISOString().split('T')[0]}T23:59:59.999+05:30`,
            ),
          },
        },
        {
          closedAt: {
            $gte: new Date(
              `${startDate.toISOString().split('T')[0]}T00:00:00.000+05:30`,
            ),
            $lt: new Date(
              `${endDate.toISOString().split('T')[0]}T23:59:59.999+05:30`,
            ),
          },
        },
      ];
    }

    // Add time filtering if provided
    if (customStartTime && customEndTime) {
      const [startHour, startMinute] = customStartTime.split(':').map(Number);
      const [endHour, endMinute] = customEndTime.split(':').map(Number);

      matchCondition.$expr = {
        $and: [
          {
            $gte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              startHour * 60 + startMinute,
            ],
          },
          {
            $lte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              endHour * 60 + endMinute,
            ],
          },
        ],
      };
    }

    const result = (await this.QuestionCollection.aggregate(
      [
        {$match: matchCondition},
        {
          $addFields: {
            timeTakenMinutes: {
              $divide: [{$subtract: ['$closedAt', '$createdAt']}, 60000],
            },
          },
        },
        {
          $match: {
            timeTakenMinutes: {$lte: 120},
          },
        },
        {
          $group: {
            _id: '$source',
            count: {$sum: 1},
          },
        },
      ],
      {session},
    ).toArray()) as {_id: string; count: number}[];

    const whatsapp =
      result.find(s => s._id?.toLowerCase() === 'whatsapp')?.count ?? 0;
    const ajrasakha =
      result.find(s => s._id?.toLowerCase() === 'ajrasakha')?.count ?? 0;

    return {whatsapp, ajrasakha};
  }

  //get questions answered after 120 minutes
  async getQuestionsAnsweredAfter120Minutes(
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{whatsapp: number; ajrasakha: number}> {
    await this.init();

    const matchCondition: any = {
      status: 'closed',
      closedAt: {$exists: true},
      createdAt: {$exists: true},
    };

    if (startDate && endDate) {
      matchCondition.createdAt = {$gte: startDate, $lt: endDate};
    }

    const result = (await this.QuestionCollection.aggregate(
      [
        {$match: matchCondition},
        {
          $addFields: {
            timeTakenMinutes: {
              $divide: [{$subtract: ['$closedAt', '$createdAt']}, 60000],
            },
          },
        },
        {
          $match: {
            timeTakenMinutes: {$gt: 120},
          },
        },
        {
          $group: {
            _id: '$source',
            count: {$sum: 1},
          },
        },
      ],
      {session},
    ).toArray()) as {_id: string; count: number}[];

    const whatsapp =
      result.find(s => s._id?.toLowerCase() === 'whatsapp')?.count ?? 0;
    const ajrasakha =
      result.find(s => s._id?.toLowerCase() === 'ajrasakha')?.count ?? 0;

    return {whatsapp, ajrasakha};
  }

  //get questions state breakedown
  async getQuestionStateBreakdown(
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
  ): Promise<QuestionStateBreakdownBySource> {
    await this.init();

    const matchCondition: any = {status: {$ne: 'pass'}};
    if (startDate && endDate) {
      matchCondition.createdAt = {$gte: startDate, $lt: endDate};
    }

    const stateBreakdown = (await this.QuestionCollection.aggregate(
      [
        ...(Object.keys(matchCondition).length > 0
          ? [{$match: matchCondition}]
          : []),
        {
          $group: {
            _id: {
              source: '$source',
              status: '$status',
            },
            count: {$sum: 1},
          },
        },
      ],
      {session},
    ).toArray()) as {_id: {source?: string; status?: string}; count: number}[];

    const buildBreakdown = (sourceName: 'whatsapp' | 'ajrasakha') => {
      const sourceKey = sourceName.toUpperCase();
      const getCount = (status: string) =>
        stateBreakdown.find(
          item =>
            item._id?.source?.toUpperCase() === sourceKey &&
            item._id?.status?.toLowerCase() === status,
        )?.count ?? 0;

      return [
        {status: 'open', count: getCount('open')},
        {status: 'pass', count: getCount('pass')},
        {status: 'delayed', count: getCount('delayed')},
      ];
    };

    return {
      whatsapp: buildBreakdown('whatsapp'),
      ajrasakha: buildBreakdown('ajrasakha'),
    };
  }

  async getAverageResponseTime(
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
    customStartTime?: string,
    customEndTime?: string,
  ): Promise<{whatsapp: number; ajrasakha: number}> {
    await this.init();

    const matchCondition: any = {
      status: 'closed',
      createdAt: {$exists: true},
      closedAt: {$exists: true},
    };

    if (startDate && endDate) {
      /* const startOfDay = new Date(
        `${startDate.toISOString().split('T')[0]}T00:00:00.000+05:30`
      );

      const endOfDay = new Date(
        `${endDate.toISOString().split('T')[0]}T23:59:59.999+05:30`
      );*/
      const startOfDay = new Date(startDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);

      matchCondition.createdAt = {
        $gte: startOfDay,
        $lte: endOfDay,
      };
      matchCondition.closedAt = {
        $gte: startOfDay,
        $lte: endOfDay,
      };
    }

    /**
     * Optional Time Filter (IST)
     * Filters based on CREATED TIME
     */
    if (customStartTime && customEndTime) {
      const [startHour, startMinute] = customStartTime.split(':').map(Number);

      const [endHour, endMinute] = customEndTime.split(':').map(Number);

      const startTotalMinutes = startHour * 60 + startMinute;
      const endTotalMinutes = endHour * 60 + endMinute;

      matchCondition.$expr = {
        $and: [
          {
            $gte: [
              {
                $add: [
                  {
                    $multiply: [
                      {
                        $hour: {
                          date: '$createdAt',
                          timezone: 'Asia/Kolkata',
                        },
                      },
                      60,
                    ],
                  },
                  {
                    $minute: {
                      date: '$createdAt',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                ],
              },
              startTotalMinutes,
            ],
          },
          {
            $lte: [
              {
                $add: [
                  {
                    $multiply: [
                      {
                        $hour: {
                          date: '$createdAt',
                          timezone: 'Asia/Kolkata',
                        },
                      },
                      60,
                    ],
                  },
                  {
                    $minute: {
                      date: '$createdAt',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                ],
              },
              endTotalMinutes,
            ],
          },
        ],
      };
    }

    const pipeline = [
      /**
       * STEP 1: Match records
       */
      {
        $match: matchCondition,
      },

      /**
       * STEP 2: Calculate response time in hours
       */
      {
        $addFields: {
          timeTakenHours: {
            $divide: [
              {
                $subtract: ['$closedAt', '$createdAt'],
              },
              1000 * 60 * 60,
            ],
          },
        },
      },

      /**
       * STEP 3: Group by source
       */
      {
        $group: {
          _id: {
            $toLower: '$source',
          },
          avgTime: {
            $avg: '$timeTakenHours',
          },
          totalTickets: {
            $sum: 1,
          },
        },
      },

      /**
       * STEP 4: Project clean output
       */
      {
        $project: {
          _id: 0,
          source: '$_id',
          avgTime: {
            $round: ['$avgTime', 1],
          },
          totalTickets: 1,
        },
      },
    ];

    const result = (await this.QuestionCollection.aggregate(pipeline, {
      session,
    }).toArray()) as {
      source: string;
      avgTime: number;
      totalTickets: number;
    }[];

    const whatsapp = result.find(r => r.source === 'whatsapp')?.avgTime ?? 0;

    const ajrasakha = result.find(r => r.source === 'ajrasakha')?.avgTime ?? 0;

    return {
      whatsapp,
      ajrasakha,
    };
  }

  async getMonthAnalytics(
    goldenDataSelectedYear: string,
    goldenDataSelectedMonth: string,
    customStartTime?: string,
    customEndTime?: string,
    session?: ClientSession,
  ): Promise<{
    weeksData: GoldenDatasetEntry[];
    totalEntriesByType: number;
    totalVerifiedByType: number;
    moderatorBreakdown?: {moderatorName: string; count: number}[];
    questionSourceBreakdown?: {whatsapp: number; ajrasakha: number};
    questionsAnsweredWithin120Min?: {whatsapp: number; ajrasakha: number};
    averageResponseTime?: {whatsapp: number; ajrasakha: number};
    questionsAnsweredAfter120Min?: {whatsapp: number; ajrasakha: number};
    questionStateBreakdown?: QuestionStateBreakdownBySource;
    paeMetrics?: {assigned: number; submitted: number; closed: number};
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

    const yearNum = Number(goldenDataSelectedYear);
    const monthNum = monthNames.indexOf(goldenDataSelectedMonth);
    if (monthNum === -1) throw new BadRequestError('Invalid month name');

    const startDate = new Date(yearNum, monthNum, 1);
    const endDate = new Date(yearNum, monthNum + 1, 1);

    // Build match condition with optional time filtering
    const matchCondition: any = {
      createdAt: {$gte: startDate, $lt: endDate},
      status: {$ne: 'pass'},
    };

    const closedMatchCondition: any = {
      status: 'closed',
      closedAt: {
        $gte: startDate,
        $lt: endDate,
      },
    };

    // Add time filtering if provided
    if (customStartTime && customEndTime) {
      const [startHour, startMinute] = customStartTime.split(':').map(Number);
      const [endHour, endMinute] = customEndTime.split(':').map(Number);

      matchCondition.$expr = {
        $and: [
          {
            $gte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              startHour * 60 + startMinute,
            ],
          },
          {
            $lte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              endHour * 60 + endMinute,
            ],
          },
        ],
      };

      closedMatchCondition.$expr = {
        $and: [
          {
            $gte: [
              {
                $add: [
                  {
                    $multiply: [
                      {
                        $hour: {
                          date: '$closedAt',
                          timezone: 'Asia/Kolkata',
                        },
                      },
                      60,
                    ],
                  },
                  {
                    $minute: {
                      date: '$closedAt',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                ],
              },
              startHour * 60 + startMinute,
            ],
          },
          {
            $lte: [
              {
                $add: [
                  {
                    $multiply: [
                      {
                        $hour: {
                          date: '$closedAt',
                          timezone: 'Asia/Kolkata',
                        },
                      },
                      60,
                    ],
                  },
                  {
                    $minute: {
                      date: '$closedAt',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                ],
              },
              endHour * 60 + endMinute,
            ],
          },
        ],
      };
    }

    const weeksDataRaw = await this.QuestionCollection.aggregate(
      [
        {
          $match: matchCondition,
        },
        {
          $addFields: {
            weekOfMonth: {$ceil: {$divide: [{$dayOfMonth: '$createdAt'}, 7]}},
          },
        },
        {
          $group: {
            _id: {week: '$weekOfMonth'},
            totalEntries: {$sum: 1},
            totalVerified: {
              $sum: {$cond: [{$eq: ['$status', 'closed']}, 1, 0]},
            },
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
        // entries: 0,
        // verified: match?.totalClosed ?? 0,
        entries: match?.totalEntries ?? 0,
        verified: match?.totalVerified ?? 0,
      };
    });

    const [closedStats] = await this.QuestionCollection.aggregate(
      [
        {
          $match: closedMatchCondition,
        },
        {
          $count: 'totalVerified',
        },
      ],
      { session },
    ).toArray();

    const totalEntriesByType = weeksDataRaw.reduce(
      (acc, curr) => acc + (curr.totalEntries || 0),
      0,
    );
   const totalVerifiedByType = closedStats?.totalVerified ?? 0;

    const {moderatorBreakdown} = await this.getTodayApproved(
      session,
      startDate,
      endDate,
    );
    const questionSourceBreakdown = await this.getQuestionSourceBreakdown(
      session,
      startDate,
      endDate,
      customStartTime,
      customEndTime,
    );
    const questionsAnsweredWithin120Min =
      await this.getQuestionsAnsweredWithin120Minutes(
        session,
        startDate,
        endDate,
        customStartTime,
        customEndTime,
      );
    const averageResponseTime = await this.getAverageResponseTime(
      session,
      startDate,
      endDate,
      customStartTime,
      customEndTime,
    );
    const questionsAnsweredAfter120Min =
      await this.getQuestionsAnsweredAfter120Minutes(
        session,
        startDate,
        endDate,
      );
    const questionStateBreakdown = await this.getQuestionStateBreakdown(
      session,
      startDate,
      endDate,
    );
    const paeMetrics = await this.getPAEMetrics(
      session,
      startDate,
      endDate,
      customStartTime,
      customEndTime,
    );
    return {
      weeksData,
      totalEntriesByType,
      totalVerifiedByType,
      moderatorBreakdown,
      questionSourceBreakdown,
      questionsAnsweredWithin120Min,
      averageResponseTime,
      questionsAnsweredAfter120Min,
      questionStateBreakdown,
      paeMetrics,
    };
  }

  async getWeekAnalytics(
    goldenDataSelectedYear: string,
    goldenDataSelectedMonth: string,
    goldenDataSelectedWeek: string,
    customStartTime?: string,
    customEndTime?: string,
    session?: ClientSession,
  ): Promise<{
    dailyData: GoldenDatasetEntry[];
    totalEntriesByType: number;
    totalVerifiedByType: number;
    moderatorBreakdown?: {moderatorName: string; count: number}[];
    questionSourceBreakdown?: {whatsapp: number; ajrasakha: number};
    questionsAnsweredWithin120Min?: {whatsapp: number; ajrasakha: number};
    averageResponseTime?: {whatsapp: number; ajrasakha: number};
    questionsAnsweredAfter120Min?: {whatsapp: number; ajrasakha: number};
    questionStateBreakdown?: QuestionStateBreakdownBySource;
    paeMetrics?: {assigned: number; submitted: number; closed: number};
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

    // Calculate start and end dates for the selected week
    const weekNum = Number(goldenDataSelectedWeek.replace('Week ', ''));
    const startDay = (weekNum - 1) * 7 + 1; // start day of the week
    const endDay = startDay + 6; // end day of the week

    const startDate = new Date(yearNum, monthNum, startDay);
    const endDate = new Date(yearNum, monthNum, endDay + 1); // +1 for exclusive range

    // Build match condition with optional time filtering
    const matchCondition: any = {
      createdAt: {$gte: startDate, $lt: endDate},
      status: {$ne: 'pass'},
    };

    const closedMatchCondition: any = {
      status: 'closed',
      closedAt: {
        $gte: startDate,
        $lt: endDate,
      },
    };

    // Add time filtering if provided
    if (customStartTime && customEndTime) {
      const [startHour, startMinute] = customStartTime.split(':').map(Number);
      const [endHour, endMinute] = customEndTime.split(':').map(Number);

      matchCondition.$expr = {
        $and: [
          {
            $gte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              startHour * 60 + startMinute,
            ],
          },
          {
            $lte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              endHour * 60 + endMinute,
            ],
          },
        ],
      };

      closedMatchCondition.$expr = {
        $and: [
          {
            $gte: [
              {
                $add: [
                  {
                    $multiply: [
                      {
                        $hour: {
                          date: '$closedAt',
                          timezone: 'Asia/Kolkata',
                        },
                      },
                      60,
                    ],
                  },
                  {
                    $minute: {
                      date: '$closedAt',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                ],
              },
              startHour * 60 + startMinute,
            ],
          },
          {
            $lte: [
              {
                $add: [
                  {
                    $multiply: [
                      {
                        $hour: {
                          date: '$closedAt',
                          timezone: 'Asia/Kolkata',
                        },
                      },
                      60,
                    ],
                  },
                  {
                    $minute: {
                      date: '$closedAt',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                ],
              },
              endHour * 60 + endMinute,
            ],
          },
        ],
      };
    }
    const dailyDataRaw = await this.QuestionCollection.aggregate(
      [
        {
          $match: matchCondition,
        },
        {
          $addFields: {
            dayOfWeek: {$dayOfWeek: '$createdAt'},
          },
        },
        {
          $group: {
            _id: {day: '$dayOfWeek'},
            totalEntries: {$sum: 1},
            totalVerified: {
              $sum: {$cond: [{$eq: ['$status', 'closed']}, 1, 0]},
            },
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
        // entries: 0,
        // verified: match?.totalClosed ?? 0,
        entries: match?.totalEntries ?? 0,
        verified: match?.totalVerified ?? 0,
      };
    });

    const [closedStats] = await this.QuestionCollection.aggregate(
      [
        {
          $match: closedMatchCondition,
        },
        {
          $count: 'totalVerified',
        },
      ],
      { session },
    ).toArray();

    const totalEntriesByType = dailyDataRaw.reduce(
      (acc, curr) => acc + curr.totalEntries,
      0,
    );
    const totalVerifiedByType = closedStats?.totalVerified ?? 0;

    const {moderatorBreakdown} = await this.getTodayApproved(
      session,
      startDate,
      endDate,
    );
    const questionSourceBreakdown = await this.getQuestionSourceBreakdown(
      session,
      startDate,
      endDate,
      customStartTime,
      customEndTime,
    );
    const questionsAnsweredWithin120Min =
      await this.getQuestionsAnsweredWithin120Minutes(
        session,
        startDate,
        endDate,
        customStartTime,
        customEndTime,
      );
    const averageResponseTime = await this.getAverageResponseTime(
      session,
      startDate,
      endDate,
      customStartTime,
      customEndTime,
    );
    const questionsAnsweredAfter120Min =
      await this.getQuestionsAnsweredAfter120Minutes(
        session,
        startDate,
        endDate,
      );
    const questionStateBreakdown = await this.getQuestionStateBreakdown(
      session,
      startDate,
      endDate,
    );
    const paeMetrics = await this.getPAEMetrics(
      session,
      startDate,
      endDate,
      customStartTime,
      customEndTime,
    );
    return {
      dailyData,
      totalEntriesByType,
      totalVerifiedByType,
      moderatorBreakdown,
      questionSourceBreakdown,
      questionsAnsweredWithin120Min,
      averageResponseTime,
      questionsAnsweredAfter120Min,
      questionStateBreakdown,
      paeMetrics,
    };
  }

  async getDailyAnalytics(
    goldenDataSelectedYear: string,
    goldenDataSelectedMonth: string,
    goldenDataSelectedWeek: string,
    goldenDataSelectedDay: string,
    customStartTime?: string,
    customEndTime?: string,
    session?: ClientSession,
  ): Promise<{
    dayHourlyData: Record<string, GoldenDatasetEntry[]>;
    totalEntriesByType: number;
    totalVerifiedByType: number;
    moderatorBreakdown?: {moderatorName: string; count: number}[];
    questionSourceBreakdown?: {whatsapp: number; ajrasakha: number};
    questionsAnsweredWithin120Min?: {whatsapp: number; ajrasakha: number};
    averageResponseTime?: {whatsapp: number; ajrasakha: number};
    paeMetrics?: {assigned: number; submitted: number; closed: number};
    questionsAnsweredAfter120Min?: {whatsapp: number; ajrasakha: number};
    questionStateBreakdown?: QuestionStateBreakdownBySource;
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

    // Build match condition with optional time filtering
    const matchCondition: any = {
      createdAt: {$gte: startDate, $lt: endDate},
      status: {$ne: 'pass'},
    };

    const closedMatchCondition: any = {
      status: 'closed',
      closedAt: {
        $gte: startDate,
        $lt: endDate,
      },
    };

    // Add time filtering if provided
    if (customStartTime && customEndTime) {
      const [startHour, startMinute] = customStartTime.split(':').map(Number);
      const [endHour, endMinute] = customEndTime.split(':').map(Number);

      matchCondition.$expr = {
        $and: [
          {
            $gte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              startHour * 60 + startMinute,
            ],
          },
          {
            $lte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              endHour * 60 + endMinute,
            ],
          },
        ],
      };

      closedMatchCondition.$expr = {
    $and: [
      {
        $gte: [
          {
            $add: [
              {
                $multiply: [
                  {
                    $hour: {
                      date: '$closedAt',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                  60,
                ],
              },
              {
                $minute: {
                  date: '$closedAt',
                  timezone: 'Asia/Kolkata',
                },
              },
            ],
          },
          startHour * 60 + startMinute,
        ],
      },
      {
        $lte: [
          {
            $add: [
              {
                $multiply: [
                  {
                    $hour: {
                      date: '$closedAt',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                  60,
                ],
              },
              {
                $minute: {
                  date: '$closedAt',
                  timezone: 'Asia/Kolkata',
                },
              },
            ],
          },
          endHour * 60 + endMinute,
        ],
      },
    ],
  };
    }


    const answers = await this.QuestionCollection.aggregate(
      [
        {
          $match: matchCondition,
        },
        {
          $addFields: {
            hourOfDay: {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
            dayOfWeek: {
              $dayOfWeek: {date: '$createdAt', timezone: 'Asia/Kolkata'},
            },
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
            totalEntries: {$sum: 1},
            totalVerified: {
              $sum: {$cond: [{$eq: ['$status', 'closed']}, 1, 0]},
            },
          },
        },
        {
          $sort: {_id: 1},
        },
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
          // entries: 0,
          // verified: match?.totalClosed ?? 0,

          entries: match?.totalEntries ?? 0,
          verified: match?.totalVerified ?? 0,
        };
      },
    );

    const [closedStats] = await this.QuestionCollection.aggregate(
  [
    {
      $match: closedMatchCondition,
    },
    {
      $addFields: {
        dayOfWeek: {
          $dayOfWeek: {
            date: '$closedAt',
            timezone: 'Asia/Kolkata',
          },
        },
      },
    },
    {
      $match: {
        dayOfWeek: selectedDayNum + 1,
      },
    },
    {
      $count: 'totalVerified',
    },
  ],
  { session },
).toArray();

    const totalEntriesByType = answers.reduce(
      (acc, curr) => acc + curr.totalEntries,
      0,
    );
   const totalVerifiedByType = closedStats?.totalVerified ?? 0;

    // Filter moderator breakdown for the specific day
    const dayStartDate = new Date(
      yearNum,
      monthNum,
      startDay +
        selectedDayNum -
        dayMap[
          Object.keys(dayMap).find(
            key => dayMap[key] === (startDay % 7 === 0 ? 0 : startDay % 7),
          )!
        ],
    );

    const startOfWeekDate = new Date(yearNum, monthNum, startDay);
    const startOfWeekDayNum = startOfWeekDate.getDay();

    const diff = selectedDayNum - startOfWeekDayNum;
    const targetDate = new Date(yearNum, monthNum, startDay + diff);

    const targetDayNum = selectedDayNum;

    let specificDayStart: Date | null = null;
    let current = new Date(startDate);

    while (current < endDate) {
      if (current.getDay() === targetDayNum) {
        specificDayStart = new Date(current);
        break;
      }
      current.setDate(current.getDate() + 1);
    }

    let moderatorBreakdown: {moderatorName: string; count: number}[] = [];
    let questionSourceBreakdown: {whatsapp: number; ajrasakha: number} = {
      whatsapp: 0,
      ajrasakha: 0,
    };
    let questionsAnsweredWithin120Min: {whatsapp: number; ajrasakha: number} = {
      whatsapp: 0,
      ajrasakha: 0,
    };
    let averageResponseTime: {whatsapp: number; ajrasakha: number} = {
      whatsapp: 0,
      ajrasakha: 0,
    };
    let questionsAnsweredAfter120Min: {whatsapp: number; ajrasakha: number} = {
      whatsapp: 0,
      ajrasakha: 0,
    };
    let questionStateBreakdown: QuestionStateBreakdownBySource | undefined;

    if (specificDayStart) {
      const specificDayEnd = new Date(specificDayStart);
      specificDayEnd.setDate(specificDayEnd.getDate() + 1);
      const result = await this.getTodayApproved(
        session,
        specificDayStart,
        specificDayEnd,
      );
      moderatorBreakdown = result.moderatorBreakdown || [];
      questionSourceBreakdown = await this.getQuestionSourceBreakdown(
        session,
        specificDayStart,
        specificDayEnd,
        customStartTime,
        customEndTime,
      );
      questionsAnsweredWithin120Min =
        await this.getQuestionsAnsweredWithin120Minutes(
          session,
          specificDayStart,
          specificDayEnd,
          customStartTime,
          customEndTime,
        );
      averageResponseTime = await this.getAverageResponseTime(
        session,
        specificDayStart,
        specificDayEnd,
        customStartTime,
        customEndTime,
      );
      questionsAnsweredAfter120Min =
        await this.getQuestionsAnsweredAfter120Minutes(
          session,
          specificDayStart,
          specificDayEnd,
        );
      questionStateBreakdown = await this.getQuestionStateBreakdown(
        session,
        specificDayStart,
        specificDayEnd,
      );
    }

    const paeMetrics = await this.getPAEMetrics(
      session,
      startDate,
      endDate,
      customStartTime,
      customEndTime,
    );

    return {
      dayHourlyData: {[goldenDataSelectedDay]: hourlyData},
      totalEntriesByType,
      totalVerifiedByType,
      moderatorBreakdown,
      questionSourceBreakdown,
      questionsAnsweredWithin120Min,
      averageResponseTime,
      paeMetrics,
      questionsAnsweredAfter120Min,
      questionStateBreakdown,
    };
  }

  async getCustomRangeAnalytics(
    customStartDateTime: string,
    customEndDateTime: string,
    session?: ClientSession,
  ): Promise<{
    customData: GoldenDatasetEntry[];
    totalEntriesByType: number;
    totalVerifiedByType: number;
    moderatorBreakdown?: {moderatorName: string; count: number}[];
    questionSourceBreakdown?: {whatsapp: number; ajrasakha: number};
    questionsAnsweredWithin120Min?: {whatsapp: number; ajrasakha: number};
    averageResponseTime?: {whatsapp: number; ajrasakha: number};
  }> {
    await this.init();

    const startDate = new Date(customStartDateTime);
    const endDate = new Date(customEndDateTime);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestError('Invalid date format');
    }

    if (startDate >= endDate) {
      throw new BadRequestError('Start date must be before end date');
    }

    // Aggregate data by day for the custom range
    const customDataRaw = await this.QuestionCollection.aggregate(
      [
        {
          $match: {
            createdAt: {$gte: startDate, $lt: endDate},
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {format: '%Y-%m-%d', date: '$createdAt'},
            },
            totalEntries: {$sum: 1},
            totalVerified: {
              $sum: {$cond: [{$eq: ['$status', 'closed']}, 1, 0]},
            },
          },
        },
        {$sort: {_id: 1}},
      ],
      {session},
    ).toArray();

    const customData: GoldenDatasetEntry[] = customDataRaw.map((item: any) => ({
      month: item._id, // Using date string as label
      entries: item.totalEntries,
      verified: item.totalVerified,
    }));

    const totalEntriesByType = customData.reduce(
      (sum, d) => sum + d.entries,
      0,
    );
    const totalVerifiedByType = customData.reduce(
      (sum, d) => sum + d.verified,
      0,
    );

    const {moderatorBreakdown} = await this.getTodayApproved(
      session,
      startDate,
      endDate,
    );
    const questionSourceBreakdown = await this.getQuestionSourceBreakdown(
      session,
      startDate,
      endDate,
    );
    const questionsAnsweredWithin120Min =
      await this.getQuestionsAnsweredWithin120Minutes(
        session,
        startDate,
        endDate,
      );
    const averageResponseTime = await this.getAverageResponseTime(
      session,
      startDate,
      endDate,
    );

    return {
      customData,
      totalEntriesByType,
      totalVerifiedByType,
      moderatorBreakdown,
      questionSourceBreakdown,
      questionsAnsweredWithin120Min,
      averageResponseTime,
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
        {$match: {status: {$ne: 'pass'}}},
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
    status?: string[],
    state?: string[],
    source?: string[],
    crop?: string[],
  ): Promise<{analytics: Analytics}> {
    await this.init();

    const filterDate: any = {};
    if (startTime) filterDate.$gte = new Date(`${startTime}T00:00:00.000Z`);
    if (endTime) filterDate.$lte = new Date(`${endTime}T23:59:59.999Z`);

    const matchStage: any = {};
    if (status?.length) {
      matchStage.status = {$in: status};
    }
    if (Object.keys(filterDate).length > 0) {
      matchStage.createdAt = filterDate;
    }
    if (state?.length) {
      matchStage['details.state'] = {$in: state};
    }
    if (source?.length) {
      matchStage.source = {$in: source};
    }
    if (crop?.length) {
      const escapeRegex = (s: string) =>
        s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // matchStage['details.crop'] = {
      //   $in: crop.map((c) => new RegExp(`^${escapeRegex(c)}$`, 'i')),
      // };
      matchStage.$expr = {
        $in: [
          {
            $ifNull: ['$details.normalised_crop', '$details.crop'],
          },
          crop,
        ],
      };
    }

    const sortAllItems = (data: {name: string; count: number}[]) => {
      return [...data].sort((a, b) => b.count - a.count);
    };

    // Aggregate crop data
    const cropDataRaw = (await this.QuestionCollection.aggregate(
      [
        {$match: matchStage},
        // { $group: { _id: '$details.crop', count: { $sum: 1 } } },
        {
          $group: {
            _id: {
              $ifNull: [
                '$details.normalised_crop',
                {
                  $ifNull: ['$details.crop', 'Not Normalized'],
                },
              ],
            },
            count: {$sum: 1},
          },
        },
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
        { $unwind: '$details.domain' },
        {$group: {_id: '$details.domain', count: {$sum: 1}}},
        {$project: {name: '$_id', count: 1, _id: 0}},
      ],
      {session},
    ).toArray()) as AnalyticsItem[];

    // Table: group by state × crop × source, pivot status counts
    const tableData = (await this.QuestionCollection.aggregate(
      [
        {$match: matchStage},
        {
          $group: {
            _id: {
              state: '$details.state',
              //  crop: '$details.crop',
              crop: {
                $ifNull: [
                  '$details.normalised_crop',
                  {
                    $ifNull: ['$details.crop', 'Not Normalized'],
                  },
                ],
              },
              source: '$source',
            },
            open: {$sum: {$cond: [{$eq: ['$status', 'open']}, 1, 0]}},
            closed: {$sum: {$cond: [{$eq: ['$status', 'closed']}, 1, 0]}},
            inReview: {$sum: {$cond: [{$eq: ['$status', 'in-review']}, 1, 0]}},
            delayed: {$sum: {$cond: [{$eq: ['$status', 'delayed']}, 1, 0]}},
            reRouted: {$sum: {$cond: [{$eq: ['$status', 're-routed']}, 1, 0]}},
            hold: {$sum: {$cond: [{$eq: ['$status', 'hold']}, 1, 0]}},
            paeSubmitted: {
              $sum: {$cond: [{$eq: ['$status', 'pae_submitted']}, 1, 0]},
            },
            draft: {$sum: {$cond: [{$eq: ['$status', 'draft']}, 1, 0]}},
            duplicate: {$sum: {$cond: [{$eq: ['$status', 'duplicate']}, 1, 0]}},
            total: {$sum: 1},
            // Earliest question ever created in this group
            lastPushedDate: {$min: '$createdAt'},
            // Most recent closedAt among questions that are actually closed
            lastClosedDate: {
              $max: {
                $cond: [{$eq: ['$status', 'closed']}, '$closedAt', null],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            state: '$_id.state',
            crop: '$_id.crop',
            source: '$_id.source',
            open: 1,
            closed: 1,
            inReview: 1,
            delayed: 1,
            reRouted: 1,
            hold: 1,
            paeSubmitted: 1,
            draft: 1,
            duplicate: 1,
            total: 1,
            lastPushedDate: 1,
            lastClosedDate: 1,
            completionPct: {
              $cond: [
                {$gt: ['$total', 0]},
                {
                  $round: [
                    {$multiply: [{$divide: ['$closed', '$total']}, 100]},
                    1,
                  ],
                },
                0,
              ],
            },
          },
        },
        {$sort: {state: 1, crop: 1, source: 1}},
      ],
      {session},
    ).toArray()) as AnalyticsTableRow[];

    return {
      analytics: {
        cropData: sortAllItems(cropDataRaw),
        stateData: stateDataRaw,
        domainData: sortAllItems(domainDataRaw),
        tableData,
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

  async getQuestionsAndReviewLevel(
    query: GetDetailedQuestionsQuery & {searchEmbedding: number[] | null},
    session?: ClientSession,
  ): Promise<QuestionLevelResponse> {
    await this.init();
    const {page = 1, limit = 10, search, sort = ''} = query;
    const skip = (page - 1) * limit;

    const {filter} = await buildQuestionFilter(
      query,
      this.QuestionSubmissionCollection,
      this.AnswersCollection,
    );
    if (search && search.trim().length) {
      filter.question = {$regex: search.trim(), $options: 'i'};
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
          updatedAt: 1,
          moderatorAssignedAt: 1,
          authors_history: 1, // ← Add authors_history to projection
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

      //normalize date
      {
        $addFields: {
          submissionCreatedAt: {
            $cond: [
              {$eq: [{$type: '$submission.createdAt'}, 'string']},
              {$toDate: '$submission.createdAt'},
              '$submission.createdAt',
            ],
          },

          history: {
            $map: {
              input: {$ifNull: ['$submission.history', []]},
              as: 'h',
              in: {
                $mergeObjects: [
                  '$$h',
                  {
                    createdAt: {
                      $cond: [
                        {$eq: [{$type: '$$h.createdAt'}, 'string']},
                        {$toDate: '$$h.createdAt'},
                        '$$h.createdAt',
                      ],
                    },
                    updatedAt: {
                      $cond: [
                        {$eq: [{$type: '$$h.updatedAt'}, 'string']},
                        {$toDate: '$$h.updatedAt'},
                        '$$h.updatedAt',
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          currentLevel: {
            $cond: [
              {$gt: [{$size: '$history'}, 0]},
              {$subtract: [{$size: '$history'}, 1]},
              -1,
            ],
          },

          // Author timer start time logic (same as getTimerStartTime)
          authorTimerStartTime: {
            $let: {
              vars: {
                isAuthor: {
                  $and: [
                    {$gt: [{$size: {$ifNull: ['$submission.queue', []]}}, 0]},
                    {$eq: [{$size: '$history'}, 0]},
                  ],
                },
                lastAuthorEntry: {
                  $cond: [
                    {$gt: [{$size: {$ifNull: ['$authors_history', []]}}, 0]},
                    {
                      $arrayElemAt: [
                        {$ifNull: ['$authors_history', []]},
                        {
                          $subtract: [
                            {$size: {$ifNull: ['$authors_history', []]}},
                            1,
                          ],
                        },
                      ],
                    },
                    null,
                  ],
                },
              },
              in: {
                $cond: [
                  '$$isAuthor',
                  {
                    $cond: [
                      {
                        $and: [
                          {
                            $gt: [
                              {$size: {$ifNull: ['$authors_history', []]}},
                              0,
                            ],
                          },
                          {$ne: ['$$lastAuthorEntry', null]},
                        ],
                      },
                      '$$lastAuthorEntry.createdAt',
                      {
                        $cond: [
                          {$ne: ['$submissionCreatedAt', null]},
                          '$submissionCreatedAt',
                          '$createdAt',
                        ],
                      },
                    ],
                  },
                  {
                    $cond: [
                      {$gt: [{$size: '$history'}, 0]},
                      {
                        $let: {
                          vars: {
                            lastHistoryEntry: {
                              $arrayElemAt: [
                                '$history',
                                {$subtract: [{$size: '$history'}, 1]},
                              ],
                            },
                          },
                          in: '$$lastHistoryEntry.createdAt',
                        },
                      },
                      '$createdAt',
                    ],
                  },
                ],
              },
            },
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
                              $let: {
                                vars: {
                                  rawDiff: {
                                    $dateDiff: {
                                      startDate: '$authorTimerStartTime',
                                      endDate: '$$NOW',
                                      unit: 'second',
                                    },
                                  },
                                },
                                in: {$max: [0, '$$rawDiff']},
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
                                          $ne: ['$authorTimerStartTime', null],
                                        },
                                      ],
                                    },
                                    {
                                      $let: {
                                        vars: {
                                          rawDiff: {
                                            $dateDiff: {
                                              startDate:
                                                '$authorTimerStartTime',
                                              endDate: '$$hist.createdAt',
                                              unit: 'second',
                                            },
                                          },
                                        },
                                        in: {$max: [0, '$$rawDiff']},
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
          updatedAt: 1,
          reviewLevels: 1,
          totalTurnAround: 1,
          authors_history: 1,
          moderatorAssignedAt: 1,
          submission: {
            _id: '$submission._id',
            questionId: '$submission.questionId',
            createdAt: '$submission.createdAt',
            history: '$submission.history',
            queue: '$submission.queue',
          },
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
        updatedAt: doc.updatedAt ?? null,
        reviewLevels: doc.reviewLevels,
        authors_history: doc.authors_history,
        moderatorAssignedAt: doc.moderatorAssignedAt ?? null,
        submission: doc.submission,
      })),
    };
  }

  async findByDateRangeAndSource(
    startDate: Date,
    endDate: Date,
    sources: 'AJRASAKHA',
  ): Promise<IQuestion[]> {
    await this.init();
    const questions = await this.QuestionCollection.find(
      {
        source: sources,
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
      {
        projection: {
          userId: 0,
          contextId: 0,
        },
      },
    )
      .sort({createdAt: -1})
      .toArray();
    return questions.map(q => ({
      ...q,
      _id: q._id?.toString(),
    }));
  }
  async getMonthlyQuestionStats(
    startDate?: Date,
    endDate?: Date,
    session?: ClientSession,
  ): Promise<
    Array<{
      year: number;
      month: string;
      totalQuestions: number;
      modifiedAnswers: number;
      rejectedAnswers: number;
    }>
  > {
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

    // Set default dates if not provided
    const defaultStartDate = startDate || new Date('2025-09-01T00:00:00.000Z');
    let defaultEndDate = endDate || new Date();
    // Set end of day for endDate
    if (endDate) {
      defaultEndDate = new Date(endDate);
      defaultEndDate.setHours(23, 59, 59, 999);
    }

    // Get total questions per month
    const questionsPerMonth = await this.QuestionCollection.aggregate(
      [
        {
          $match: {
            createdAt: {$gte: defaultStartDate, $lte: defaultEndDate},
          },
        },
        {
          $group: {
            _id: {
              year: {$year: '$createdAt'},
              month: {$month: '$createdAt'},
            },
            totalQuestions: {$sum: 1},
          },
        },
        {$sort: {'_id.year': 1, '_id.month': 1}},
      ],
      {session},
    ).toArray();

    const answerStats = await this.AnswersCollection.aggregate(
      [
        {
          $match: {
            createdAt: {$gte: defaultStartDate, $lte: defaultEndDate},
          },
        },

        // Count modifications per answer
        {
          $addFields: {
            modificationsCount: {$size: {$ifNull: ['$modifications', []]}},
          },
        },

        // Group per question
        {
          $group: {
            _id: '$questionId',
            totalAnswers: {$sum: 1},
            hasModifiedAnswer: {
              $max: {$cond: [{$gte: ['$modificationsCount', 1]}, 1, 0]},
            },
            latestCreatedAt: {$max: '$createdAt'},
          },
        },

        // Month-wise metrics
        {
          $group: {
            _id: {
              year: {$year: '$latestCreatedAt'},
              month: {$month: '$latestCreatedAt'},
            },

            // Modified questions
            modifiedCount: {
              $sum: {
                $cond: [{$eq: ['$hasModifiedAnswer', 1]}, 1, 0],
              },
            },

            // Rejected = multiple answers BUT no modifications
            rejectedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$gte: ['$totalAnswers', 2]},
                      {$eq: ['$hasModifiedAnswer', 0]},
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },

        {$sort: {'_id.year': 1, '_id.month': 1}},
      ],
      {
        allowDiskUse: true,
        session,
      },
    ).toArray();

    // Merge the results
    const results = questionsPerMonth.map((questionStat: any) => {
      const answerStat = answerStats.find(
        (a: any) =>
          a._id.year === questionStat._id.year &&
          a._id.month === questionStat._id.month,
      );

      return {
        year: questionStat._id.year,
        month: monthNames[questionStat._id.month - 1],
        totalQuestions: questionStat.totalQuestions,
        modifiedAnswers: answerStat?.modifiedCount || 0,
        rejectedAnswers: answerStat?.rejectedCount || 0,
      };
    });

    return results;
  }

  async getQuestionsByFilters(
    filters: any,
    session?: ClientSession,
    useDuplicateCollection = false,
    limit?: number,
  ): Promise<IQuestion[]> {
    await this.init();

    // for duplicate question
    //  useDuplicateCollection
    //   ? this.DuplicateQuestionCollection
    //   :
    const collection = this.QuestionCollection;

    let query = collection.find(filters, {session}).sort({createdAt: -1});
    
    if (limit) {
      query = query.limit(limit);
    }
    
    return await query.toArray();
  }
  async getAllQuestionEmbeddings(
    session?: ClientSession,
  ): Promise<{_id: ObjectId; embedding: number[]}[]> {
    const results = await this.QuestionCollection.find(
      {embedding: {$exists: true, $ne: []}},
      {projection: {_id: 1, embedding: 1}, session},
    ).toArray();

    return results.map(doc => ({
      _id: typeof doc._id === 'string' ? new ObjectId(doc._id) : doc._id,
      embedding: doc.embedding || [],
    }));
  }
  async findTopSimilarQuestions(
    embedding: number[],
    k = 5,
    filter?: {
      state?: string;
      district?: string;
      crop?: string;
      domain?: string;
      season?: string;
    },
    session?: ClientSession,
  ): Promise<(ISimilarQuestion & {_vectorSearchScore: number})[]> {
    await this.init();

    const vectorSearchFilter: Record<string, string> = {};
    if (filter?.state) {
      vectorSearchFilter['details.state'] = filter.state;
    }
    if (filter?.district) {
      vectorSearchFilter['details.district'] = filter.district;
    }
    if (filter?.crop) {
      vectorSearchFilter['details.crop'] = filter.crop;
    }
    if (filter?.domain) {
      vectorSearchFilter['details.domain'] = filter.domain;
    }
    if (filter?.season) {
      vectorSearchFilter['details.season'] = filter.season;
    }

    const vectorSearchStage: any = {
      index: 'review_questions_vector_index', // your Atlas Vector Search index name
      path: 'embedding', // field storing the embeddings
      queryVector: embedding,
      numCandidates: k * 10, // recommended: 10x of k for better recall
      limit: k,
    };

    if (Object.keys(vectorSearchFilter).length > 0) {
      vectorSearchStage.filter = vectorSearchFilter;
    }

    const topSimilar = await this.QuestionCollection.aggregate(
      [
        {
          $vectorSearch: vectorSearchStage,
        },
        {
          $project: {
            _id: 1,
            question: 1,
            embedding: 1,
            details: 1,
            status: 1,
            // add other fields you need
            _vectorSearchScore: {$meta: 'vectorSearchScore'},
          },
        },
      ],
      {session},
    ).toArray();

    return topSimilar as any;
  }

  // Backfill normalised_crop (OPTIMIZED)
  async backfillNormalisedCrop(
    name: string,
    aliases: string[],
  ): Promise<number> {
    await this.init();

    const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const allValues = [name, ...(aliases || [])].map(v =>
      v.toLowerCase().trim(),
    );

    const conditions = allValues.map(val => ({
      'details.crop': {$regex: `^\\s*${escapeRegex(val)}\\s*$`, $options: 'i'},
    }));

    const result = await this.QuestionCollection.updateMany(
      {
        $and: [
          {$or: conditions},
          {
            $or: [
              {'details.normalised_crop': {$exists: false}},
              {'details.normalised_crop': null},
            ],
          },
        ],
      },
      {
        $set: {
          'details.normalised_crop': name.trim().toLowerCase(),
        },
      },
    );

    return result.modifiedCount;
  }

  async getQuestionsWithAnswerDetails(
    questionIds: string[],
  ): Promise<ICheckStatusResponse[]> {
    await this.init();
    const objectIds = questionIds.map(id => new ObjectId(id));

    const data = await this.QuestionCollection.aggregate([
      {
        $match: {
          _id: {$in: objectIds},
        },
      },

      // Lookup FINAL ANSWERS ONLY
      {
        $lookup: {
          from: 'answers',
          let: {qId: '$_id'},
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {$eq: ['$questionId', '$$qId']},
                    {$eq: ['$isFinalAnswer', true]},
                  ],
                },
              },
            },

            // Join author
            {
              $lookup: {
                from: 'users',
                localField: 'authorId',
                foreignField: '_id',
                as: 'author',
              },
            },
            {
              $unwind: {
                path: '$author',
                preserveNullAndEmptyArrays: true,
              },
            },

            // Shape answer
            {
              $project: {
                _id: 0,
                answer: 1,

                sources: {
                  $map: {
                    input: {$ifNull: ['$sources', []]},
                    as: 's',
                    in: {
                      source: '$$s.source',
                      page: '$$s.page',
                      sourceType: '$$s.sourceType',
                      sourceName: '$$s.sourceName',
                    },
                  },
                },

                authorName: {
                  $trim: {
                    input: {
                      $concat: [
                        {$ifNull: ['$author.firstName', '']},
                        ' ',
                        {$ifNull: ['$author.lastName', '']},
                      ],
                    },
                  },
                },
              },
            },
          ],
          as: 'finalAnswer',
        },
      },

      // Flatten answer (take first if exists)
      {
        $addFields: {
          finalAnswer: {$arrayElemAt: ['$finalAnswer', 0]},
        },
      },

      // Final response shape
      {
        $project: {
          _id: 0,

          question_id: {$toString: '$_id'},

          status: {
            $cond: {
              if: {$ifNull: ['$finalAnswer', false]},
              then: 'closed',
              else: 'pending',
            },
          },

          // Question fields (include what you need)
          question: '$text',
          metadata: '$details',
          priority: 1,
          details: 1,
          createdAt: 1,

          // Answer fields
          answer: {
            $ifNull: ['$finalAnswer.answer', null],
          },

          sources: {
            $ifNull: ['$finalAnswer.sources', []],
          },

          author: {
            $ifNull: ['$finalAnswer.authorName', null],
          },
        },
      },
    ]).toArray();
    // 🔥 Create map for quick lookup
    const map = new Map(data.map(item => [item.question_id, item]));

    // 🔥 Final response based on input order
    return questionIds.map(id => {
      const found = map.get(id);

      if (!found) {
        return {
          question_id: id,
          status: 'not_found',
          answer: null,
          sources: [],
          author: null,
          metadata: null,
          message: 'Question not exist',
        };
      }

      return {
        question_id: found.question_id,
        status: found.status,
        answer: found.status === 'closed' ? found.answer : null,
        sources: found.status === 'closed' ? found.sources : [],
        author: found.status === 'closed' ? found.author : null,
        metadata: found.metadata ?? null,
      };
    });
  }

  async getQuestionStatusSummary(
    query: GetDetailedQuestionsQuery,
    body: DetailedQuestionsBodyDto,
    session?: ClientSession,
  ): Promise<{
    totalQuestions: number;
    statuses: {status: string; count: number}[];
    sourceCounts: {source: string; count: number}[];
  }> {
    await this.init();

    const {filter} = await buildQuestionFilter(
      {...query, searchEmbedding: null},
      this.QuestionSubmissionCollection,
      this.AnswersCollection,
    );

    // Apply pae_review filter exactly matching findDetailedQuestions logic
    if (query.pae_review) {
      filter.pae_review = {$eq: true};
    } else {
      filter.$or = [{pae_review: {$eq: false}}, {pae_review: {$exists: false}}];
    }

    // Apply is_non_agri / dynamic filter exactly matching findDetailedQuestions logic
    if (query.is_non_agri === 'true' || query.is_non_agri === true) {
     // filter.status = 'non_agri';
    } else if (filter.status === undefined) {
     // filter.status = {$nin: ['non_agri', 'dynamic']};
    }

    // Apply isOnHold filter exactly matching findDetailedQuestions logic
    if (query.isOnHold === 'true') {
      filter.isOnHold = {$eq: true};
    }

    // Apply isHidden filter exactly matching findDetailedQuestions logic
    if (query.hiddenQuestions === 'true' || query.status === 'pass') {
      filter.isHidden = {$eq: true};
    }

    // Apply states/normalisedCrops from body if provided (matching findDetailedQuestions logic)
    if (body?.states && body.states.length > 0) {
      filter['details.state'] = {$in: body.states};
    }
    if (body?.normalisedCrops && body.normalisedCrops.length > 0) {
      const hasNotSet = body.normalisedCrops.includes('__NOT_SET__');
      const realCrops = body.normalisedCrops.filter(c => c !== '__NOT_SET__');
      if (!hasNotSet) {
        filter['details.normalised_crop'] = {$in: realCrops};
      } else {
        const orConditions: any[] = [
          {'details.normalised_crop': {$exists: false}},
          {'details.normalised_crop': null},
          {'details.normalised_crop': ''},
        ];
        if (realCrops.length > 0) {
          orConditions.push({'details.normalised_crop': {$in: realCrops}});
        }
        if (!filter.$and) filter.$and = [];
        filter.$and.push({$or: orConditions});
      }
    }

    const [statusResults, sourceResults] = await Promise.all([
      this.QuestionCollection.aggregate(
        [
          {$match: filter},
          {$group: {_id: '$status', count: {$sum: 1}}},
          {$project: {_id: 0, status: '$_id', count: 1}},
        ],
        {session},
      ).toArray(),
      this.QuestionCollection.aggregate(
        [
          {$match: filter},
          {$group: {_id: '$source', count: {$sum: 1}}},
          {$project: {_id: 0, source: '$_id', count: 1}},
        ],
        {session},
      ).toArray(),
    ]);

    const statuses = statusResults.map(r => ({
      status: r.status as string,
      count: r.count as number,
    }));

    const sourceCounts = sourceResults.map(r => ({
      source: r.source as string,
      count: r.count as number,
    }));

    const totalQuestions = statuses.reduce((sum, s) => sum + s.count, 0);

    return {totalQuestions, statuses, sourceCounts};
  }

  async getPAEMetrics(
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
    customStartTime?: string,
    customEndTime?: string,
  ): Promise<{
    assigned: number;
    submitted: number;
    closed: number;
  }> {
    await this.init();

    const matchCondition: any = {status: {$ne: 'pass'}};
    const closedMatchCondition: any = {};

    if (startDate && endDate) {
      // Filter by createdAt in IST format for assigned and submitted
      matchCondition.createdAt = {
        $gte: new Date(
          `${startDate.toISOString().split('T')[0]}T00:00:00.000+05:30`,
        ),
        $lt: new Date(
          `${endDate.toISOString().split('T')[0]}T23:59:59.999+05:30`,
        ),
      };

      // Filter by both createdAt and closedAt in IST format for closed
      closedMatchCondition.$and = [
        {
          createdAt: {
            $gte: new Date(
              `${startDate.toISOString().split('T')[0]}T00:00:00.000+05:30`,
            ),
            $lt: new Date(
              `${endDate.toISOString().split('T')[0]}T23:59:59.999+05:30`,
            ),
          },
        },
        {
          closedAt: {
            $gte: new Date(
              `${startDate.toISOString().split('T')[0]}T00:00:00.000+05:30`,
            ),
            $lt: new Date(
              `${endDate.toISOString().split('T')[0]}T23:59:59.999+05:30`,
            ),
          },
        },
      ];
    }

    // Add time filtering if provided
    if (customStartTime && customEndTime) {
      const [startHour, startMinute] = customStartTime.split(':').map(Number);
      const [endHour, endMinute] = customEndTime.split(':').map(Number);

      matchCondition.$expr = {
        $and: [
          {
            $gte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              startHour * 60 + startMinute,
            ],
          },
          {
            $lte: [
              {
                $add: [
                  {
                    $multiply: [
                      {$hour: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                      60,
                    ],
                  },
                  {$minute: {date: '$createdAt', timezone: 'Asia/Kolkata'}},
                ],
              },
              endHour * 60 + endMinute,
            ],
          },
        ],
      };
    }

    const paeMetrics = await this.QuestionCollection.aggregate(
      [
        {
          $facet: {
            assigned: [
              ...(Object.keys(matchCondition).length > 0
                ? [{$match: matchCondition}]
                : []),
              {
                $match: {
                  pae_review: true,
                  $or: [{status: 'open'}, {status: 'delayed'}],
                },
              },
              {
                $count: 'total',
              },
            ],
            submitted: [
              ...(Object.keys(matchCondition).length > 0
                ? [{$match: matchCondition}]
                : []),
              {
                $match: {
                  status: 'pae_submitted',
                },
              },
              {
                $count: 'total',
              },
            ],
            closed: [
              ...(Object.keys(closedMatchCondition).length > 0
                ? [{$match: closedMatchCondition}]
                : []),
              {
                $match: {
                  pae_review: true,
                  status: 'closed',
                },
              },
              {
                $count: 'total',
              },
            ],
          },
        },
      ],
      {session},
    ).toArray();

    const result = paeMetrics[0];

    return {
      assigned: result.assigned[0]?.total ?? 0,
      submitted: result.submitted[0]?.total ?? 0,
      closed: result.closed[0]?.total ?? 0,
    };
  }

  async count(filter = {}) {
    await this.init();
    return await this.QuestionCollection.countDocuments(filter);
  }

  async getQuestionsWithEmptyEmbeddings(
    limit = 50,
  ): Promise<{_id: ObjectId; question: string; text?: string}[]> {
    await this.init();

    return this.QuestionCollection.find(
      {
        $or: [
          {embedding: {$exists: false}},
          {embedding: null},
          {embedding: {$size: 0}},
        ],
      },
      {projection: {_id: 1, question: 1, text: 1}, limit},
    ).toArray() as Promise<{_id: ObjectId; question: string; text?: string}[]>;
  }

  async updateQuestionEmbedding(
    questionId: string,
    embedding: number[],
  ): Promise<void> {
    await this.init();
    await this.QuestionCollection.updateOne(
      {_id: new ObjectId(questionId)},
      {$set: {embedding, updatedAt: new Date()}},
    );
  }

  async getShiftBasedMetrics(
    startDate: string,
    // endDate: string,
    shift: 'morning' | 'evening' | 'all',
    source: 'annam' | 'whatsapp' | 'agri_expert',
    from: string,
    to:string,
    session?: ClientSession,
  ): Promise<{
    openAtMidnight: number;
    closedBetween12And6: number;
    questionsAdded: number;
    questionsClosed: number;
    averageClosureTimeInMinutes: number;
    totalReroutedQuestions: number;
  }> {
    await this.init();

    const start = new Date(`${startDate}T00:00:00+05:30`);

    const end = new Date(`${startDate}T23:59:59.999+05:30`);

    const midnight = new Date(start);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);

    const sixAM = new Date(start);
    sixAM.setDate(sixAM.getDate() + 1);
    sixAM.setHours(6, 0, 0, 0);

    const createdAtShiftFilter = getShiftFilter('createdAt', shift, from, to);

    const closedAtShiftFilter = getShiftFilter('closedAt', shift, from, to);

    const sourceFilter =
      source === 'annam'
        ? 'AJRASAKHA'
        : source === 'whatsapp'
          ? 'WHATSAPP'
          : 'AGRI_EXPERT';

    const [
      openAtMidnight,
      closedBetween12And6,
      questionsAdded,
      questionsClosed,
      averageClosureTimeResult,
      totalReroutedQuestions,
    ] = await Promise.all([

      // Questions that were not closed before 12:00 AM
      this.QuestionCollection.countDocuments(
        {
          createdAt: {
            $gte: start,
            $lte: end,
          },
          source: sourceFilter,
          $or: [
            { closedAt: null },
            { closedAt: { $gte: midnight } },
          ],
        },
        { session },
      ),

      // Questions that were closed between 12:00 AM and 6:00 AM
      this.QuestionCollection.countDocuments(
        {
          createdAt: {
            $gte: start,
            $lte: end,
          },
          source: sourceFilter,
          closedAt: {
            $gte: midnight,
            $lt: sixAM,
          },
        },
        { session },
      ),

      /**
       * Questions Added
       */
      this.QuestionCollection.countDocuments(
        {
          createdAt: {
            $gte: start,
            $lte: end,
          },

          source: sourceFilter,
          
          ...createdAtShiftFilter,
        },
        {session},
      ),

      /**
       * Questions Closed
       */
      this.QuestionCollection.countDocuments(
        {
          status: 'closed',

          closedAt: {
            $gte: start,
            $lte: end,
          },

          source: sourceFilter,

          ...closedAtShiftFilter,
        },
        {session},
      ),

      /**
       * Average Closure Time
       *
       * Only consider questions:
       * 1. Opened within selected date range
       * 2. Opened within selected shift
       * 3. Already closed
       */
      this.QuestionCollection.aggregate(
        [
          {
            $match: {
              status: 'closed',
              createdAt: {
                $gte: start,
                $lte: end,
              },
              closedAt: {
                $exists: true,
              },

              source: sourceFilter,

              ...createdAtShiftFilter,
            },
          },

          {
            $project: {
              closureTimeInMinutes: {
                $divide: [
                  {
                    $subtract: ['$closedAt', '$createdAt'],
                  },
                  1000 * 60,
                ],
              },
            },
          },

          {
            $group: {
              _id: null,
              averageClosureTimeInMinutes: {
                $avg: '$closureTimeInMinutes',
              },
            },
          },
        ],
        {session},
      ).toArray(),

      /**
       * total rerouted questions
       *
       * Only consider questions:
       * 1. Opened within selected date range
       * 2. Opened within selected shift
       */
      this.QuestionCollection.aggregate(
        [
          {
            $match: {
              status: 're-routed',
              createdAt: {
                $gte: start,
                $lte: end,
              },

              source: sourceFilter,

              ...createdAtShiftFilter,
            },
          },

          {
            $count: 'totalReroutedQuestions',
          },
        ],
        {session},
      ).toArray(),
    ]);

    return {
      openAtMidnight,
      closedBetween12And6,
      questionsAdded,
      questionsClosed,
      averageClosureTimeInMinutes: Number(
        (averageClosureTimeResult[0]?.averageClosureTimeInMinutes || 0).toFixed(
          2,
        ),
      ),
      totalReroutedQuestions:
        totalReroutedQuestions[0]?.totalReroutedQuestions || 0,
    };
  }

  async getShiftBasedTrends(
    startDate: string,
    // endDate: string,
    shift: 'morning' | 'evening' | 'all',
    source: 'annam' | 'whatsapp' | 'agri_expert',
    from: string,
    to:string,
    session?: ClientSession,
  ): Promise<
    {
      hour: string;
      added: number;
      closed: number;
    }[]
  > {
    await this.init();

    const start = new Date(`${startDate}T00:00:00+05:30`);

    const end = new Date(`${startDate}T23:59:59.999+05:30`);

    const sourceFilter =
      source === 'annam'
        ? 'AJRASAKHA'
        : source === 'whatsapp'
          ? 'WHATSAPP'
          : 'AGRI_EXPERT';

    /**
     * Added Questions Aggregation
     */
    const addedAnalytics = await this.QuestionCollection.aggregate(
      [
        {
          $match: {
            createdAt: {
              $gte: start,
              $lte: end,
            },
             source: sourceFilter,
            ...getShiftFilter('createdAt', shift, from, to),
          },
        },

        {
          $group: {
            _id: {
              $dateToString: {
                format: '%H:00',
                date: '$createdAt',
                timezone: 'Asia/Kolkata',
              },
            },
            added: {
              $sum: 1,
            },
          },
        },

        {
          $sort: {
            _id: 1,
          },
        },
      ],
      {session},
    ).toArray();

    /**
     * Closed Questions Aggregation
     */
    const closedAnalytics = await this.QuestionCollection.aggregate(
      [
        {
          $match: {
            status: 'closed',
            closedAt: {
              $gte: start,
              $lte: end,
            },
             source: sourceFilter,
            ...getShiftFilter('closedAt', shift, from, to),
          },
        },

        {
          $group: {
            _id: {
              $dateToString: {
                format: '%H:00',
                date: '$closedAt',
                timezone: 'Asia/Kolkata',
              },
            },
            closed: {
              $sum: 1,
            },
          },
        },

        {
          $sort: {
            _id: 1,
          },
        },
      ],
      {session},
    ).toArray();

    /**
     * Create fixed 24-hour buckets
     */
    const analyticsMap = new Map<
      string,
      {
        hour: string;
        added: number;
        closed: number;
      }
    >();

    /**
     * Initialize all hours
     */
    for (let hour = 0; hour < 24; hour++) {
      const formattedHour = `${hour.toString().padStart(2, '0')}:00`;

      analyticsMap.set(formattedHour, {
        hour: formattedHour,
        added: 0,
        closed: 0,
      });
    }

    /**
     * Merge added analytics
     */
    for (const item of addedAnalytics) {
      if (analyticsMap.has(item._id)) {
        analyticsMap.get(item._id)!.added = item.added;
      }
    }

    /**
     * Merge closed analytics
     */
    for (const item of closedAnalytics) {
      if (analyticsMap.has(item._id)) {
        analyticsMap.get(item._id)!.closed = item.closed;
      }
    }

    /**
     * Convert map to sorted array
     */
    const result = Array.from(analyticsMap.values()).sort((a, b) =>
      a.hour.localeCompare(b.hour),
    );

    return result;
  }

  async getQuestionStatusDistribution(
    startDate: string,
    // endDate: string,
    shift: 'morning' | 'evening' | 'all',
    source: 'annam' | 'whatsapp' | 'agri_expert',
    from: string,
    to:string,
    session?: ClientSession,
  ): Promise<
    {
      status: string;
      count: number;
    }[]
  > {
    await this.init();

    const start = new Date(`${startDate}T00:00:00+05:30`);

    const end = new Date(`${startDate}T23:59:59.999+05:30`);

    const sourceFilter =
      source === 'annam'
        ? 'AJRASAKHA'
        : source === 'whatsapp'
          ? 'WHATSAPP'
          : 'AGRI_EXPERT';

    const result = await this.QuestionCollection.aggregate(
      [
        /**
         * Match questions in date range
         */
        {
          $match: {
            createdAt: {
              $gte: start,
              $lte: end,
            },
             source: sourceFilter,
            ...getShiftFilter('createdAt', shift, from, to),
          },
        },

        /**
         * Group by status
         */
        {
          $group: {
            _id: '$status',
            count: {
              $sum: 1,
            },
          },
        },

        /**
         * Sort descending
         */
        {
          $sort: {
            count: -1,
          },
        },
      ],
      {session},
    ).toArray();

    return result.map(item => ({
      status: item._id || 'unknown',
      count: item.count,
    }));
  }

  async getQuestionLevelDistribution(
    startDate: string,
    // endDate: string,
    shift: 'morning' | 'evening' | 'all',
    source: 'annam' | 'whatsapp' | 'agri_expert',
    from: string,
    to:string,
    session?: ClientSession,
  ): Promise<
    {
      level: string;
      count: number;
    }[]
  > {
    await this.init();

    const start = new Date(`${startDate}T00:00:00+05:30`);

    const end = new Date(`${startDate}T23:59:59.999+05:30`);

    const sourceFilter =
      source === 'annam'
        ? 'AJRASAKHA'
        : source === 'whatsapp'
          ? 'WHATSAPP'
          : 'AGRI_EXPERT';

    const result = await this.QuestionSubmissionCollection.aggregate(
      [
        /**
         * Filter submissions
         */
        {
          $match: {
            createdAt: {
              $gte: start,
              $lte: end,
            },
            ...getShiftFilter('createdAt', shift, from, to),
          },
        },

        /**
         * Join question and filter by source
         */
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'question',
          },
        },

        {
          $unwind: '$question',
        },

        {
          $match: {
            'question.source': sourceFilter,
          },
        },

        /**
         * Compute lengths
         */
        {
          $addFields: {
            historyLength: {
              $size: '$history',
            },
            queueLength: {
              $size: '$queue',
            },
          },
        },

        /**
         * Remove unassigned
         */
        {
          $match: {
            $or: [
              {
                historyLength: {
                  $gt: 0,
                },
              },
              {
                queueLength: {
                  $gt: 0,
                },
              },
            ],
          },
        },

        /**
         * Compute level
         */
        {
          $addFields: {
            currentLevel: {
              $cond: [
                {
                  $eq: ['$historyLength', 0],
                },
                0,
                {
                  $subtract: ['$historyLength', 1],
                },
              ],
            },
          },
        },

        /**
         * Group by level
         */
        {
          $group: {
            _id: '$currentLevel',
            count: {
              $sum: 1,
            },
          },
        },

        /**
         * Sort ascending
         */
        {
          $sort: {
            _id: 1,
          },
        },
      ],
      {session},
    ).toArray();

    return result.map(item => ({
      level: `Level ${item._id}`,
      count: item.count,
    }));
  }

  async getShiftBasedTopExperts(
    startDate: string,
    // endDate: string,
    shift: 'morning' | 'evening' | 'all',
    source: 'annam' | 'whatsapp' | 'agri_expert',
    from: string,
    to:string,
    session?: ClientSession,
  ): Promise<
    {
      userId: string;
      name: string;
      reviewCount: number;
      reputation: number;
      incentive: number;
      penalty: number;
    }[]
  > {
    await this.init();

    const start = new Date(`${startDate}T00:00:00+05:30`);

    const end = new Date(`${startDate}T23:59:59.999+05:30`);

    const sourceFilter =
      source === 'annam'
        ? 'AJRASAKHA'
        : source === 'whatsapp'
          ? 'WHATSAPP'
          : 'AGRI_EXPERT';

    const result = await this.QuestionSubmissionCollection.aggregate<{
      userId: ObjectId;
      name: string;
      reviewCount: number;
      reputation: number;
      incentive: number;
      penalty: number;
    }>(
      [
        /**
        * Join question and filter by source
        */
        {
          $lookup: {
            from: 'questions', // replace if needed
            let: {
              questionId: '$questionId',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$_id', '$$questionId'],
                  },
                  source: sourceFilter,
                },
              },
            ],
            as: 'question',
          },
        },

        /**
        * Keep only matching questions
        */
        {
          $match: {
            question: {
              $ne: [],
            },
          },
        },
        /**
         * Expand history
         */
        {
          $unwind: '$history',
        },

        /**
         * Match reviewed entries
         */
        {
          $match: {
            'history.createdAt': {
              $gte: start,
              $lte: end,
            },
            ...getShiftFilter('history.createdAt', shift, from, to),
            /**
             * Either:
             * - answer exists
             * - reviewId exists
             */
            $or: [
              {
                'history.answer': {
                  $exists: true,
                },
              },
              {
                'history.reviewId': {
                  $exists: true,
                },
              },
            ],
          },
        },

        /**
         * Group by reviewer
         */
        {
          $group: {
            _id: '$history.updatedBy',
            reviewCount: {
              $sum: 1,
            },
          },
        },

        /**
         * Join users
         */
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },

        /**
         * Flatten user
         */
        {
          $unwind: '$user',
        },

        /**
         * Sort descending
         */
        {
          $sort: {
            reviewCount: -1,
          },
        },

        /**
         * Top 5 only
         */
        {
          $limit: 5,
        },

        /**
         * Final projection
         */
        {
          $project: {
            _id: 0,
            userId: '$user._id',
            name: {
              $concat: ['$user.firstName', ' ', '$user.lastName'],
            },
            reviewCount: 1,
            reputation: '$user.reputation_score',
            incentive: '$user.incentive',
            penalty: '$user.penalty',
          },
        },
      ],
      {session},
    ).toArray();

    return result.map(item => ({
      ...item,
      userId: item.userId.toString(),
    }));
  }

  async getShiftBasedTopApprovingExperts(
    startDate: string,
    // endDate: string,
    shift: 'morning' | 'evening' | 'all',
    source: 'annam' | 'whatsapp' | 'agri_expert',
    from: string,
    to:string,
    session?: ClientSession,
  ): Promise<
    {
      userId: string;
      name: string;
      approvedCount: number;
    }[]
  > {
    await this.init();

    const start = new Date(`${startDate}T00:00:00+05:30`);

    const end = new Date(`${startDate}T23:59:59.999+05:30`);

    const sourceFilter =
      source === 'annam'
        ? 'AJRASAKHA'
        : source === 'whatsapp'
          ? 'WHATSAPP'
          : 'AGRI_EXPERT';

    const result = await this.AnswersCollection.aggregate<{
      userId: ObjectId;
      name: string;
      approvedCount: number;
    }>(
      [
        {
          $match: {
            status: 'approved',
            updatedAt: {
              $gte: start,
              $lte: end,
            },
            ...getShiftFilter('updatedAt', shift, from, to),
          },
        },

        /**
         * Join question
         */
        {
          $lookup: {
            from: 'questions', // verify collection name
            let: {
              questionId: '$questionId',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$_id', '$$questionId'],
                  },
                  source: sourceFilter,
                },
              },
            ],
            as: 'question',
          },
        },

        /**
         * Keep only answers whose question matches source
         */
        {
          $match: {
            question: {
              $ne: [],
            },
          },
        },

        {
          $group: {
            _id: '$approvedBy',
            approvedCount: {
              $sum: 1,
            },
          },
        },

        /**
         * Join users
         */
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },

        /**
         * Flatten user
         */
        {
          $unwind: '$user',
        },

        /**
         * Highest approvals first
         */
        {
          $sort: {
            approvedCount: -1,
          },
        },

        /**
         * Top 5 only
         */
        {
          $limit: 5,
        },

        /**
         * Final projection
         */
        {
          $project: {
            _id: 0,
            userId: '$user._id',
            name: {
              $concat: ['$user.firstName', ' ', '$user.lastName'],
            },
            approvedCount: 1,
          },
        },
      ],
      {session},
    ).toArray();

    return result.map(item => ({
      ...item,
      userId: item.userId.toString(),
    }));
  }

  /** Returns in-review questions with no moderator assigned yet, ordered oldest first. */
  async findUnassignedInReviewQuestions(
    sources?: QuestionSource[],
  ): Promise<IQuestion[]> {
    await this.init();
    // Picks up in-review, duplicate and pae_submitted questions so the moderator-queue
    // cron assigns them all to STF moderators (PAE-submitted questions skip the peer
    // review cycle but still need a moderator to act on them).
    // Only questions with moderator auto-allocation explicitly ON are returned — a
    // missing field or false both exclude the question from the moderator queue.
    // New questions default the field to true on creation.
    // When `sources` is provided, restricts to that source group (time-bound / manual).
    const filter: Record<string, unknown> = {
      status: { $in: ['in-review', 'pae_submitted'] },
      autoAllocateModerator: true,
      $or: [{ moderatorId: { $exists: false } }, { moderatorId: null }],
    };
    if (sources && sources.length > 0) {
      filter.source = { $in: sources };
    }
    return this.QuestionCollection.find(filter)
      .sort({ createdAt: 1 })
      .toArray();
  }

  /** Questions currently assigned to a moderator (moderatorId set). Includes
   *  in-review, re-routed, duplicate and pae_submitted statuses — mirrors the
   *  moderator-assigned tab filter, so re-routed questions (which always carry a
   *  moderatorId) show up here too. Oldest first. */
  async findModeratorAssignedQuestions(
    sources?: QuestionSource[],
  ): Promise<IQuestion[]> {
    await this.init();
    const filter: Record<string, unknown> = {
      status: { $in: ['in-review', 're-routed', 'duplicate', 'pae_submitted'] },
      moderatorId: { $exists: true, $ne: null },
    };
    if (sources && sources.length > 0) {
      filter.source = { $in: sources };
    }
    return this.QuestionCollection.find(filter)
      .sort({ createdAt: 1 })
      .toArray();
  }

  /** Sets or clears moderatorId on a question document. Also stamps moderatorAssignedAt when assigning. */
  async updateModeratorId(questionId: string, moderatorId: string | null): Promise<void> {
    await this.init();
    const now = new Date();
    await this.QuestionCollection.updateOne(
      { _id: new ObjectId(questionId) },
      {
        $set: {
          moderatorId: moderatorId ? new ObjectId(moderatorId) : null,
          moderatorAssignedAt: moderatorId ? now : null,
          updatedAt: now,
        },
      },
    );
  }
  /** One page (skip/limit) + exact total for a Queue-Details question section.
   *  kind: 'received' | 'allocated' | 'autoOff'. Status scope: open/delayed/duplicate.
   *  Optional createdAt range (startTime/endTime) scopes every kind by date. */
  async getQueueQuestionSection(
    kind: 'received' | 'allocated' | 'autoOff',
    skip: number,
    limit: number,
    startTime?: Date,
    endTime?: Date,
  ): Promise<{count: number; items: RawQueueQuestionRow[]}> {
    await this.init();

    // Optional createdAt date-range filter applied to all kinds.
    const createdAtFilter: Record<string, unknown> = {};
    if (startTime) createdAtFilter.$gte = startTime;
    if (endTime) createdAtFilter.$lte = endTime;
    const dateScope = startTime || endTime ? {createdAt: createdAtFilter} : {};

    const receivedMatch = {
      source: {$in: ['AJRASAKHA', 'WHATSAPP']},
     // isAutoAllocate: true,
    //  status: {$in: ['open', 'delayed', 'duplicate']},
      ...dateScope,
    };
    const allocatedMatch = {
      source: {$in: ['AJRASAKHA', 'WHATSAPP']},
      isAutoAllocate: {$eq: true},
     // firstAllocationAt: {$exists: true, $ne: null},
      status: {$in: ['open', 'delayed']},
      // ...dateScope,
    };
    const autoOffMatch = {
      source: {$in: ['AJRASAKHA', 'WHATSAPP']},
      isAutoAllocate: {$eq: true},
      status: {$in: ['open', 'delayed']},
    //  ...dateScope,
    };

    const lookupStages = [
      {
        $lookup: {
          from: 'question_submissions',
          localField: '_id',
          foreignField: 'questionId',
          as: 'sub',
        },
      },
      {$addFields: {sub: {$arrayElemAt: ['$sub', 0]}}},
    ];
    const projectStage = {
      $project: {
        _id: 1,
        question: 1,
        status: 1,
        source: 1,
        priority: 1,
        createdAt: 1,
        firstAllocationAt: 1,
        state: '$details.state',
        district: '$details.district',
        crop: '$details.crop',
        queue: '$sub.queue',
        history: '$sub.history',
      },
    };

    if (kind === 'allocated') {
      // Allocated & pending: the question is open/delayed and assigned
      // (firstAllocationAt set), the submission has at least one history entry
      // (history.length >= 1 — excludes freshly-allocated "awaiting reviewer
      // assignment" docs with no entry yet), and the CURRENT expert hasn't acted yet —
      // i.e. the latest history entry carries none of answer / approvedAnswer /
      // modifiedAnswer / rejectedAnswer (typically a fresh 'in-review' entry). Earlier
      // entries from prior reviewers may well have answers; only the last entry checked.
      const base: any[] = [
        {$match: allocatedMatch},
        ...lookupStages,
        {$match: {'sub.queue.0': {$exists: true}}},
        {$addFields: {lastHistory: {$arrayElemAt: [{$ifNull: ['$sub.history', []]}, -1]}}},
        {
          $match: {
            'lastHistory.answer': {$in: [null]},
            'lastHistory.approvedAnswer': {$in: [null]},
            'lastHistory.modifiedAnswer': {$in: [null]},
            'lastHistory.rejectedAnswer': {$in: [null]},
          },
        },
      ];
      const [items, countRes] = await Promise.all([
        this.QuestionCollection.aggregate<RawQueueQuestionRow>([
          ...base,
          {$sort: {createdAt: -1}},
          {$skip: skip},
          {$limit: limit},
          projectStage,
        ]).toArray(),
        this.QuestionCollection.aggregate<{count: number}>([
          ...base,
          {$count: 'count'},
        ]).toArray(),
      ]);
      return {count: countRes[0]?.count ?? 0, items};
    }

    const match = kind === 'received' ? receivedMatch : autoOffMatch;
    const [count, items] = await Promise.all([
      this.QuestionCollection.countDocuments(match as any),
      this.QuestionCollection.aggregate<RawQueueQuestionRow>([
        {$match: match},
        {$sort: {createdAt: -1}},
        {$skip: skip},
        {$limit: limit},
        ...lookupStages,
        projectStage,
      ]).toArray(),
    ]);
   /* console.log(
      `[getQueueQuestionSection] kind=${kind} count=${count} ` +
      `startTime=${startTime?.toISOString() ?? 'none'} endTime=${endTime?.toISOString() ?? 'none'} ` +
      `match=${JSON.stringify(match)}`,
    );*/

    // Why the "Auto-Allocate ON" count differs from the never-allocated queue:
    // split the matched set by allocation state. Only (queueEmpty && !hasAllocatedAt)
    // questions actually qualify for the never-allocated queue; the rest are already
    // allocated/in-progress or stuck in limbo (allocatedAt set but queue cleared).
    if (kind === 'autoOff') {
      const breakdown = await this.QuestionCollection.aggregate([
        {$match: match},
        {
          $lookup: {
            from: 'question_submissions',
            localField: '_id',
            foreignField: 'questionId',
            as: 'sub',
          },
        },
        {$addFields: {sub: {$arrayElemAt: ['$sub', 0]}}},
        {
          $addFields: {
            queueEmpty: {$eq: [{$size: {$ifNull: ['$sub.queue', []]}}, 0]},
            hasAllocatedAt: {
              $cond: [{$ifNull: ['$sub.currentExpertAllocatedAt', false]}, true, false],
            },
          },
        },
        {
          $group: {
            _id: {queueEmpty: '$queueEmpty', hasAllocatedAt: '$hasAllocatedAt'},
            count: {$sum: 1},
          },
        },
      ]).toArray();
     /* console.log(
        '[getQueueQuestionSection][autoOff breakdown] (queueEmpty & !hasAllocatedAt = never-allocated queue):',
        JSON.stringify(breakdown),
      );*/
    }

    return {count, items};
  }
}
