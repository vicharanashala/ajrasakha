import { IQuestionSubmissionRepository } from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {
  IQuestionSubmission,
  ISubmissionHistory,
  IReviewerHeatmapRow,
  IReview,
  IAnswer,
  IQuestion,
  IReroute,
  IReviewerHeatmapResponse,
  LevelReportStat,
} from '#root/shared/interfaces/models.js';
import { ClientSession, Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '../MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject } from 'inversify';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from 'routing-controllers';
import { USER_VALIDATORS } from '#root/modules/user/validators/UserValidators.js';
import { GetHeatMapQuery } from '#root/modules/dashboard/validators/DashboardValidators.js';
import { getReviewerQueuePosition } from '#root/utils/getReviewerQueuePosition.js';
import { ExpertReviewLevelDto } from '#root/modules/user/validators/UserValidators.js';
import { IReviewWiseStats } from '#root/utils/getDailyStats.js';
import { HistoryItem } from '#root/modules/question/classes/validators/QuestionVaidators.js';

export class QuestionSubmissionRepository implements IQuestionSubmissionRepository {
  private QuestionSubmissionCollection: Collection<IQuestionSubmission>;
  private QuestionCollection: Collection<IQuestion>;
  private ReRouteCollection: Collection<IReroute>;
  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) { }

  private async init() {
    this.QuestionSubmissionCollection =
      await this.db.getCollection<IQuestionSubmission>('question_submissions');
    this.QuestionCollection =
      await this.db.getCollection<IQuestion>('questions');
    this.ReRouteCollection = await this.db.getCollection<IReroute>('reroutes');
  }

  async getByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null> {
    try {
      await this.init();
      return this.QuestionSubmissionCollection.findOne(
        {
          questionId: new ObjectId(questionId),
        },
        { session },
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to get submission by questionId: ${error}`,
      );
    }
  }

  async findByQueuedExpertId(
    expertId: string,
    session?: ClientSession,
  ): Promise<IQuestionSubmission[]> {
    try {
      await this.init();
      return this.QuestionSubmissionCollection.find(
        { queue: new ObjectId(expertId) },
        { session },
      ).toArray();
    } catch (error) {
      throw new InternalServerError(
        `Failed to get submissions by queued expert: ${error}`,
      );
    }
  }

  async addSubmission(
    submission: IQuestionSubmission,
    session?: ClientSession,
  ): Promise<IQuestionSubmission> {
    try {
      await this.init();

      const now = new Date();
      submission.createdAt = now;
      submission.updatedAt = now;

      const result = await this.QuestionSubmissionCollection.insertOne(
        submission,
        {
          session,
        },
      );
      return { ...submission, _id: result.insertedId };
    } catch (error) {
      throw new InternalServerError(`Failed to add submission: ${error}`);
    }
  }

  async allocateExperts(
    questionId: string,
    expertIds: ObjectId[],
    session?: ClientSession,
  ) {
    try {
      await this.init();

      return await this.QuestionSubmissionCollection.findOneAndUpdate(
        { questionId: new ObjectId(questionId) },
        { $push: { queue: { $each: expertIds } } },
        { session, returnDocument: 'after' },
      );
    } catch (error) {
      throw new InternalServerError(`Error while allocating experts: ${error}`);
    }
  }

  async removeExpertFromQueuebyIndex(
    questionId: string,
    index: number,
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null> {
    try {
      await this.init();
      const questionSubmission = await this.getByQuestionId(
        questionId,
        session,
      );

      if (!questionSubmission) {
        throw new InternalServerError(
          `No submission found for questionId: ${questionId}`,
        );
      }
      const expertId = questionSubmission.queue?.[index];

      if (!expertId) {
        throw new InternalServerError(
          `No expert found at index: ${index} for questionId: ${questionId}`,
        );
      }

      const currentHistory = questionSubmission?.history || [];

      const currentExpertHistory = currentHistory?.find(
        h => h.updatedBy?.toString() === expertId?.toString(),
      );

      const nextExpertId = questionSubmission?.queue?.[index + 1];

      const shouldCreateNextHistoryEntry =
        nextExpertId &&
        currentExpertHistory &&
        currentExpertHistory?.status === 'in-review' &&
        !currentExpertHistory?.answer;

      const result = await this.QuestionSubmissionCollection.updateOne(
        { questionId: new ObjectId(questionId) },
        {
          $pull: {
            queue: new ObjectId(expertId),
            history: { updatedBy: new ObjectId(expertId) },
          },
          // Reset all time-bound tracking tied to the removed expert so they're fully
          // freed from this question (clears the 45-min allocation/open clocks).
          $set: {
            reviewDelayNotificationSent: false,
            currentExpertAllocatedAt: null,
            currentExpertOpenedAt: null,
          },
        },
        { session },
      );
      if (result.matchedCount === 0) {
        throw new InternalServerError(
          `No submission found for questionId: ${questionId}`,
        );
      }

      // Removing the first expert changes the question's allocation state:
      const removedFirstExpert = index === 0;
      const queueBecameEmpty =
        removedFirstExpert && (questionSubmission.queue?.length ?? 0) === 1;
      if (queueBecameEmpty) {
        // No experts left — the question is no longer allocated to anyone. Clear
        // firstAllocationAt so it falls back into the never-allocated queue and can
        // be re-picked for allocation.
        await this.QuestionCollection.updateOne(
          { _id: new ObjectId(questionId) },
          { $unset: { firstAllocationAt: '' } },
          { session },
        );
      } else if (removedFirstExpert) {
        // Allocation shifts to the next expert (now the head of the queue). Ensure
        // firstAllocationAt is set if it was missing/null, so the now-allocated
        // question isn't treated as never-allocated. Only set when absent to
        // preserve the original first-allocation timestamp when it already exists.
        await this.QuestionCollection.updateOne(
          { _id: new ObjectId(questionId) },
          { $set: { firstAllocationAt: new Date() } },
          { session },
        );
      }

      if (shouldCreateNextHistoryEntry) {
        await this.QuestionSubmissionCollection.updateOne(
          { questionId: new ObjectId(questionId) },
          {
            $push: {
              history: {
                updatedBy: new ObjectId(nextExpertId),
                status: 'in-review',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            },
          },
          { session },
        );
      }

      return this.getByQuestionId(questionId, session);
    } catch (error) {
      throw new InternalServerError(
        `Failed to remove expert from queue: ${error}`,
      );
    }
  }
  async updateQueue(
    questionId: string,
    queue: ObjectId[],
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null> {
    try {
      await this.init();
      return await this.QuestionSubmissionCollection.findOneAndUpdate(
        { questionId: new ObjectId(questionId) },
        { $set: { queue } },
        { session, returnDocument: 'after' },
      );
    } catch (error) {
      throw new InternalServerError(`Error while updating queue: ${error}`);
    }
  }

  async update(
    questionId: string,
    userSubmissionData: ISubmissionHistory,
    session?: ClientSession,
    reviewDelayNotificationSent?: boolean
  ): Promise<void> {
    try {
      await this.init();

      const updateDoc: any = {
        $set: {
          updatedAt: new Date(),
        },
        $push: {
          history: userSubmissionData,
        },
      };

      if (
        userSubmissionData.answer &&
        userSubmissionData.answer.toString().trim() !== ''
      ) {
        updateDoc.$set.lastRespondedBy = userSubmissionData.updatedBy;
      }

      if (
        reviewDelayNotificationSent !== undefined
      ) {
        updateDoc.$set.reviewDelayNotificationSent =
          reviewDelayNotificationSent;
      }

      const result = await this.QuestionSubmissionCollection.updateOne(
        { questionId: new ObjectId(questionId) },
        updateDoc,
        { session },
      );
      if (result.matchedCount === 0) {
        throw new InternalServerError(
          `No submission found for questionId: ${questionId}`,
        );
      }
    } catch (error) {
      throw new InternalServerError(`Failed to update submission: ${error}`);
    }
  }

  async updateHistoryByUserId(
    questionId: string,
    userId: string,
    updatedDoc: Partial<ISubmissionHistory>,
    session?: ClientSession,
  ): Promise<void> {
    try {
      await this.init();

      const setFields: Record<string, any> = { 'history.$[entry].updatedAt': new Date() };
      for (const [key, value] of Object.entries(updatedDoc)) {
        setFields[`history.$[entry].${key}`] = value;
      }

      const result = await this.QuestionSubmissionCollection.updateOne(
        { questionId: new ObjectId(questionId) },
        { $set: setFields },
        {
          session,
          arrayFilters: [{ 'entry.updatedBy': new ObjectId(userId) }],
        },
      );

      if (result.matchedCount === 0) {
        throw new NotFoundError(`Failed to find submission for questionId: ${questionId}`);
      }

      if (result.modifiedCount === 0) {
        throw new BadRequestError(`No matching history entry found for userId: ${userId}`);
      }
    } catch (error) {
      throw new InternalServerError(
        `Failed to update history / More: ${error}`,
      );
    }
  }

  async getDetailedSubmissionHistory(
    questionId: string,
    session?: ClientSession,
  ): Promise<HistoryItem[]> {
    try {
      await this.init();

      // To get reviewer position
      const submission = await this.QuestionSubmissionCollection.findOne({
        questionId: new ObjectId(questionId),
      });
      if (!submission)
        throw new NotFoundError(
          `Failed to get submission for questionId: ${questionId}`,
        );
      const queue = submission.queue || [];

      const historyData = await this.QuestionSubmissionCollection.aggregate(
        [
          { $match: { questionId: new ObjectId(questionId) } },
          { $unwind: '$history' },
          { $sort: { 'history.createdAt': -1 } },
          {
            $lookup: {
              from: 'users',
              localField: 'history.updatedBy',
              foreignField: '_id',
              as: 'updatedByUser',
            },
          },
          {
            $lookup: {
              from: 'users',
              localField: 'history.lastModifiedBy',
              foreignField: '_id',
              as: 'lastModifiedByUser',
            },
          },
          {
            $lookup: {
              from: 'answers',
              localField: 'history.answer',
              foreignField: '_id',
              as: 'answerData',
            },
          },
          {
            $lookup: {
              from: 'reviews',
              localField: 'history.reviewId',
              foreignField: '_id',
              as: 'reviewData',
              pipeline: [
                // Add this nested pipeline to populate review's answer
                {
                  $lookup: {
                    from: 'answers',
                    localField: 'answerId',
                    foreignField: '_id',
                    as: 'reviewAnswerData',
                  },
                },
                {
                  $addFields: {
                    reviewAnswer: { $arrayElemAt: ['$reviewAnswerData', 0] },
                  },
                },
              ],
            },
          },
          {
            $project: {
              _id: 0,
              updatedBy: { $arrayElemAt: ['$updatedByUser', 0] },
              answer: { $arrayElemAt: ['$answerData', 0] },
              review: { $arrayElemAt: ['$reviewData', 0] },
              lastModifiedBy: { $arrayElemAt: ['$lastModifiedByUser', 0] },
              'history.status': 1,
              'history.reasonForRejection': 1,
              'history.approvedAnswer': 1,
              'history.modifiedAnswer': 1,
              'history.reasonForLastModification': 1,
              'history.createdAt': 1,
              'history.updatedAt': 1,
              'history.previousAllocations': 1,
            },
          },
        ],
        { session },
      ).toArray();

      type ReviewWithAnswer = IReview & {
        reviewAnswer?: IAnswer;
      };

      const transformAnswer = (
        answerDoc: any,
      ): Partial<IAnswer> | undefined => {
        if (!answerDoc) return undefined;

        return {
          modifications:
            answerDoc.modifications?.map((mod: any) => ({
              modifiedBy: mod.modifiedBy?.toString() || mod.modifiedBy,
              oldAnswer: mod.oldAnswer,
              newAnswer: mod.newAnswer,
              modifiedAt: mod.modifiedAt,
            })) || [],
          createdAt: answerDoc.createdAt,
          updatedAt: answerDoc.updatedAt,
        };
      };

      const populatedHistory: HistoryItem[] = historyData.map((item, index) => {
        const h = item.history;
        const updatedBy = item.updatedBy;
        const answer = item.answer;
        const review = item.review as ReviewWithAnswer;
        const lastModifiedBy = item.lastModifiedBy;
        const reviewAnswer = review?.reviewAnswer;

        const reviewerPosition = getReviewerQueuePosition(
          queue,
          updatedBy?._id.toString(),
        );
        return {
          updatedBy: updatedBy
            ? {
              _id: updatedBy?._id.toString(),
              userName:
                reviewerPosition == 0
                  ? 'Author'
                  : `Reviewer ${reviewerPosition}`,
              // userName: `${updatedBy.firstName} ${updatedBy.lastName}`,
              // email: updatedBy.email,
            }
            : { _id: '', userName: '', email: '' },

          lastModifiedBy: lastModifiedBy
            ? {
              _id: lastModifiedBy._id.toString(),
              // userName: `${lastModifiedBy.firstName} ${lastModifiedBy.lastName}`,
              userName: `Reviewer ${getReviewerQueuePosition(
                queue,
                lastModifiedBy._id.toString(),
              )}`,
              // email: lastModifiedBy.email,
            }
            : { _id: '', userName: '', email: '' },

          answer: answer
            ? {
              _id: answer._id.toString(),
              answer: answer.answer,
              approvalCount: answer.approvalCount?.toString() ?? '0',
              sources: answer.sources ?? [],
              remarks: answer.remarks ?? '',
            }
            : undefined,

          review: review
            ? {
              _id: review._id.toString(),
              reviewType: review.reviewType,
              action: review.action,
              reason: review.reason,
              answer: transformAnswer(reviewAnswer),
              parameters: review.parameters,
              createdAt: review.createdAt,
              updatedAt: review.updatedAt,
            }
            : undefined,

          status: h.status,
          reasonForRejection: h.reasonForRejection,
          approvedAnswer: h.approvedAnswer
            ? h.approvedAnswer.toString()
            : undefined,
          modifiedAnswer: h.modifiedAnswer
            ? h.modifiedAnswer.toString()
            : undefined,
          reasonForLastModification: h.reasonForLastModification,
          createdAt: h.createdAt,
          updatedAt: h.updatedAt,
        };
      });
      return populatedHistory;
    } catch (error) {
      throw new InternalServerError(
        `Failed to get detailed submission history /More: ${error}`,
      );
    }
  }

  async deleteByQuestionId(
    questionId: string,
    session?: ClientSession,
  ): Promise<void> {
    try {
      await this.init();
      await this.QuestionSubmissionCollection.findOneAndDelete(
        { questionId: new ObjectId(questionId) },
        { session },
      );
    } catch (error) {
      throw new InternalServerError(`Failed to update submission: ${error}`);
    }
  }

  async heatMapResultsForReviewer(
    query: GetHeatMapQuery,
  ): Promise<IReviewerHeatmapResponse | null> {
    try {
      await this.init();

      let { startTime, endTime, page = 1, limit = 10 } = query;

      page = Number(page) || 1;
      limit = Number(limit) || 10;

      const skip = (page - 1) * limit;

      /* const matchConditions: any = {
        'history.status': {$in: ['reviewed', 'rejected']},
      };

      if (startTime) {
        const start = new Date(`${startTime}T00:00:00.000Z`);
        matchConditions['history.createdAt'] = {$gte: start};
      }

      if (endTime) {
        const end = new Date(`${endTime}T23:59:59.999Z`);
        matchConditions['history.createdAt'] = {
          ...(matchConditions['history.createdAt'] || {}),
          $lte: end,
        };
      }*/
      const pipeline = [
        {
          $unwind: {
            path: '$history',
            includeArrayIndex: 'historyIndex',
          },
        },

        // ✅ Step 2: Filter based on index and status
        {
          $match: {
            $expr: {
              $or: [
                // Index 0: any status is allowed
                { $eq: ['$historyIndex', 0] },
                // Index >= 1: must have specific status
                {
                  $and: [
                    { $gte: ['$historyIndex', 1] },
                    {
                      $in: [
                        '$history.status',
                        ['reviewed', 'rejected', 'approved', 'modified'],
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        // ✅ Step 3: Apply date range filtering
        ...(startTime || endTime
          ? [
            {
              $match: {
                ...(startTime && {
                  'history.createdAt': {
                    $gte: new Date(`${startTime}T00:00:00.000+05:30`),
                  },
                }),
                ...(endTime && {
                  'history.updatedAt': {
                    $lte: new Date(`${endTime}T23:59:59.999+05:30`),
                  },
                }),
              },
            },
          ]
          : []),
        // ✅ Step 4: Ensure updatedBy exists
        {
          $match: {
            'history.updatedBy': { $exists: true, $ne: null },
          },
        },
        {
          $addFields: {
            turnaroundHours: {
              $cond: {
                if: { $eq: ['$historyIndex', 0] },
                // ✅ Index 0: from ROOT createdAt to history.updatedAt
                then: {
                  $divide: [
                    {
                      $subtract: [
                        { $toDate: '$history.updatedAt' },
                        { $toDate: '$createdAt' },
                      ],
                    },
                    1000 * 60 * 60,
                  ],
                },
                // ✅ Index >= 1: from history.createdAt to history.updatedAt
                else: {
                  $divide: [
                    {
                      $subtract: [
                        { $toDate: '$history.updatedAt' },
                        { $toDate: '$createdAt' },
                      ],
                    },
                    1000 * 60 * 60,
                  ],
                },
              },
            },
          },
        },

        // ✅ ONE-HOUR BUCKET INTERVALS
        {
          $addFields: {
            timeRange: {
              $switch: {
                branches: [
                  { case: { $lt: ['$turnaroundHours', 1] }, then: '0_1' },
                  { case: { $lt: ['$turnaroundHours', 2] }, then: '1_2' },
                  { case: { $lt: ['$turnaroundHours', 3] }, then: '2_3' },
                  { case: { $lt: ['$turnaroundHours', 4] }, then: '3_4' },
                  { case: { $lt: ['$turnaroundHours', 5] }, then: '4_5' },
                  { case: { $lt: ['$turnaroundHours', 6] }, then: '5_6' },
                  { case: { $lt: ['$turnaroundHours', 7] }, then: '6_7' },
                  { case: { $lt: ['$turnaroundHours', 8] }, then: '7_8' },
                  { case: { $lt: ['$turnaroundHours', 9] }, then: '8_9' },
                  { case: { $lt: ['$turnaroundHours', 10] }, then: '9_10' },
                  { case: { $lt: ['$turnaroundHours', 11] }, then: '10_11' },
                  { case: { $lt: ['$turnaroundHours', 12] }, then: '11_12' },
                ],
                default: '12_plus',
              },
            },
          },
        },

        {
          $group: {
            _id: { reviewerId: '$history.updatedBy', timeRange: '$timeRange' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.reviewerId',
            counts: { $push: { k: '$_id.timeRange', v: '$count' } },
          },
        },
        {
          $project: {
            reviewerId: '$_id',
            counts: { $arrayToObject: '$counts' },
          },
        },
        /*{
          $lookup: {
            from: 'users',
            localField: 'reviewerId',
            foreignField: '_id',
            as: 'reviewer',
          },
        },*/
        {
          $lookup: {
            from: 'users',
            let: { reviewerId: '$reviewerId' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$_id', '$$reviewerId'] },
                },
              },
              {
                $match: { status: { $ne: 'in-active' } },
              },
            ],
            as: 'reviewer',
          },
        },

        { $unwind: '$reviewer' },
        {
          $project: {
            _id: 0,
            reviewerId: { $toString: '$reviewerId' },
            reviewerName: {
              $trim: {
                input: {
                  $concat: [
                    { $ifNull: ['$reviewer.firstName', ''] },
                    {
                      $cond: [
                        { $ifNull: ['$reviewer.lastName', false] },
                        { $concat: [' ', '$reviewer.lastName'] },
                        '',
                      ],
                    },
                  ],
                },
              },
            },
            counts: 1,
          },
        },
        {
          $sort: {
            reviewerName: 1,
          },
        },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            totalCount: [{ $count: 'count' }],
          },
        },
      ];

      const result =
        await this.QuestionSubmissionCollection.aggregate(pipeline).toArray();

      if (!result.length) return null;

      return {
        data: result[0].data as IReviewerHeatmapRow[],
        total: result[0].totalCount[0]?.count || 0,
      };
    } catch (err) {
      console.error('Error generating reviewer heatmap:', err);
      return null;
    }
  }

  /*async getUserActivityHistory(
    userId: string,
    page = 1,
    limit = 20,
    dateRange?: {from?: string; to?: string},
    session?: ClientSession,
    selectedHistoryId?: string,
  ): Promise<any> {
    await this.init();

    const userObjId = new ObjectId(userId);
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.max(1, Math.floor(limit));
    const skip = (safePage - 1) * safeLimit;

    // Parse date range
    const fromDate = dateRange?.from ? new Date(dateRange.from) : null;
    const toDate = dateRange?.to ? new Date(dateRange.to) : null;

    const dateFilter: any = {};
    if (fromDate) dateFilter.$gte = fromDate;
    if (toDate) dateFilter.$lte = toDate;


    const matchStage = selectedHistoryId
      ? {
          $match: {
            questionId: new ObjectId(selectedHistoryId),
          },
        }
      : {
          $match: {
            'history.updatedBy': userObjId,
          },
        };
    const pipeline: any[] = [
      // Match only user activities
      // {$match: {'history.updatedBy': userObjId}},
      matchStage,

      // Explode history entries
      {
        $unwind: {
          path: '$history',
          includeArrayIndex: 'historyIndex',
        },
      },

      // Match again after unwind
      {$match: {'history.updatedBy': userObjId}},

      // ---- LOOKUPS ----
      {
        $lookup: {
          from: 'reviews',
          localField: 'history.reviewId',
          foreignField: '_id',
          as: 'reviewDoc',
        },
      },
      {$unwind: {path: '$reviewDoc', preserveNullAndEmptyArrays: true}},

      {
        $lookup: {
          from: 'answers',
          localField: 'history.answer',
          foreignField: '_id',
          as: 'answerDoc',
        },
      },
      {$unwind: {path: '$answerDoc', preserveNullAndEmptyArrays: true}},

      {
        $lookup: {
          from: 'answers',
          localField: 'history.rejectedAnswer',
          foreignField: '_id',
          as: 'rejectedAnswerDoc',
        },
      },
      {$unwind: {path: '$rejectedAnswerDoc', preserveNullAndEmptyArrays: true}},

      {
        $lookup: {
          from: 'answers',
          localField: 'history.modifiedAnswer',
          foreignField: '_id',
          as: 'modifiedAnswerDoc',
        },
      },
      {$unwind: {path: '$modifiedAnswerDoc', preserveNullAndEmptyArrays: true}},

      {
        $lookup: {
          from: 'answers',
          localField: 'history.approvedAnswer',
          foreignField: '_id',
          as: 'approvedAnswerDoc',
        },
      },
      {$unwind: {path: '$approvedAnswerDoc', preserveNullAndEmptyArrays: true}},

      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'questionDoc',
        },
      },
      {$unwind: {path: '$questionDoc', preserveNullAndEmptyArrays: true}},

      // Determine author vs review actions
      {
        $addFields: {
          isAuthor: {
            $and: [
              {$eq: ['$historyIndex', 0]},
              {$eq: ['$answerDoc.authorId', userObjId]},
            ],
          },
        },
      },

      {
        $addFields: {
          action: {
            $switch: {
              branches: [
                {case: {$eq: ['$isAuthor', true]}, then: 'author'},
                {
                  case: {$eq: ['$reviewDoc.action', 'accepted']},
                  then: 'approved',
                },
                {
                  case: {$eq: ['$reviewDoc.action', 'rejected']},
                  then: 'rejected',
                },
                {
                  case: {$eq: ['$reviewDoc.action', 'modified']},
                  then: 'modified',
                },
              ],
              default: null,
            },
          },
        },
      },

      // Only count valid actions
      {$match: {action: {$in: ['author', 'approved', 'rejected', 'modified']}}},

      // ---- FACET ----
      {
        $facet: {
          filtered: [
            {
              $addFields: {
                mainDate: {
                  $ifNull: ['$reviewDoc.createdAt', '$history.createdAt'],
                },
              },
            },
            ...(Object.keys(dateFilter).length > 0
              ? [
                  {
                    $match: {
                      mainDate: dateFilter,
                    },
                  },
                ]
              : []),
            {$sort: {mainDate: -1}},
            {$skip: skip},
            {$limit: safeLimit},

            {
              $project: {
                _id: {
                  $concat: [
                    {$toString: '$_id'},
                    '_',
                    {$toString: '$historyIndex'},
                  ],
                },
                action: 1,
                createdAt: '$mainDate',
                updatedAt: '$history.updatedAt',
                reviewType: '$reviewDoc.reviewType',
                reason: {
                  $ifNull: ['$reviewDoc.reason', '$history.reasonForRejection'],
                },
                remarks: '$answerDoc.remarks',

                review: {
                  parameters: '$reviewDoc.parameters',
                  action: '$reviewDoc.action',
                  reason: '$reviewDoc.reason',
                  reviewerId: '$reviewDoc.reviewerId',
                  createdAt: '$reviewDoc.createdAt',
                },

                question: {
                  _id: {$toString: '$questionDoc._id'},
                  question: '$questionDoc.question',
                },

                answer: {
                  _id: {$toString: '$answerDoc._id'},
                  answer: '$answerDoc.answer',
                },

                rejectedAnswer: {
                  _id: {$toString: '$rejectedAnswerDoc._id'},
                  answer: '$rejectedAnswerDoc.answer',
                },

                modifiedAnswer: {
                  _id: {$toString: '$modifiedAnswerDoc._id'},
                  answer: '$modifiedAnswerDoc.answer',
                },

                approvedAnswer: {
                  _id: {$toString: '$approvedAnswerDoc._id'},
                  answer: '$approvedAnswerDoc.answer',
                },
              },
            },
          ],

          totalCount: [
            {
              $addFields: {
                mainDate: {
                  $ifNull: ['$reviewDoc.createdAt', '$history.createdAt'],
                },
              },
            },

            ...(Object.keys(dateFilter).length > 0
              ? [
                  {
                    $match: {
                      mainDate: dateFilter,
                    },
                  },
                ]
              : []),
            {$count: 'count'},
          ],
        },
      },

      {
        $project: {
          data: '$filtered',
          totalCount: {
            $ifNull: [{$arrayElemAt: ['$totalCount.count', 0]}, 0],
          },
        },
      },
    ];

    const [aggResult] = await this.QuestionSubmissionCollection.aggregate(
      pipeline,
      {session},
    ).toArray();

    return {
      totalCount: aggResult?.totalCount ?? 0,
      page: safePage,
      totalPages: Math.ceil((aggResult?.totalCount ?? 0) / safeLimit),
      limit: safeLimit,
      data: aggResult?.data ?? [],
    };
  }*/
  async getUserActivityHistory(
    userId: string,
    page = 1,
    limit = 20,
    dateRange?: { from?: string; to?: string },
    session?: ClientSession,
    selectedHistoryId?: string,
  ): Promise<any> {
    await this.init();

    const userObjId = new ObjectId(userId);
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.max(1, Math.floor(limit));
    const skip = (safePage - 1) * safeLimit;

    // Parse date range
    const fromDate = dateRange?.from ? new Date(dateRange.from) : null;
    const toDate = dateRange?.to ? new Date(dateRange.to) : null;

    const dateFilter: any = {};
    if (fromDate) dateFilter.$gte = fromDate;
    if (toDate) dateFilter.$lte = toDate;

    const matchStage = selectedHistoryId
      ? {
        $match: {
          questionId: new ObjectId(selectedHistoryId),
        },
      }
      : {
        $match: {
          'history.updatedBy': userObjId,
        },
      };

    const pipeline: any[] = [
      matchStage,

      // Explode history entries
      {
        $unwind: {
          path: '$history',
          includeArrayIndex: 'historyIndex',
        },
      },

      // Match again after unwind
      { $match: { 'history.updatedBy': userObjId } },

      // ---- LOOKUPS ----
      {
        $lookup: {
          from: 'reviews',
          localField: 'history.reviewId',
          foreignField: '_id',
          as: 'reviewDoc',
        },
      },
      { $unwind: { path: '$reviewDoc', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: 'answers',
          localField: 'history.answer',
          foreignField: '_id',
          as: 'answerDoc',
        },
      },
      { $unwind: { path: '$answerDoc', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: 'answers',
          localField: 'history.rejectedAnswer',
          foreignField: '_id',
          as: 'rejectedAnswerDoc',
        },
      },
      { $unwind: { path: '$rejectedAnswerDoc', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: 'answers',
          localField: 'history.modifiedAnswer',
          foreignField: '_id',
          as: 'modifiedAnswerDoc',
        },
      },
      { $unwind: { path: '$modifiedAnswerDoc', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: 'answers',
          localField: 'history.approvedAnswer',
          foreignField: '_id',
          as: 'approvedAnswerDoc',
        },
      },
      { $unwind: { path: '$approvedAnswerDoc', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'questionDoc',
        },
      },
      { $unwind: { path: '$questionDoc', preserveNullAndEmptyArrays: true } },

      // Determine author vs review actions
      {
        $addFields: {
          isAuthor: {
            $and: [
              { $eq: ['$historyIndex', 0] },
              { $eq: ['$answerDoc.authorId', userObjId] },
            ],
          },
        },
      },

      {
        $addFields: {
          action: {
            $switch: {
              branches: [
                { case: { $eq: ['$isAuthor', true] }, then: 'author' },
                {
                  case: { $eq: ['$reviewDoc.action', 'accepted'] },
                  then: 'approved',
                },
                {
                  case: { $eq: ['$reviewDoc.action', 'rejected'] },
                  then: 'rejected',
                },
                {
                  case: { $eq: ['$reviewDoc.action', 'modified'] },
                  then: 'modified',
                },
              ],
              default: null,
            },
          },
          activityType: { $literal: 'history' },
        },
      },

      // Only count valid actions
      { $match: { action: { $in: ['author', 'approved', 'rejected', 'modified'] } } },

      {
        $addFields: {
          mainDate: {
            $ifNull: ['$reviewDoc.createdAt', '$history.createdAt'],
          },
        },
      },

      {
        $project: {
          _id: {
            $concat: [
              { $toString: '$_id' },
              '_history_',
              { $toString: '$historyIndex' },
            ],
          },
          activityType: 1,
          action: 1,
          mainDate: 1,
          createdAt: '$mainDate',
          // Reviewer's position in the queue: 0 = Author, N = Level N.
          level: { $indexOfArray: ['$queue', userObjId] },
          // Time the question/review was assigned to this user. Mirrors
          // buildReviewTat: the author (index 0) is assigned at first allocation
          // (falling back to question creation), reviewers at their own entry's
          // createdAt. `completedAt` is the submission/review time (mainDate).
          assignedAt: {
            $cond: [
              { $eq: ['$historyIndex', 0] },
              {
                $ifNull: [
                  '$questionDoc.firstAllocationAt',
                  '$questionDoc.createdAt',
                ],
              },
              '$history.createdAt',
            ],
          },
          completedAt: '$mainDate',
          updatedAt: '$history.updatedAt',
          reviewType: '$reviewDoc.reviewType',
          reason: {
            $ifNull: ['$reviewDoc.reason', '$history.reasonForRejection'],
          },
          remarks: '$answerDoc.remarks',
          review: {
            parameters: '$reviewDoc.parameters',
            action: '$reviewDoc.action',
            reason: '$reviewDoc.reason',
            reviewerId: '$reviewDoc.reviewerId',
            createdAt: '$reviewDoc.createdAt',
          },
          question: {
            _id: { $toString: '$questionDoc._id' },
            question: '$questionDoc.question',
          },
          answer: {
            _id: { $toString: '$answerDoc._id' },
            answer: '$answerDoc.answer',
          },
          rejectedAnswer: {
            _id: { $toString: '$rejectedAnswerDoc._id' },
            answer: '$rejectedAnswerDoc.answer',
          },
          modifiedAnswer: {
            _id: { $toString: '$modifiedAnswerDoc._id' },
            answer: '$modifiedAnswerDoc.answer',
          },
          approvedAnswer: {
            _id: { $toString: '$approvedAnswerDoc._id' },
            answer: '$approvedAnswerDoc.answer',
          },
        },
      },
    ];

    // Get history activities
    const historyActivities = await this.QuestionSubmissionCollection.aggregate(
      pipeline,
      { session },
    ).toArray();

    // Get reroute activities from separate collection
    // Get reroute activities from separate collection
    const reroutePipeline: any[] = [
      {
        $match: selectedHistoryId
          ? { questionId: new ObjectId(selectedHistoryId) }
          : {},
      },

      // Unwind reroutes array
      {
        $unwind: {
          path: '$reroutes',
          includeArrayIndex: 'rerouteIndex',
        },
      },

      // Match user as reroutedTo (exclude pending reroutes)
      {
        $match: {
          'reroutes.reroutedTo': userObjId,
          'reroutes.status': { $ne: 'pending' },
        },
      },

      // Lookup the main answer (answerId in reroute)
      {
        $lookup: {
          from: 'answers',
          localField: 'reroutes.answerId',
          foreignField: '_id',
          as: 'rerouteAnswerDoc',
        },
      },
      { $unwind: { path: '$rerouteAnswerDoc', preserveNullAndEmptyArrays: true } },

      // Lookup question
      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'questionDoc',
        },
      },
      { $unwind: { path: '$questionDoc', preserveNullAndEmptyArrays: true } },

      // Lookup all answer details from answers collection
      {
        $lookup: {
          from: 'answers',
          let: { aId: '$reroutes.answerId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$aId'] },
              },
            },
            {
              $project: {
                _id: 1,
                answer: 1,
                rejectedAnswer: 1,
                modifiedAnswer: 1,
                approvedAnswer: 1,
              },
            },
          ],
          as: 'answerDetails',
        },
      },
      { $unwind: { path: '$answerDetails', preserveNullAndEmptyArrays: true } },

      // Lookup rejected answer details if exists
      {
        $lookup: {
          from: 'answers',
          localField: 'reroutes.answerId',
          foreignField: '_id',
          as: 'rejectedAnswerDoc',
        },
      },
      { $unwind: { path: '$rejectedAnswerDoc', preserveNullAndEmptyArrays: true } },

      // Lookup modified answer details if exists
      {
        $lookup: {
          from: 'answers',
          localField: 'reroutes.answerId',
          foreignField: '_id',
          as: 'modifiedAnswerDoc',
        },
      },
      { $unwind: { path: '$modifiedAnswerDoc', preserveNullAndEmptyArrays: true } },

      // Lookup approved answer details if exists
      {
        $lookup: {
          from: 'answers',
          localField: 'reroutes.answerId',
          foreignField: '_id',
          as: 'approvedAnswerDoc',
        },
      },
      { $unwind: { path: '$approvedAnswerDoc', preserveNullAndEmptyArrays: true } },

      // Map reroute status to action
      {
        $addFields: {
          action: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$reroutes.status', 'expert_completed'] },
                  then: 'reroute_completed',
                },
                // {case: {$eq: ['$reroutes.status', 'rejected']}, then: 'reroute_rejected'},
                {
                  case: { $eq: ['$reroutes.status', 'modified'] },
                  then: 'reroute_modified',
                },
                {
                  case: { $eq: ['$reroutes.status', 'expert_rejected'] },
                  then: 'expert_rejected',
                },
                {
                  case: { $eq: ['$reroutes.status', 'pending'] },
                  then: 'reroute_pending',
                },
                {
                  case: { $eq: ['$reroutes.status', 'approved'] },
                  then: 'reroute_approved',
                },
                {
                  case: { $eq: ['$reroutes.status', 'moderator_rejected'] },
                  then: 'moderator_rejected',
                },
                {
                  case: { $eq: ['$reroutes.status', 'rejected'] },
                  then: 'reroute_created_answer',
                },
              ],
              default: 'reroute_assigned',
            },
          },
          activityType: { $literal: 'reroute' },
          mainDate: { $ifNull: ['$reroutes.updatedAt', '$reroutes.reroutedAt'] },
        },
      },

      {
        $project: {
          _id: {
            $concat: [
              { $toString: '$_id' },
              '_reroute_',
              { $toString: '$rerouteIndex' },
            ],
          },
          activityType: 1,
          action: 1,
          mainDate: 1,
          createdAt: '$reroutes.reroutedAt',
          // Reroute is "assigned" when it was rerouted to the user, and
          // "completed" at its last update (mainDate).
          assignedAt: '$reroutes.reroutedAt',
          completedAt: '$mainDate',
          updatedAt: '$reroutes.updatedAt',
          rerouteStatus: '$reroutes.status',
          comment: '$reroutes.comment',
          rejectionReason: '$reroutes.rejectionReason',
          reroutedBy: '$reroutes.reroutedBy',
          question: {
            _id: { $toString: '$questionDoc._id' },
            question: '$questionDoc.question',
          },
          // For expert_rejected status, only send the main answer
          answer: {
            $cond: {
              if: { $eq: ['$reroutes.status', 'expert_rejected'] },
              then: {
                _id: { $toString: '$rerouteAnswerDoc._id' },
                answer: '$rerouteAnswerDoc.answer',
              },
              else: {
                _id: { $toString: '$rerouteAnswerDoc._id' },
                answer: '$rerouteAnswerDoc.answer',
              },
            },
          },
          // Include rejected answer details for rejected status
          rejectedAnswer: {
            $cond: {
              if: {
                $and: [
                  { $eq: ['$reroutes.status', 'rejected'] },
                  { $ne: ['$rejectedAnswerDoc', null] },
                ],
              },
              then: {
                _id: { $toString: '$rejectedAnswerDoc._id' },
                answer: '$rejectedAnswerDoc.answer',
              },
              else: '$REMOVE',
            },
          },
          // Include modified answer details for modified status
          modifiedAnswer: {
            $cond: {
              if: {
                $and: [
                  { $eq: ['$reroutes.status', 'modified'] },
                  { $ne: ['$modifiedAnswerDoc', null] },
                ],
              },
              then: {
                _id: { $toString: '$modifiedAnswerDoc._id' },
                answer: '$modifiedAnswerDoc.answer',
              },
              else: '$REMOVE',
            },
          },
          // Include approved answer details for expert_completed or approved status
          approvedAnswer: {
            $cond: {
              if: {
                $and: [
                  {
                    $or: [
                      { $eq: ['$reroutes.status', 'expert_completed'] },
                      { $eq: ['$reroutes.status', 'approved'] },
                    ],
                  },
                  { $ne: ['$approvedAnswerDoc', null] },
                ],
              },
              then: {
                _id: { $toString: '$approvedAnswerDoc._id' },
                answer: '$approvedAnswerDoc.answer',
              },
              else: '$REMOVE',
            },
          },
        },
      },
    ];

    const rerouteActivities = await this.ReRouteCollection.aggregate(
      reroutePipeline,
      { session },
    ).toArray();

    // Combine both arrays
    const combinedActivities = [...historyActivities, ...rerouteActivities];

    // Apply date filter
    const filteredActivities =
      dateFilter && Object.keys(dateFilter).length > 0
        ? combinedActivities.filter(activity => {
          const activityDate = new Date(activity.mainDate);
          if (dateFilter.$gte && activityDate < dateFilter.$gte) return false;
          if (dateFilter.$lte && activityDate > dateFilter.$lte) return false;
          return true;
        })
        : combinedActivities;

    // Sort by date (descending)
    filteredActivities.sort((a, b) => {
      return new Date(b.mainDate).getTime() - new Date(a.mainDate).getTime();
    });

    // Apply pagination
    let totalCount = filteredActivities.length;
    let paginatedData = filteredActivities.slice(skip, skip + safeLimit);
    if (selectedHistoryId) {
      paginatedData = filteredActivities
        .filter(ele => ele.rerouteStatus === 'moderator_rejected')
        .slice(0, 1);
      totalCount = 1;
    }

    return {
      totalCount,
      page: safePage,
      totalPages: Math.ceil(totalCount / safeLimit),
      limit: safeLimit,
      data: paginatedData,
    };
  }
  //690f05447360add0cf5aa0f8
  async getUserReviewLevel(query: ExpertReviewLevelDto): Promise<any> {
    await this.init();
    let { userId, startTime, endTime } = query;
    const reviewerId = new ObjectId(userId);
    const pipeline = [
      // 1) Safe fields
      {
        $addFields: {
          queueIndex: { $indexOfArray: ['$queue', reviewerId] },
          historyArr: { $ifNull: ['$history', []] },
        },
      },

      // 2) Compute history length
      {
        $addFields: {
          historyLen: { $size: '$historyArr' },
        },
      },

      // 3) Slice history excluding 0th index
      {
        $addFields: {
          historyExceptFirst: {
            $cond: [
              { $gt: ['$historyLen', 1] },
              { $slice: ['$historyArr', 1, { $subtract: ['$historyLen', 1] }] },
              [],
            ],
          },
        },
      },

      // 4) Check if reviewer has in-review entry in history[1..]
      {
        $addFields: {
          hasInReviewEntry: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: '$historyExceptFirst',
                    as: 'h',
                    cond: {
                      $and: [
                        { $eq: ['$$h.updatedBy', reviewerId] },
                        { $eq: ['$$h.status', 'in-review'] },
                      ],
                    },
                  },
                },
              },
              0,
            ],
          },
        },
      },

      // 5) Determine Author or Level (Level = historyLen - 1)
      {
        $addFields: {
          isAuthor: {
            $and: [{ $eq: ['$queueIndex', 0] }, { $eq: ['$historyLen', 0] }],
          },
          computedLevel: {
            $cond: [
              {
                $and: [
                  { $eq: ['$hasInReviewEntry', true] },
                  { $gt: ['$historyLen', 1] },
                ],
              },
              {
                $concat: [
                  'Level ',
                  { $toString: { $subtract: ['$historyLen', 1] } },
                ],
              },
              null,
            ],
          },
        },
      },

      // 6) Final Review_level
      {
        $addFields: {
          Review_level: {
            $cond: [{ $eq: ['$isAuthor', true] }, 'Author', '$computedLevel'],
          },
        },
      },

      // 7) Keep only documents with Review_level
      { $match: { Review_level: { $ne: null } } },

      // 8) **LOOKUP QUESTIONS COLLECTION**
      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'questionDetails',
        },
      },

      // 9) **UNWIND QUESTION DETAILS**
      {
        $unwind: {
          path: '$questionDetails',
          preserveNullAndEmptyArrays: false,
        },
      },

      // 10) **ADD STATUS FLAGS**
      {
        $addFields: {
          isInReview: { $eq: ['$questionDetails.status', 'in-review'] },
          isDelayed: { $eq: ['$questionDetails.status', 'delayed'] },
        },
      },

      // 11) Group counts by level with status breakdown
      {
        $group: {
          _id: '$Review_level',
          count: { $sum: 1 },
          inReview: {
            $sum: {
              $cond: [{ $eq: ['$isInReview', true] }, 1, 0],
            },
          },
          delayed: {
            $sum: {
              $cond: [{ $eq: ['$isDelayed', true] }, 1, 0],
            },
          },
        },
      },

      // 12) Collect actual results into an array
      {
        $group: {
          _id: null,
          actual: {
            $push: {
              Review_level: '$_id',
              count: '$count',
              inReview: '$inReview',
              delayed: '$delayed',
            },
          },
        },
      },

      // 13) Merge with static levels to ensure missing levels show 0
      {
        $project: {
          merged: {
            $map: {
              input: [
                'Author',
                'Level 1',
                'Level 2',
                'Level 3',
                'Level 4',
                'Level 5',
                'Level 6',
                'Level 7',
                'Level 8',
                'Level 9',
              ],
              as: 'lvl',
              in: {
                Review_level: '$$lvl',
                count: {
                  $let: {
                    vars: {
                      found: {
                        $first: {
                          $filter: {
                            input: { $ifNull: ['$actual', []] },
                            cond: { $eq: ['$$this.Review_level', '$$lvl'] },
                          },
                        },
                      },
                    },
                    in: { $ifNull: ['$$found.count', 0] },
                  },
                },
                inReview: {
                  $let: {
                    vars: {
                      found: {
                        $first: {
                          $filter: {
                            input: { $ifNull: ['$actual', []] },
                            cond: { $eq: ['$$this.Review_level', '$$lvl'] },
                          },
                        },
                      },
                    },
                    in: { $ifNull: ['$$found.inReview', 0] },
                  },
                },
                delayed: {
                  $let: {
                    vars: {
                      found: {
                        $first: {
                          $filter: {
                            input: { $ifNull: ['$actual', []] },
                            cond: { $eq: ['$$this.Review_level', '$$lvl'] },
                          },
                        },
                      },
                    },
                    in: { $ifNull: ['$$found.delayed', 0] },
                  },
                },
              },
            },
          },
        },
      },

      { $unwind: '$merged' },
      { $replaceRoot: { newRoot: '$merged' } },

      // Optional: ensure Author comes first
      { $sort: { Review_level: 1 } },
    ];
    const start = startTime
      ? new Date(`${startTime}T00:00:00.000+05:30`)
      : null;

    const end = endTime ? new Date(`${endTime}T23:59:59.999+05:30`) : null;
    const pipe = [
      {
        $addFields: {
          history: {
            $filter: {
              input: '$history',
              as: 'h',
              cond: {
                $and: [
                  ...(start ? [{ $gte: ['$$h.updatedAt', start] }] : []),
                  ...(end ? [{ $lte: ['$$h.updatedAt', end] }] : []),
                ],
              },
            },
          },
        },
      },
      { $match: { history: { $ne: [] } } },
      // 1) Ensure history exists
      {
        $addFields: {
          historyArr: { $ifNull: ['$history', []] },
          historyLen: { $size: { $ifNull: ['$history', []] } },
        },
      },

      // 2) Check if reviewer is Author (history[0])
      {
        $addFields: {
          isAuthor: {
            $and: [
              { $gt: ['$historyLen', 0] },
              { $eq: [{ $arrayElemAt: ['$historyArr.updatedBy', 0] }, reviewerId] },
            ],
          },
        },
      },

      // 3) Map history[1..] with index
      {
        $addFields: {
          completedEntriesWithIndex: {
            $map: {
              input: { $range: [1, { $size: '$historyArr' }] }, // indices 1..N
              as: 'i',
              in: {
                index: '$$i',
                entry: { $arrayElemAt: ['$historyArr', '$$i'] },
              },
            },
          },
        },
      },

      // 4) Filter completed entries (NOT in-review) for this reviewer
      {
        $addFields: {
          completedEntriesWithIndex: {
            $filter: {
              input: '$completedEntriesWithIndex',
              as: 'x',
              cond: {
                $and: [
                  { $eq: ['$$x.entry.updatedBy', reviewerId] },
                  { $ne: ['$$x.entry.status', 'in-review'] },
                ],
              },
            },
          },
        },
      },

      // 5) Extract reviewEntry for counting
      {
        $addFields: {
          reviewEntry: {
            $cond: [
              '$isAuthor',
              { $arrayElemAt: ['$historyArr', 0] },
              { $arrayElemAt: ['$completedEntriesWithIndex.entry', 0] },
            ],
          },
        },
      },

      // 6) Determine Review_level with Level number starting from 1
      {
        $addFields: {
          Review_level: {
            $cond: [
              { $eq: ['$isAuthor', true] },
              'Author',
              {
                $cond: [
                  { $gt: [{ $size: '$completedEntriesWithIndex' }, 0] },
                  {
                    $concat: [
                      'Level ',
                      {
                        $toString: {
                          $arrayElemAt: ['$completedEntriesWithIndex.index', 0],
                        },
                      },
                    ],
                  },
                  null,
                ],
              },
            ],
          },
        },
      },

      // 7) Add approved/rejected/modified counting
      {
        $addFields: {
          approvedCount: {
            $cond: [{ $ifNull: ['$reviewEntry.approvedAnswer', false] }, 1, 0],
          },
          rejectedCount: {
            $cond: [{ $ifNull: ['$reviewEntry.rejectedAnswer', false] }, 1, 0],
          },
          modifiedCount: {
            $cond: [{ $ifNull: ['$reviewEntry.modifiedAnswer', false] }, 1, 0],
          },
        },
      },

      // 8) Keep only documents with Review_level
      { $match: { Review_level: { $ne: null } } },

      // 9) Group counts by Review_level
      {
        $group: {
          _id: '$Review_level',
          count: { $sum: 1 },
          approvedCount: { $sum: '$approvedCount' },
          rejectedCount: { $sum: '$rejectedCount' },
          modifiedCount: { $sum: '$modifiedCount' },
        },
      },

      // 10) Collect into array
      {
        $group: {
          _id: null,
          actual: {
            $push: {
              Review_level: '$_id',
              count: '$count',
              approvedCount: '$approvedCount',
              rejectedCount: '$rejectedCount',
              modifiedCount: '$modifiedCount',
            },
          },
        },
      },

      // 11) Merge with fixed levels to fill missing with 0
      {
        $project: {
          merged: {
            $map: {
              input: [
                'Author',
                'Level 1',
                'Level 2',
                'Level 3',
                'Level 4',
                'Level 5',
                'Level 6',
                'Level 7',
                'Level 8',
                'Level 9',
              ],
              as: 'lvl',
              in: {
                Review_level: '$$lvl',
                count: {
                  $let: {
                    vars: {
                      found: {
                        $first: {
                          $filter: {
                            input: { $ifNull: ['$actual', []] },
                            cond: { $eq: ['$$this.Review_level', '$$lvl'] },
                          },
                        },
                      },
                    },
                    in: { $ifNull: ['$$found.count', 0] },
                  },
                },
                approvedCount: {
                  $cond: [
                    { $eq: ['$$lvl', 'Author'] },
                    0,
                    {
                      $let: {
                        vars: {
                          found: {
                            $first: {
                              $filter: {
                                input: { $ifNull: ['$actual', []] },
                                cond: { $eq: ['$$this.Review_level', '$$lvl'] },
                              },
                            },
                          },
                        },
                        in: { $ifNull: ['$$found.approvedCount', 0] },
                      },
                    },
                  ],
                },
                rejectedCount: {
                  $cond: [
                    { $eq: ['$$lvl', 'Author'] },
                    0,
                    {
                      $let: {
                        vars: {
                          found: {
                            $first: {
                              $filter: {
                                input: { $ifNull: ['$actual', []] },
                                cond: { $eq: ['$$this.Review_level', '$$lvl'] },
                              },
                            },
                          },
                        },
                        in: { $ifNull: ['$$found.rejectedCount', 0] },
                      },
                    },
                  ],
                },
                modifiedCount: {
                  $cond: [
                    { $eq: ['$$lvl', 'Author'] },
                    0,
                    {
                      $let: {
                        vars: {
                          found: {
                            $first: {
                              $filter: {
                                input: { $ifNull: ['$actual', []] },
                                cond: { $eq: ['$$this.Review_level', '$$lvl'] },
                              },
                            },
                          },
                        },
                        in: { $ifNull: ['$$found.modifiedCount', 0] },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },

      // 12) Unwind merged array
      { $unwind: '$merged' },
      { $replaceRoot: { newRoot: '$merged' } },

      // 13) Sort Author first, then Levels numerically
      {
        $addFields: {
          levelSort: {
            $cond: [
              { $eq: ['$Review_level', 'Author'] },
              0,
              { $toInt: { $substr: ['$Review_level', 6, -1] } },
            ],
          },
        },
      },
      { $sort: { levelSort: 1 } },
      { $project: { levelSort: 0 } },
    ];

    let pending =
      await this.QuestionSubmissionCollection.aggregate(pipeline).toArray();
    let completed =
      await this.QuestionSubmissionCollection.aggregate(pipe).toArray();
    if (pending.length == 0) {
      pending = [
        { Review_level: 'Author', count: 0 },
        { Review_level: 'Level 1', count: 0 },
        { Review_level: 'Level 2', count: 0 },
        { Review_level: 'Level 3', count: 0 },
        { Review_level: 'Level 4', count: 0 },
        { Review_level: 'Level 5', count: 0 },
        { Review_level: 'Level 6', count: 0 },
        { Review_level: 'Level 7', count: 0 },
        { Review_level: 'Level 8', count: 0 },
        { Review_level: 'Level 9', count: 0 },
      ];
    }

    const merged = pending.map(c => {
      const matchCompleted = completed.find(
        p => p.Review_level === c.Review_level,
      );

      return {
        Review_level: c.Review_level,
        pendingcount: c.count,
        inReviewQuestions: c.inReview,
        delayedQuestion: c.delayed,
        completedcount: matchCompleted ? matchCompleted.count : 0,
        approvedCount: matchCompleted ? matchCompleted.approvedCount : 0,
        rejectedCount: matchCompleted ? matchCompleted.rejectedCount : 0,
        modifiedCount: matchCompleted ? matchCompleted.modifiedCount : 0,
      };
    });

    const reroutePipeline = [
      // 1️⃣ Explode reroutes array
      {
        $unwind: '$reroutes',
      },

      // 2️⃣ Match reviewer + exclude system rejections
      {
        $match: {
          'reroutes.reroutedTo': reviewerId,
          'reroutes.status': {
            $nin: ['moderator_rejected', 'expert_rejected'],
          },
        },
      },

      // 3️⃣ Aggregate true counts
      {
        $group: {
          _id: null,

          pendingcount: {
            $sum: {
              $cond: [{ $eq: ['$reroutes.status', 'pending'] }, 1, 0],
            },
          },

          approvedCount: {
            $sum: {
              $cond: [{ $eq: ['$reroutes.status', 'approved'] }, 1, 0],
            },
          },

          rejectedCount: {
            $sum: {
              $cond: [{ $eq: ['$reroutes.status', 'rejected'] }, 1, 0],
            },
          },

          modifiedCount: {
            $sum: {
              $cond: [{ $eq: ['$reroutes.status', 'modified'] }, 1, 0],
            },
          },

          completedcount: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$reroutes.status',
                    ['approved', 'rejected', 'modified'],
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },

      // 4️⃣ Final shape
      {
        $project: {
          _id: 0,
          Review_level: { $literal: 'rerouted' },
          pendingcount: 1,
          approvedCount: 1,
          rejectedCount: 1,
          modifiedCount: 1,
          completedcount: 1,
        },
      },
    ];
    let rerouteResults =
      await this.ReRouteCollection.aggregate(reroutePipeline).toArray();
    if (rerouteResults.length == 0) {
      rerouteResults = [
        {
          Review_level: 'rerouted',
          pendingcount: 0,

          completedcount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          modifiedCount: 0,
        },
      ];
    }
    return [...merged, ...rerouteResults];
  }
  async getModeratorReviewLevel(query: ExpertReviewLevelDto): Promise<any> {
    await this.init();
    let {
      userId,
      startTime,
      endTime,
      crop,
      normalised_crop,
      season,
      state,
      district,
      status,
      domain,
    } = query;
    // district="vn"
    // status="closed"
    crop = crop === 'all' ? undefined : crop;
    normalised_crop = normalised_crop === 'all' ? undefined : normalised_crop;
    season = season === 'all' ? undefined : season;
    state = state === 'all' ? undefined : state;
    district = district === 'all' ? undefined : district;
    status = status === 'all' ? undefined : status;
    domain = domain === 'all' ? undefined : domain;

    const start = startTime
      ? new Date(`${startTime}T00:00:00.000+05:30`)
      : null;
    const end = endTime ? new Date(`${endTime}T23:59:59.999+05:30`) : null;

    // Step 1: Get filtered question IDs if filters exist
    let questionIds = null;
    let emptyResults = [
      {
        Review_level: 'Author',
        count: 0,
        approvedCount: 0,
        rejectedCount: 0,
        modifiedCount: 0,
      },
      {
        Review_level: 'Level 1',
        count: 0,
        approvedCount: 0,
        rejectedCount: 0,
        modifiedCount: 0,
      },
      {
        Review_level: 'Level 2',
        count: 0,
        approvedCount: 0,
        rejectedCount: 0,
        modifiedCount: 0,
      },
      {
        Review_level: 'Level 3',
        count: 0,
        approvedCount: 0,
        rejectedCount: 0,
        modifiedCount: 0,
      },
      {
        Review_level: 'Level 4',
        count: 0,
        approvedCount: 0,
        rejectedCount: 0,
        modifiedCount: 0,
      },
      {
        Review_level: 'Level 5',
        count: 0,
        approvedCount: 0,
        rejectedCount: 0,
        modifiedCount: 0,
      },
      {
        Review_level: 'Level 6',
        count: 0,
        approvedCount: 0,
        rejectedCount: 0,
        modifiedCount: 0,
      },
      {
        Review_level: 'Level 7',
        count: 0,
        approvedCount: 0,
        rejectedCount: 0,
        modifiedCount: 0,
      },
      {
        Review_level: 'Level 8',
        count: 0,
        approvedCount: 0,
        rejectedCount: 0,
        modifiedCount: 0,
      },
      {
        Review_level: 'Level 9',
        count: 0,
        approvedCount: 0,
        rejectedCount: 0,
        modifiedCount: 0,
      },
    ];
    if (
      crop ||
      normalised_crop ||
      season ||
      state ||
      district ||
      status ||
      domain
    ) {
      const questionFilter: any = {};
      if (crop) questionFilter['details.crop'] = crop;
      if (normalised_crop) {
        if (normalised_crop === '__NOT_SET__') {
          questionFilter.$or = [
            { 'details.normalised_crop': { $exists: false } },
            { 'details.normalised_crop': null },
            { 'details.normalised_crop': '' },
          ];
        } else {
          questionFilter['details.normalised_crop'] = {
            $regex: `^${normalised_crop}$`,
            $options: 'i',
          };
        }
      }
      if (season) questionFilter['details.season'] = season;
      if (state) questionFilter['details.state'] = state;
      if (district) questionFilter['details.district'] = district;
      if (domain) questionFilter['details.domain'] = domain;
      if (status) questionFilter['status'] = status;
      const questions = await this.QuestionCollection.find(questionFilter, {
        projection: { _id: 1 },
      }).toArray();

      questionIds = questions.map(q => q._id);
      if (questionIds.length == 0) {
        return emptyResults;
      }

      // If no questions match the filter, return empty result
    }

    const pipe = [
      // --------------------------------------------------
      // 1. Filter by questionIds (optional)
      // --------------------------------------------------
      ...(questionIds
        ? [
          {
            $match: {
              questionId: { $in: questionIds },
            },
          },
        ]
        : []),

      // --------------------------------------------------
      // 2. Filter history by date range
      // --------------------------------------------------
      {
        $addFields: {
          history: {
            $filter: {
              input: '$history',
              as: 'h',
              cond: {
                $and: [
                  ...(start ? [{ $gte: ['$$h.updatedAt', start] }] : []),
                  ...(end ? [{ $lte: ['$$h.updatedAt', end] }] : []),
                ],
              },
            },
          },
        },
      },

      { $match: { history: { $ne: [] } } },

      // --------------------------------------------------
      // 3. Normalize history
      // --------------------------------------------------
      {
        $addFields: {
          historyArr: { $ifNull: ['$history', []] },
          historyLen: { $size: { $ifNull: ['$history', []] } },
        },
      },

      // --------------------------------------------------
      // 4. Split normal levels and Level 9
      // --------------------------------------------------
      {
        $facet: {
          // ==============================================
          // A. Author → Level 8 (cumulative)
          // ==============================================
          normalLevels: [
            { $match: { historyLen: { $gt: 1 } } },

            {
              $addFields: {
                levelIndexes: {
                  $range: [
                    0,
                    {
                      $min: [
                        { $subtract: ['$historyLen', 1] },
                        9, // cap at Level 8
                      ],
                    },
                  ],
                },
              },
            },

            {
              $addFields: {
                Review_level: {
                  $map: {
                    input: '$levelIndexes',
                    as: 'idx',
                    in: {
                      $cond: [
                        { $eq: ['$$idx', 0] },
                        'Author',
                        { $concat: ['Level ', { $toString: '$$idx' }] },
                      ],
                    },
                  },
                },
              },
            },

            { $unwind: '$Review_level' },

            // Exclude Level 9 from normal logic
            { $match: { Review_level: { $ne: 'Level 9' } } },

            {
              $group: {
                _id: '$Review_level',
                count: { $sum: 1 },
              },
            },
          ],

          // ==============================================
          // B. Level 9 (closed questions from Level 8)
          // ==============================================
          level9: [
            { $match: { historyLen: { $gt: 9 } } },

            {
              $lookup: {
                from: 'questions',
                localField: 'questionId',
                foreignField: '_id',
                as: 'question',
              },
            },

            { $unwind: '$question' },

            {
              $match: {
                'question.status': 'closed',
              },
            },

            {
              $group: {
                _id: 'Level 9',
                count: { $sum: 1 },
              },
            },
          ],
        },
      },

      // --------------------------------------------------
      // 5. Merge normal levels + Level 9
      // --------------------------------------------------
      {
        $project: {
          combined: {
            $concatArrays: ['$normalLevels', '$level9'],
          },
        },
      },

      { $unwind: '$combined' },
      { $replaceRoot: { newRoot: '$combined' } },

      // --------------------------------------------------
      // 6. Merge with fixed level list
      // --------------------------------------------------
      {
        $group: {
          _id: null,
          actual: {
            $push: {
              Review_level: '$_id',
              count: '$count',
            },
          },
        },
      },

      {
        $project: {
          merged: {
            $map: {
              input: [
                'Author',
                'Level 1',
                'Level 2',
                'Level 3',
                'Level 4',
                'Level 5',
                'Level 6',
                'Level 7',
                'Level 8',
                'Level 9',
              ],
              as: 'lvl',
              in: {
                Review_level: '$$lvl',
                count: {
                  $let: {
                    vars: {
                      found: {
                        $first: {
                          $filter: {
                            input: '$actual',
                            cond: { $eq: ['$$this.Review_level', '$$lvl'] },
                          },
                        },
                      },
                    },
                    in: { $ifNull: ['$$found.count', 0] },
                  },
                },
              },
            },
          },
        },
      },

      // --------------------------------------------------
      // 7. Final output & sort
      // --------------------------------------------------
      { $unwind: '$merged' },
      { $replaceRoot: { newRoot: '$merged' } },

      {
        $addFields: {
          levelSort: {
            $cond: [
              { $eq: ['$Review_level', 'Author'] },
              0,
              { $toInt: { $substr: ['$Review_level', 6, -1] } },
            ],
          },
        },
      },

      { $sort: { levelSort: 1 } },
      { $project: { levelSort: 0 } },
    ];
    const reviewerId = userId && userId !== 'all' ? new ObjectId(userId) : null;
    const userIdPipeline = [
      // --------------------------------------------------
      // 1. Filter by questionIds (optional)
      // --------------------------------------------------
      ...(questionIds
        ? [
          {
            $match: {
              questionId: { $in: questionIds },
            },
          },
        ]
        : []),

      // --------------------------------------------------
      // 2. Filter history by date range
      // --------------------------------------------------
      {
        $addFields: {
          history: {
            $filter: {
              input: '$history',
              as: 'h',
              cond: {
                $and: [
                  ...(start ? [{ $gte: ['$$h.updatedAt', start] }] : []),
                  ...(end ? [{ $lte: ['$$h.updatedAt', end] }] : []),
                ],
              },
            },
          },
        },
      },

      { $match: { history: { $ne: [] } } },

      // --------------------------------------------------
      // 3. Ensure history exists and calculate length
      // --------------------------------------------------
      {
        $addFields: {
          historyArr: { $ifNull: ['$history', []] },
          historyLen: { $size: { $ifNull: ['$history', []] } },
        },
      },

      // --------------------------------------------------
      // 4. Check if reviewer is Author (history[0])
      //    If reviewerId is null, count all authors
      // --------------------------------------------------
      {
        $addFields: {
          isAuthor: {
            $cond: [
              reviewerId,
              // If reviewerId provided, check if it matches history[0]
              {
                $and: [
                  { $gt: ['$historyLen', 0] },
                  {
                    $eq: [
                      { $arrayElemAt: ['$historyArr.updatedBy', 0] },
                      reviewerId,
                    ],
                  },
                ],
              },
              // If no reviewerId, all documents with history have an author
              { $gt: ['$historyLen', 0] },
            ],
          },
        },
      },

      // --------------------------------------------------
      // 5. Map history[1..] with index (review levels)
      // --------------------------------------------------
      {
        $addFields: {
          completedEntriesWithIndex: {
            $map: {
              input: { $range: [1, '$historyLen'] },
              as: 'i',
              in: {
                index: '$$i',
                entry: { $arrayElemAt: ['$historyArr', '$$i'] },
              },
            },
          },
        },
      },

      // --------------------------------------------------
      // 6. Filter completed entries
      //    If reviewerId provided: filter by that reviewer
      //    If no reviewerId: include all completed entries
      // --------------------------------------------------
      {
        $addFields: {
          completedEntriesWithIndex: {
            $filter: {
              input: '$completedEntriesWithIndex',
              as: 'x',
              cond: {
                $and: [
                  // If reviewerId provided, filter by it; otherwise include all
                  ...(reviewerId
                    ? [{ $eq: ['$$x.entry.updatedBy', reviewerId] }]
                    : []),
                  {
                    $or: [
                      { $ne: ['$$x.entry.status', 'in-review'] },
                      { $eq: ['$$x.index', { $subtract: ['$historyLen', 1] }] },
                    ],
                  },
                ],
              },
            },
          },
        },
      },

      // --------------------------------------------------
      // 7. For reviewerId mode: Extract single reviewEntry
      //    For all mode: Extract ALL review entries
      // --------------------------------------------------
      {
        $addFields: {
          reviewEntries: {
            $cond: [
              '$isAuthor',
              [{ $arrayElemAt: ['$historyArr', 0] }],
              {
                $cond: [
                  reviewerId,
                  // Single reviewer: take first matching entry
                  [{ $arrayElemAt: ['$completedEntriesWithIndex.entry', 0] }],
                  // All reviewers: take all completed entries
                  '$completedEntriesWithIndex.entry',
                ],
              },
            ],
          },
          reviewLevels: {
            $cond: [
              '$isAuthor',
              ['Author'],
              {
                $cond: [
                  reviewerId,
                  // Single reviewer: get their level
                  {
                    $cond: [
                      { $gt: [{ $size: '$completedEntriesWithIndex' }, 0] },
                      [
                        {
                          $concat: [
                            'Level ',
                            {
                              $toString: {
                                $arrayElemAt: [
                                  '$completedEntriesWithIndex.index',
                                  0,
                                ],
                              },
                            },
                          ],
                        },
                      ],
                      [],
                    ],
                  },
                  // All reviewers: get all levels
                  {
                    $map: {
                      input: '$completedEntriesWithIndex',
                      as: 'entry',
                      in: {
                        $concat: ['Level ', { $toString: '$$entry.index' }],
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },

      // --------------------------------------------------
      // 8. Unwind to create one document per review level
      // --------------------------------------------------
      {
        $addFields: {
          combined: {
            $map: {
              input: { $range: [0, { $size: '$reviewLevels' }] },
              as: 'idx',
              in: {
                Review_level: { $arrayElemAt: ['$reviewLevels', '$$idx'] },
                reviewEntry: { $arrayElemAt: ['$reviewEntries', '$$idx'] },
              },
            },
          },
        },
      },

      { $unwind: '$combined' },

      // --------------------------------------------------
      // 9. Add approved/rejected/modified counting
      // --------------------------------------------------
      {
        $addFields: {
          Review_level: '$combined.Review_level',
          approvedCount: {
            $cond: [
              { $ifNull: ['$combined.reviewEntry.approvedAnswer', false] },
              1,
              0,
            ],
          },
          rejectedCount: {
            $cond: [
              { $ifNull: ['$combined.reviewEntry.rejectedAnswer', false] },
              1,
              0,
            ],
          },
          modifiedCount: {
            $cond: [
              { $ifNull: ['$combined.reviewEntry.modifiedAnswer', false] },
              1,
              0,
            ],
          },
        },
      },

      // --------------------------------------------------
      // 10. Keep only documents with Review_level
      // --------------------------------------------------
      { $match: { Review_level: { $ne: null } } },

      // --------------------------------------------------
      // 11. Group counts by Review_level
      // --------------------------------------------------
      {
        $group: {
          _id: '$Review_level',
          count: { $sum: 1 },
          approvedCount: { $sum: '$approvedCount' },
          rejectedCount: { $sum: '$rejectedCount' },
          modifiedCount: { $sum: '$modifiedCount' },
        },
      },

      // --------------------------------------------------
      // 12. Collect into array
      // --------------------------------------------------
      {
        $group: {
          _id: null,
          actual: {
            $push: {
              Review_level: '$_id',
              count: '$count',
              approvedCount: '$approvedCount',
              rejectedCount: '$rejectedCount',
              modifiedCount: '$modifiedCount',
            },
          },
        },
      },

      // --------------------------------------------------
      // 13. Merge with fixed levels to fill missing with 0
      // --------------------------------------------------
      {
        $project: {
          merged: {
            $map: {
              input: [
                'Author',
                'Level 1',
                'Level 2',
                'Level 3',
                'Level 4',
                'Level 5',
                'Level 6',
                'Level 7',
                'Level 8',
                'Level 9',
              ],
              as: 'lvl',
              in: {
                Review_level: '$$lvl',
                count: {
                  $let: {
                    vars: {
                      found: {
                        $first: {
                          $filter: {
                            input: { $ifNull: ['$actual', []] },
                            cond: { $eq: ['$$this.Review_level', '$$lvl'] },
                          },
                        },
                      },
                    },
                    in: { $ifNull: ['$$found.count', 0] },
                  },
                },
                approvedCount: {
                  $cond: [
                    { $eq: ['$$lvl', 'Author'] },
                    0,
                    {
                      $let: {
                        vars: {
                          found: {
                            $first: {
                              $filter: {
                                input: { $ifNull: ['$actual', []] },
                                cond: { $eq: ['$$this.Review_level', '$$lvl'] },
                              },
                            },
                          },
                        },
                        in: { $ifNull: ['$$found.approvedCount', 0] },
                      },
                    },
                  ],
                },
                rejectedCount: {
                  $cond: [
                    { $eq: ['$$lvl', 'Author'] },
                    0,
                    {
                      $let: {
                        vars: {
                          found: {
                            $first: {
                              $filter: {
                                input: { $ifNull: ['$actual', []] },
                                cond: { $eq: ['$$this.Review_level', '$$lvl'] },
                              },
                            },
                          },
                        },
                        in: { $ifNull: ['$$found.rejectedCount', 0] },
                      },
                    },
                  ],
                },
                modifiedCount: {
                  $cond: [
                    { $eq: ['$$lvl', 'Author'] },
                    0,
                    {
                      $let: {
                        vars: {
                          found: {
                            $first: {
                              $filter: {
                                input: { $ifNull: ['$actual', []] },
                                cond: { $eq: ['$$this.Review_level', '$$lvl'] },
                              },
                            },
                          },
                        },
                        in: { $ifNull: ['$$found.modifiedCount', 0] },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },

      // --------------------------------------------------
      // 14. Unwind and format output
      // --------------------------------------------------
      { $unwind: '$merged' },
      { $replaceRoot: { newRoot: '$merged' } },

      // --------------------------------------------------
      // 15. Sort Author first, then Levels numerically
      // --------------------------------------------------
      {
        $addFields: {
          levelSort: {
            $cond: [
              { $eq: ['$Review_level', 'Author'] },
              0,
              { $toInt: { $substr: ['$Review_level', 6, -1] } },
            ],
          },
        },
      },
      { $sort: { levelSort: 1 } },
      { $project: { levelSort: 0 } },
    ];
    let pipeline;
    if (userId && userId !== 'all') {
      pipeline = userIdPipeline;
    } else {
      pipeline = pipe;
    }

    let completed =
      await this.QuestionSubmissionCollection.aggregate(pipeline).toArray();
    if (completed.length == 0) {
      return emptyResults;
    }

    return completed;
  }

  async getReviewWiseCount(): Promise<IReviewWiseStats> {
    await this.init();
    const [result] =
      await this.QuestionSubmissionCollection.aggregate<IReviewWiseStats>([
        {
          $addFields: {
            historyLength: { $size: '$history' },
          },
        },

        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'question',
          },
        },

        { $unwind: '$question' },

        {
          $group: {
            _id: null,

            authorLevel: {
              $sum: { $cond: [{ $gte: ['$historyLength', 1] }, 1, 0] },
            },

            levelOne: {
              $sum: { $cond: [{ $gte: ['$historyLength', 3] }, 1, 0] },
            },

            levelTwo: {
              $sum: { $cond: [{ $gte: ['$historyLength', 4] }, 1, 0] },
            },

            levelThree: {
              $sum: { $cond: [{ $gte: ['$historyLength', 5] }, 1, 0] },
            },

            levelFour: {
              $sum: { $cond: [{ $gte: ['$historyLength', 6] }, 1, 0] },
            },

            levelFive: {
              $sum: { $cond: [{ $gte: ['$historyLength', 7] }, 1, 0] },
            },

            levelSix: {
              $sum: { $cond: [{ $gte: ['$historyLength', 8] }, 1, 0] },
            },

            levelSeven: {
              $sum: { $cond: [{ $gte: ['$historyLength', 9] }, 1, 0] },
            },

            levelEight: {
              $sum: { $cond: [{ $gte: ['$historyLength', 10] }, 1, 0] },
            },

            levelNineEligible: {
              $sum: {
                $cond: [{ $gte: ['$historyLength', 10] }, 1, 0],
              },
            },

            levelNineInReview: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$historyLength', 10] },
                      { $eq: ['$question.status', 'in-review'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },

        {
          $project: {
            _id: 0,
            authorLevel: 1,
            levelOne: 1,
            levelTwo: 1,
            levelThree: 1,
            levelFour: 1,
            levelFive: 1,
            levelSix: 1,
            levelSeven: 1,
            levelEight: 1,

            levelNine: {
              $subtract: ['$levelNineEligible', '$levelNineInReview'],
            },
          },
        },
      ]).toArray();

    return (
      result ?? {
        authorLevel: 0,
        levelOne: 0,
        levelTwo: 0,
        levelThree: 0,
        levelFour: 0,
        levelFive: 0,
        levelSix: 0,
        levelSeven: 0,
        levelEight: 0,
        levelNine: 0,
      }
    );
  }

  async getAbsentSubmissions(
    absentExpertIds: string[],
    session?: ClientSession,
  ): Promise<IQuestionSubmission[]> {
    try {
      await this.init();

      const submissions = await this.QuestionSubmissionCollection.find(
        {
          queue: {
            $in: absentExpertIds.map(id => new ObjectId(id)),
          },
        },
        { session },
      ).toArray();

      const pendingSubmissions: IQuestionSubmission[] = [];

      for (const submission of submissions) {
        const { queue = [], history = [] } = submission;

        if (queue.length === 0) continue;

        let hasPendingAbsentExpert = false;
        // if (queue.length === history.length && history.length > 0) {
        //   const lastHistory = history[history.length - 1];

        //   if (lastHistory.status === 'in-review') {
        //     const pendingIndex = history.length - 1;
        //     const expertId = queue[pendingIndex]?.toString();

        //     if (expertId && absentExpertIds.includes(expertId)) {
        //       hasPendingAbsentExpert = true;
        //     }
        //   }
        // }

        if (history.length > 0) {
          const lastHistoryIndex = history.length - 1;
          const lastHistory = history[lastHistoryIndex];

          if (lastHistory.status === 'in-review') {
            const expertId = queue[lastHistoryIndex]?.toString();

            if (expertId && absentExpertIds.includes(expertId)) {
              hasPendingAbsentExpert = true;
            }
          }
        }
        if (!hasPendingAbsentExpert) {
          for (let index = history.length; index < queue.length; index++) {
            const expertId = queue[index]?.toString();
            if (!expertId) continue;

            if (absentExpertIds.includes(expertId)) {
              hasPendingAbsentExpert = true;
              break;
            }
          }
        }

        if (hasPendingAbsentExpert) {
          pendingSubmissions.push(submission);
        }
      }

      return pendingSubmissions;
    } catch (error) {
      throw new InternalServerError('Failed to get absent submissions');
    }
  }
  async findQuestionsNeedingEscalation(
    limit?: number,
    session?: ClientSession,
  ): Promise<IQuestionSubmission[]> {
    await this.init();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    return this.QuestionSubmissionCollection.aggregate<IQuestionSubmission>(
      [
        {
          $match: {
            $or: [
              // Type A — Never answered
              {
                history: { $size: 0 },
                lastRespondedBy: null,
                createdAt: { $lte: oneHourAgo },
              },

              // Type B — Last update stuck in-review
              {
                'history.1': { $exists: true },
                $expr: {
                  $let: {
                    vars: {
                      lastHistory: { $arrayElemAt: ['$history', -1] },
                    },
                    in: {
                      $and: [
                        { $eq: ['$$lastHistory.status', 'in-review'] },
                        { $lte: ['$$lastHistory.createdAt', oneHourAgo] },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
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
        ...(limit ? [{ $limit: limit }] : []),
      ],
      { session },
    ).toArray();
  }
  async findById(id: string): Promise<IQuestionSubmission | null> {
    if (!id) return null;
    return await this.QuestionSubmissionCollection.findOne({
      _id: new ObjectId(id),
    });
  }
  async updateById(
    id: string,
    update: any,
    session?: ClientSession,
  ): Promise<IQuestionSubmission | null> {
    await this.init();
    const result = await this.QuestionSubmissionCollection.findOneAndUpdate(
      { _id: new ObjectId(id) }, // filter
      update, // update operators
      {
        returnDocument: 'after', // return updated doc
        session,
      },
    );

    return result; // contains the updated document
  }

  // ─── Time-bound allocation tracking ───────────────────────────────────────

  async markQuestionOpenedByExpert(questionId: string, expertId: string, isTimeBound: boolean = true): Promise<void> {
    await this.init();

    // Always clear currentExpertOpenedAt on any OTHER time-bound question this
    // expert had previously opened. This ensures navigating to ANY question
    // (time-bound or not) frees the old time-bound question for reallocation.
    await this.QuestionSubmissionCollection.updateMany(
      {
        questionId: { $ne: new ObjectId(questionId) },
        queue: new ObjectId(expertId),
        currentExpertOpenedAt: { $ne: null },
      },
      { $set: { currentExpertOpenedAt: null, updatedAt: new Date() } },
    );

    // Only set currentExpertOpenedAt on the current question if it's time-bound
    if (!isTimeBound) return;

    const submission = await this.QuestionSubmissionCollection.findOne({
      questionId: new ObjectId(questionId),
    });
    if (!submission) return;
    if (submission.currentExpertOpenedAt) return; // already marked

    const history = submission.history || [];
    const queue = submission.queue || [];

    // Determine who the current expert is
    let currentExpertId: string | null = null;
    if (history.length === 0) {
      currentExpertId = queue[0]?.toString() ?? null;
    } else {
      const lastHistory = history[history.length - 1];
      if (lastHistory.status === 'in-review') {
        currentExpertId = lastHistory.updatedBy?.toString() ?? null;
      } else {
        currentExpertId = queue[history.length]?.toString() ?? null;
      }
    }

    // Only mark opened if the calling expert is the current assignee
    if (!currentExpertId || currentExpertId !== expertId.toString()) return;

    await this.QuestionSubmissionCollection.updateOne(
      { questionId: new ObjectId(questionId) },
      { $set: { currentExpertOpenedAt: new Date(), updatedAt: new Date() } },
    );
  }

  async setCurrentExpertAllocatedAt(questionId: string, allocatedAt: Date): Promise<void> {
    await this.init();
    await this.QuestionSubmissionCollection.updateOne(
      { questionId: new ObjectId(questionId) },
      {
        $set: {
          currentExpertAllocatedAt: allocatedAt,
          currentExpertOpenedAt: null,
          updatedAt: new Date(),
        },
      },
    );
  }

  /** Clear the current-expert tracking timestamps once the expert has submitted
   *  their response — both the allocated-at and opened-at clocks are reset so the
   *  time-bound stuck/idle cron won't flag the question until the next expert is
   *  allocated (which sets currentExpertAllocatedAt afresh). */
  async clearCurrentExpertTracking(questionId: string, session?: ClientSession): Promise<void> {
    await this.init();
    await this.QuestionSubmissionCollection.updateOne(
      { questionId: new ObjectId(questionId) },
      { $set: { currentExpertAllocatedAt: null, currentExpertOpenedAt: null, updatedAt: new Date() } },
      { session },
    );
  }

  async findTimeBoundQuestionsForReallocation(): Promise<IQuestionSubmission[]> {
    await this.init();
    const fortyFiveMinAgo = new Date(Date.now() - 45 * 60 * 1000);

    return this.QuestionSubmissionCollection.aggregate<IQuestionSubmission>([
      {
        $match: {
          currentExpertAllocatedAt: { $exists: true, $ne: null, $lte: fortyFiveMinAgo },
          $or: [
            { currentExpertOpenedAt: { $exists: false } },
            { currentExpertOpenedAt: null },
          ],
        },
      },
      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'question',
        },
      },
      { $unwind: '$question' },
      {
        $match: {
          'question.source': { $in: ['WHATSAPP', 'AJRASAKHA'] },
          // 're-routed' questions are owned by the reroute flow (moderators handle them),
          // not the time-bound cron — exclude them so they don't consume STF capacity.
          'question.status': { $nin: ['closed', 'in-review', 'pae_submitted', 'pass', 'duplicate', 'draft', 'non_agri', 're-routed'] },
          'question.isOnHold': { $ne: true },
          'question.isAutoAllocate': {$eq: true}
        },
      },
      { $sort: { 'question.createdAt': 1 } },
    ]).toArray();
  }

  /** Time-bound questions the current expert OPENED more than 45 min ago but still
   *  hasn't produced an answer for — i.e. the latest history entry carries no
   *  answer / approvedAnswer / modifiedAnswer / rejectedAnswer (an empty history,
   *  meaning opened-but-no-entry, also qualifies). Distinct from "stuck", which is
   *  allocated-but-NEVER-opened. */
  async findOpenedButIdleTimeBoundQuestions(): Promise<IQuestionSubmission[]> {
    await this.init();
    const fortyFiveMinAgo = new Date(Date.now() - 45 * 60 * 1000);

    return this.QuestionSubmissionCollection.aggregate<IQuestionSubmission>([
      {
        $match: {
          currentExpertOpenedAt: { $exists: true, $ne: null, $lte: fortyFiveMinAgo },
        },
      },
      {
        $addFields: {
          lastHistory: { $arrayElemAt: [{ $ifNull: ['$history', []] }, -1] },
        },
      },
      {
        $match: {
          'lastHistory.answer': { $in: [null] },
          'lastHistory.approvedAnswer': { $in: [null] },
          'lastHistory.modifiedAnswer': { $in: [null] },
          'lastHistory.rejectedAnswer': { $in: [null] },
        },
      },
      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'question',
        },
      },
      { $unwind: '$question' },
      {
        $match: {
          'question.source': { $in: ['WHATSAPP', 'AJRASAKHA'] },
          'question.status': { $in: ['open', 'delayed'] },
          'question.isOnHold': { $ne: true },
          'question.isAutoAllocate': { $eq: true },
        },
      },
      { $sort: { 'question.createdAt': 1 } },
    ]).toArray();
  }

  async findUnallocatedTimeBoundQuestions(): Promise<IQuestionSubmission[]> {
    await this.init();

    // Never-allocated time-bound questions sourced directly from the questions
    // collection: time-bound + auto-allocate + still open/delayed + never had a
    // first allocation. Shaped to the submission-like form the callers expect
    // (.questionId / .question / .queue).
    const questions = await this.QuestionCollection.find({
      source: { $in: ['AJRASAKHA', 'WHATSAPP'] },
      isAutoAllocate: true,
      status: { $in: ['open', 'delayed'] },
      firstAllocationAt: null,
      isOnHold: { $ne: true },
    })
      .sort({ createdAt: 1 })
      .toArray();

    return questions.map(q => ({
      questionId: q._id,
      question: q,
      queue: [],
      history: [],
      createdAt: q.createdAt,
    })) as unknown as IQuestionSubmission[];
  }

  /** Find time-bound (AJRASAKHA/WHATSAPP) submissions where the current expert
   *  has completed their turn (submitted an answer OR finished a review) but no
   *  new reviewer has been assigned — question is still open/delayed.
   *
   *  Condition: history.length >= queue.length (all assigned experts have entries)
   *  AND the last expert completed their work:
   *    - Position 0 (author): history[0].answer exists (submitted their answer)
   *    - Position >= 1 (reviewer): last history status !== 'in-review' (completed review) */
  async findAnsweredQuestionsNeedingReviewer(): Promise<IQuestionSubmission[]> {
    await this.init();
    return this.QuestionSubmissionCollection.aggregate<IQuestionSubmission>([
      {
        $addFields: {
          histLen: { $size: { $ifNull: ['$history', []] } },
          queueLen: { $size: { $ifNull: ['$queue', []] } },
          lastHistory: { $arrayElemAt: ['$history', -1] },
        },
      },
      {
        $match: {
          // Queue must not be empty
          queueLen: { $gt: 0 },
          // All queue members must have a history entry (everyone has done their part)
          $expr: { $gte: ['$histLen', '$queueLen'] },
          // The last history entry must indicate completed work
          $or: [
            // Author (queue has 1 member) submitted their answer
            {
              $and: [
                { queueLen: 1 },
                { 'lastHistory.answer': { $exists: true, $ne: null } },
              ],
            },
            // Reviewer (queue has >1 members) completed their review (status != 'in-review')
            {
              $and: [
                { queueLen: { $gt: 1 } },
                { 'lastHistory.status': { $nin: ['in-review'] } },
              ],
            },
          ],
        },
      },
      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'question',
        },
      },
      { $unwind: '$question' },
      {
        $match: {
          'question.source': { $in: ['WHATSAPP', 'AJRASAKHA'] },
          'question.status': { $in: ['open', 'delayed'] },
          'question.isOnHold': { $ne: true },
          'question.isAutoAllocate': {$eq:true}
        },
      },
    ]).toArray();
  }

  /** Atomically add a reviewer to a time-bound question:
   *  pushes the expert into queue, creates an in-review history entry,
   *  and resets the 45-min allocation clock. */
  async assignTimeBoundReviewer(
    questionId: string,
    reviewerId: string,
    now: Date,
  ): Promise<void> {
    await this.init();
    await this.QuestionSubmissionCollection.updateOne(
      { questionId: new ObjectId(questionId) },
      {
        $push: {
          queue: new ObjectId(reviewerId),
          history: {
            updatedBy: new ObjectId(reviewerId),
            status: 'in-review',
            createdAt: now,
            updatedAt: now,
          },
        } as any,
        $set: {
          currentExpertAllocatedAt: now,
          currentExpertOpenedAt: null,
          updatedAt: now,
        },
      },
    );
  }

  async getTimeBoundActiveCountPerExpert(): Promise<Map<string, number>> {
    await this.init();
    // Pipeline: join with questions, filter to time-bound, unwind queue with index,
    // and determine whether the expert at each position still has pending work.
    //
    // Position 0 (author): active if history[0].answer is missing/null (hasn't submitted yet).
    // Position ≥ 1 (reviewer): active if history[position].status === 'in-review' (hasn't completed review).
    const result = await this.QuestionSubmissionCollection.aggregate<{ _id: string; count: number }>([
      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'q',
        },
      },
      { $unwind: '$q' },
      {
        $match: {
          'q.source': { $in: ['WHATSAPP', 'AJRASAKHA'] },
          'q.status': { $in: ['open', 'delayed'] },
          'q.isOnHold': { $ne: true },
        },
      },
      // Unwind queue so each expert gets their own document with their position index
      {
        $unwind: {
          path: '$queue',
          includeArrayIndex: 'queueIndex',
        },
      },
      // Get the corresponding history entry for this queue position (may be null if not yet created)
      {
        $addFields: {
          correspondingHistory: { $arrayElemAt: ['$history', '$queueIndex'] },
        },
      },
      // Determine if this expert still has pending work at their position
      {
        $addFields: {
          isPending: {
            $cond: {
              // Position 0 = author: pending if no history entry yet, or history entry has no answer
              if: { $eq: ['$queueIndex', 0] },
              then: {
                $or: [
                  { $eq: ['$correspondingHistory', null] },
                  { $not: { $ifNull: ['$correspondingHistory.answer', false] } },
                ],
              },
              // Position >= 1 = reviewer: pending if no history entry yet, or status is 'in-review'
              else: {
                $or: [
                  { $eq: ['$correspondingHistory', null] },
                  { $eq: ['$correspondingHistory.status', 'in-review'] },
                ],
              },
            },
          },
        },
      },
      // Keep only experts who still have pending work
      { $match: { isPending: true } },
      // Filter out null queue entries
      { $match: { queue: { $ne: null } } },
      {
        $group: {
          _id: '$queue',
          count: { $sum: 1 },
        },
      },
    ]).toArray();

    const map = new Map<string, number>();
    for (const r of result) {
      if (r._id) map.set(r._id.toString(), r.count);
    }
   // console.log('[getTimeBoundActiveCountPerExpert] result:', JSON.stringify(result), 'map:', JSON.stringify([...map]));
    return map;
  }

  //get level wise answer submission percentage report
  async getLevelWiseReport(
    startDate: string,
    endDate: string,
    session?: ClientSession,
  ): Promise<LevelReportStat[]> {
    await this.init();

    const convertedStartDate = new Date(startDate);
    const convertedEndDate = new Date(endDate);
    const pipeline: any[] = [
      // 1️⃣ Unwind history
      {
        $unwind: {
          path: '$history',
          includeArrayIndex: 'historyIndex',
        },
      },

      // 2️⃣ Ignore author level (index 0) + filter date
      {
        $match: {
          historyIndex: { $gt: 0 },
          'history.createdAt': {
            $gte: convertedStartDate,
            $lte: convertedEndDate,
          },
        },
      },

      // 3️⃣ Add computed fields
      {
        $addFields: {
          level: '$historyIndex',

          month: {
            $dateToString: {
              format: '%Y-%m',
              date: { $toDate: '$history.createdAt' },
            },
          },

          timeTaken: {
            $cond: [
              {
                $and: [
                  { $ifNull: ['$history.createdAt', false] },
                  { $ifNull: ['$history.updatedAt', false] },
                ],
              },
              {
                $subtract: [
                  { $toDate: '$history.updatedAt' },
                  { $toDate: '$history.createdAt' },
                ],
              },
              null,
            ],
          },
        },
      },

      // 4️⃣ Group by month + level
      {
        $group: {
          _id: {
            month: '$month',
            level: '$level',
          },

          approvedCount: {
            $sum: {
              $cond: [{ $ifNull: ['$history.approvedAnswer', false] }, 1, 0],
            },
          },

          rejectedCount: {
            $sum: {
              $cond: [{ $ifNull: ['$history.rejectedAnswer', false] }, 1, 0],
            },
          },

          modifiedCount: {
            $sum: {
              $cond: [{ $ifNull: ['$history.modifiedAnswer', false] }, 1, 0],
            },
          },

          avgTimeTaken: { $avg: '$timeTaken' },
        },
      },

      // 5️⃣ Add totalProcessed
      {
        $addFields: {
          totalProcessed: {
            $add: ['$approvedCount', '$rejectedCount', '$modifiedCount'],
          },
        },
      },

      // 6️⃣ Add percentages + convert avgTime to minutes
      {
        $addFields: {
          approvedPercentage: {
            $cond: [
              { $eq: ['$totalProcessed', 0] },
              0,
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ['$approvedCount', '$totalProcessed'] },
                      100,
                    ],
                  },
                  2,
                ],
              },
            ],
          },

          rejectedPercentage: {
            $cond: [
              { $eq: ['$totalProcessed', 0] },
              0,
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ['$rejectedCount', '$totalProcessed'] },
                      100,
                    ],
                  },
                  2,
                ],
              },
            ],
          },

          modifiedPercentage: {
            $cond: [
              { $eq: ['$totalProcessed', 0] },
              0,
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ['$modifiedCount', '$totalProcessed'] },
                      100,
                    ],
                  },
                  2,
                ],
              },
            ],
          },

          avgTimeTakenMinutes: {
            $round: [{ $divide: ['$avgTimeTaken', 1000 * 60] }, 2],
          },
        },
      },

      // 7️⃣ Regroup by month
      {
        $group: {
          _id: '$_id.month',
          data: {
            $push: {
              level: '$_id.level',
              approvedCount: '$approvedCount',
              rejectedCount: '$rejectedCount',
              modifiedCount: '$modifiedCount',
              totalProcessed: '$totalProcessed',
              approvedPercentage: '$approvedPercentage',
              rejectedPercentage: '$rejectedPercentage',
              modifiedPercentage: '$modifiedPercentage',
              avgTimeTakenMinutes: '$avgTimeTakenMinutes',
            },
          },
        },
      },

      // 8️⃣ Sort levels inside each month
      {
        $addFields: {
          data: {
            $sortArray: {
              input: '$data',
              sortBy: { level: 1 },
            },
          },
        },
      },

      // 9️⃣ Final shape
      {
        $project: {
          _id: 0,
          month: '$_id',
          data: 1,
        },
      },

      // 🔟 Sort months
      {
        $sort: { month: 1 },
      },
    ];
    const result =
      await this.QuestionSubmissionCollection.aggregate<LevelReportStat>(
        pipeline,
        {
          session,
        },
      ).toArray();
    return result;
  }

  async updateSubmissionState(
    questionId: string,
    update: {
      queue?: ObjectId[];
      popHistory?: boolean;
      expertIdToRemove?: string;
    },
    session?: ClientSession,
  ): Promise<void> {
    try {
      await this.init();

      const updateDoc: any = {
        $set: {
          updatedAt: new Date(),
        },
      };

      if (update.queue) {
        updateDoc.$set.queue = update.queue;
      }

      if (update.popHistory && update.expertIdToRemove) {
        // Only remove the history entry if it is still 'in-review'.
        // $pop blindly removes the last element even after the expert has
        // already submitted (status changed to 'reviewed'), causing data loss.
        updateDoc.$pull = {
          history: {
            updatedBy: new ObjectId(update.expertIdToRemove),
            status: 'in-review',
          },
        };
      } else if (update.popHistory) {
        updateDoc.$pop = { history: 1 };
      }

      const result = await this.QuestionSubmissionCollection.updateOne(
        { questionId: new ObjectId(questionId) },
        updateDoc,
        { session },
      );

      if (result.matchedCount === 0) {
        throw new InternalServerError(
          `No submission found for questionId: ${questionId}`,
        );
      }
    } catch (error) {
      throw new InternalServerError(
        `Failed to update submission state: ${error}`,
      );
    }
  }

  async findSubmissionsByActiveReviewers(
    expertIds: string[],
    session?: ClientSession,
  ): Promise<IQuestionSubmission[]> {
    await this.init();
    const expertObjectIds = expertIds.map(id => new ObjectId(id));

    return this.QuestionSubmissionCollection.aggregate<IQuestionSubmission>(
      [
        {
          $addFields: {
            historyLength: { $size: { $ifNull: ['$history', []] } },
          },
        },
        {
          $addFields: {
            currentReviewerId: { $arrayElemAt: ['$queue', '$historyLength'] },
          },
        },
        {
          $match: {
            $or: [
              { currentReviewerId: { $in: expertObjectIds } },
              { currentReviewerId: { $in: expertIds } }, // Handle cases where IDs are stored as strings
            ],
          },
        },
      ],
      { session },
    ).toArray();
  }

  // async findSubmissionsWithExpertsInQueue(
  //   expertIds: string[],
  //   session?: ClientSession,
  // ): Promise<IQuestionSubmission[]> {
  //   await this.init();
  //   const expertObjectIds = expertIds.map(id => new ObjectId(id));

  //   return this.QuestionSubmissionCollection.find(
  //     {
  //       $or: [
  //         {queue: {$in: expertObjectIds}},
  //         {queue: {$in: expertIds}}, // Handle string IDs
  //       ],
  //     },
  //     {session},
  //   ).toArray();
  // }

  async findSubmissionsWithExpertsInQueue(
    expertIds: string[],
    session?: ClientSession,
    limit?: number,
  ): Promise<IQuestionSubmission[]> {
    await this.init();

    const expertObjectIds = expertIds.map(id => new ObjectId(id));

    const allExpertIds = [...expertIds, ...expertObjectIds];

    return this.QuestionSubmissionCollection.find(
      {
        $or: [
          /*
          Case 1:
         * history is empty
         * AND first queue expert matches
          */
          {
            $expr: {
              $and: [
                {
                  $eq: [
                    {
                      $size: {
                        $ifNull: ['$history', []],
                      },
                    },
                    0,
                  ],
                },
                {
                  $in: [
                    {
                      $arrayElemAt: ['$queue', 0],
                    },
                    allExpertIds,
                  ],
                },
              ],
            },
          },
          /*
          Case 2:
         * history exists
         * AND latest history is 'in-review' (stuck)
         * AND latest history.updatedBy matches
         */
          {
            $expr: {
              $and: [
                {
                  $gt: [
                    {
                      $size: {
                        $ifNull: ['$history', []],
                      },
                    },
                    0,
                  ],
                },
                {
                  $eq: [
                    {
                      $getField: {
                        field: 'status',
                        input: {
                          $arrayElemAt: ['$history', -1],
                        },
                      },
                    },
                    'in-review',
                  ],
                },
                {
                  $in: [
                    {
                      $getField: {
                        field: 'updatedBy',
                        input: {
                          $arrayElemAt: ['$history', -1],
                        },
                      },
                    },
                    allExpertIds,
                  ],
                },
              ],
            },
          },
          /*
          Case 3: Proactive - Next person in queue is inactive
          * history exists
          * AND latest history is NOT 'in-review' (meaning turn has passed)
          * AND queue[history.length] is inactive
          */
          {
            $expr: {
              $and: [
                {
                  $gt: [
                    {
                      $size: {
                        $ifNull: ['$history', []],
                      },
                    },
                    0,
                  ],
                },
                {
                  $ne: [
                    {
                      $getField: {
                        field: 'status',
                        input: {
                          $arrayElemAt: ['$history', -1],
                        },
                      },
                    },
                    'in-review',
                  ],
                },
                {
                  $in: [
                    {
                      $arrayElemAt: [
                        '$queue',
                        {
                          $size: {
                            $ifNull: ['$history', []],
                          },
                        },
                      ],
                    },
                    allExpertIds,
                  ],
                },
              ],
            },
          },
        ],
      },
      { session },
    )
      .limit(limit || 0)
      .toArray();
  }

  async findReallocationQuestionsByIds(questionIds?: string[], session?: ClientSession): Promise<IQuestionSubmission[]> {
    await this.init();

    return this.QuestionSubmissionCollection.aggregate<IQuestionSubmission>(
      [
        {
          $match: {
            questionId: {
              $in: questionIds?.map(id => new ObjectId(id)),
            },
          },
        },
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
            'question.status': {
              $nin: ['closed', 'in-review', 'pass', 'draft', 'pae_submitted'],
            },
          },
        },
      ],
      { session },
    ).toArray();
  }

  //get delayed questions
  async getDelayedReviews(session: ClientSession): Promise<{ _id: ObjectId; questionId: ObjectId; userId: ObjectId }[]> {
    try {
      await this.init();

      // for testing purpose
      // const thirtySecondsAgo = new Date(
      //   Date.now() - 30 * 1000,
      // );

      const thresholdTime = new Date(
        Date.now() - 45 * 60 * 1000,
      );

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const delayedReviews =
        await this.QuestionSubmissionCollection.aggregate([
          {
            $match: {
              createdAt: {
                $gte: startOfDay,
              },
              reviewDelayNotificationSent: {
                $ne: true,
              },
            },
          },

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
            $addFields: {
              latestHistory: {
                $arrayElemAt: [
                  '$history',
                  -1,
                ],
              },
            },
          },

          {
            $match: {
              $or: [
                /**
                 * CASE 1
                 * First reviewer
                 */
                {
                  $and: [
                    {
                      history: {
                        $size: 0,
                      },
                    },

                    {
                      'queue.0': {
                        $exists: true,
                      },
                    },

                    {
                      'question.firstAllocationAt': {
                        $lte: thresholdTime,
                      },
                    },
                  ],
                },

                /**
                 * CASE 2
                 * Active reviewer
                 */
                {
                  $and: [
                    {
                      history: {
                        $not: {
                          $size: 0,
                        },
                      },
                    },

                    {
                      'latestHistory.status':
                        'in-review',
                    },

                    {
                      'latestHistory.createdAt':
                      {
                        $lte: thresholdTime,
                      },
                    },

                    {
                      'latestHistory.answer': {
                        $exists: false,
                      },
                    },

                  ],
                },
              ],
            },
          },

          {
            $project: {
              _id: 1,

              questionId: 1,

              userId: '$question.userId',

              currentReviewerId: {
                $cond: [
                  {
                    $eq: [
                      {
                        $size: '$history',
                      },
                      0,
                    ],
                  },
                  {
                    $arrayElemAt: [
                      '$queue',
                      0,
                    ],
                  },
                  '$latestHistory.updatedBy',
                ],
              },
            },
          },
        ],
          { session }
        ).toArray();

      return delayedReviews as { _id: ObjectId; questionId: ObjectId; userId: ObjectId; }[];

    } catch (error) {
      console.error('Error getting delayed questions', error);
    }
  }

  //mark delayed notification sent
  async markDelayedNotificationsSent(notifiedSubmissionIds: ObjectId[], session?: ClientSession): Promise<void> {
    try {
      await this.init();
      await this.QuestionSubmissionCollection.updateMany(
        {
          _id: {
            $in: notifiedSubmissionIds,
          },
        },
        {
          $set: {
            reviewDelayNotificationSent: true,
          },
        },
      );

    }
    catch (error) {
      console.error('Error marking delayed notifications sent', error);
    }
  }

}
