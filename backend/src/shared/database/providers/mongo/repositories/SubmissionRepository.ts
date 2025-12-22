import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {
  IQuestionSubmission,
  ISubmissionHistory,
  IReviewerHeatmapRow,
  IReview,
  IAnswer,
  IReroute
} from '#root/shared/interfaces/models.js';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from 'routing-controllers';
import {USER_VALIDATORS} from '#root/modules/core/classes/validators/UserValidators.js';
import {HistoryItem} from '#root/modules/core/classes/validators/QuestionValidators.js';
import {GetHeatMapQuery} from '#root/modules/core/classes/validators/DashboardValidators.js';
import {getReviewerQueuePosition} from '#root/utils/getReviewerQueuePosition.js';
import {ExpertReviewLevelDto} from '#root/modules/core/classes/validators/UserValidators.js';
import {IReviewWiseStats} from '#root/utils/getDailyStats.js';

export class QuestionSubmissionRepository
  implements IQuestionSubmissionRepository
{
  private QuestionSubmissionCollection: Collection<IQuestionSubmission>;
  private ReRouteCollection: Collection<IReroute>;
  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.QuestionSubmissionCollection =
      await this.db.getCollection<IQuestionSubmission>('question_submissions');
      this.ReRouteCollection = await this.db.getCollection<IReroute>('reroute');
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
        {session},
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to get submission by questionId: ${error}`,
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
      return {...submission, _id: result.insertedId};
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
        {questionId: new ObjectId(questionId)},
        {$push: {queue: {$each: expertIds}}},
        {session, returnDocument: 'after'},
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
        {questionId: new ObjectId(questionId)},
        {
          $pull: {
            queue: new ObjectId(expertId),
            history: {updatedBy: new ObjectId(expertId)},
          },
        },
        {session},
      );
      if (result.matchedCount === 0) {
        throw new InternalServerError(
          `No submission found for questionId: ${questionId}`,
        );
      }

      if (shouldCreateNextHistoryEntry) {
        await this.QuestionSubmissionCollection.updateOne(
          {questionId: new ObjectId(questionId)},
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
          {session},
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
        {questionId: new ObjectId(questionId)},
        {$set: {queue}},
        {session, returnDocument: 'after'},
      );
    } catch (error) {
      throw new InternalServerError(`Error while updating queue: ${error}`);
    }
  }

  async update(
    questionId: string,
    userSubmissionData: ISubmissionHistory,
    session?: ClientSession,
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

      const result = await this.QuestionSubmissionCollection.updateOne(
        {questionId: new ObjectId(questionId)},
        updateDoc,
        {session},
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

      const submission = await this.getByQuestionId(questionId, session);

      if (!submission) {
        throw new NotFoundError(
          `Failed to find submission while updating history!`,
        );
      }

      const submissionHistory = submission.history || [];

      if (submissionHistory.length === 0) {
        throw new BadRequestError(`No history found to update!`);
      }

      const updatedHistory = [...submissionHistory];

      const indexToUpdate = updatedHistory.findIndex(
        history => history.updatedBy.toString() === userId,
      );

      if (indexToUpdate === -1) {
        throw new BadRequestError(
          `No matching history found for userId: ${userId}`,
        );
      }

      updatedHistory[indexToUpdate] = {
        ...updatedHistory[indexToUpdate],
        ...updatedDoc,
        updatedAt: new Date(),
      };

      await this.QuestionSubmissionCollection.updateOne(
        {questionId: new ObjectId(questionId)},
        {$set: {history: updatedHistory}},
        {session},
      );
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
          {$match: {questionId: new ObjectId(questionId)}},
          {$unwind: '$history'},
          {$sort: {'history.createdAt': -1}},
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
                    reviewAnswer: {$arrayElemAt: ['$reviewAnswerData', 0]},
                  },
                },
              ],
            },
          },
          {
            $project: {
              _id: 0,
              updatedBy: {$arrayElemAt: ['$updatedByUser', 0]},
              answer: {$arrayElemAt: ['$answerData', 0]},
              review: {$arrayElemAt: ['$reviewData', 0]},
              lastModifiedBy: {$arrayElemAt: ['$lastModifiedByUser', 0]},
              'history.status': 1,
              'history.reasonForRejection': 1,
              'history.approvedAnswer': 1,
              'history.modifiedAnswer': 1,
              'history.reasonForLastModification': 1,
              'history.createdAt': 1,
              'history.updatedAt': 1,
            },
          },
        ],
        {session},
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
            : {_id: '', userName: '', email: ''},

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
            : {_id: '', userName: '', email: ''},

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
        {questionId: new ObjectId(questionId)},
        {session},
      );
    } catch (error) {
      throw new InternalServerError(`Failed to update submission: ${error}`);
    }
  }

  async heatMapResultsForReviewer(
    query: GetHeatMapQuery,
  ): Promise<IReviewerHeatmapRow[] | null> {
    try {
      await this.init();

      let {startTime, endTime} = query;

      const matchConditions: any = {
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
      }

      const pipeline = [
        {$unwind: '$history'},

        {
          $match: matchConditions,
        },

        {
          $addFields: {
            turnaroundHours: {
              $divide: [
                {$subtract: ['$history.updatedAt', '$createdAt']},
                1000 * 60 * 60,
              ],
            },
          },
        },

        // ✅ ONE-HOUR BUCKET INTERVALS
        {
          $addFields: {
            timeRange: {
              $switch: {
                branches: [
                  {case: {$lt: ['$turnaroundHours', 1]}, then: '0_1'},
                  {case: {$lt: ['$turnaroundHours', 2]}, then: '1_2'},
                  {case: {$lt: ['$turnaroundHours', 3]}, then: '2_3'},
                  {case: {$lt: ['$turnaroundHours', 4]}, then: '3_4'},
                  {case: {$lt: ['$turnaroundHours', 5]}, then: '4_5'},
                  {case: {$lt: ['$turnaroundHours', 6]}, then: '5_6'},
                  {case: {$lt: ['$turnaroundHours', 7]}, then: '6_7'},
                  {case: {$lt: ['$turnaroundHours', 8]}, then: '7_8'},
                  {case: {$lt: ['$turnaroundHours', 9]}, then: '8_9'},
                  {case: {$lt: ['$turnaroundHours', 10]}, then: '9_10'},
                  {case: {$lt: ['$turnaroundHours', 11]}, then: '10_11'},
                  {case: {$lt: ['$turnaroundHours', 12]}, then: '11_12'},
                ],
                default: '12_plus',
              },
            },
          },
        },

        {
          $group: {
            _id: {reviewerId: '$history.updatedBy', timeRange: '$timeRange'},
            count: {$sum: 1},
          },
        },
        {
          $group: {
            _id: '$_id.reviewerId',
            counts: {$push: {k: '$_id.timeRange', v: '$count'}},
          },
        },
        {
          $project: {
            reviewerId: '$_id',
            counts: {$arrayToObject: '$counts'},
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'reviewerId',
            foreignField: '_id',
            as: 'reviewer',
          },
        },
        {$unwind: '$reviewer'},
        {
          $project: {
            _id: 0,
            reviewerId: {$toString: '$reviewerId'},
            reviewerName: {
              $trim: {
                input: {
                  $concat: [
                    {$ifNull: ['$reviewer.firstName', '']},
                    {
                      $cond: [
                        {$ifNull: ['$reviewer.lastName', false]},
                        {$concat: [' ', '$reviewer.lastName']},
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
      ];

      const result = await this.QuestionSubmissionCollection.aggregate(
        pipeline,
      ).toArray();

      return result.length ? (result as IReviewerHeatmapRow[]) : null;
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
          activityType: {$literal: 'history'},
        },
      },
  
      // Only count valid actions
      {$match: {action: {$in: ['author', 'approved', 'rejected', 'modified']}}},
  
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
              {$toString: '$_id'},
              '_history_',
              {$toString: '$historyIndex'},
            ],
          },
          activityType: 1,
          action: 1,
          mainDate: 1,
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
    ];
  
    // Get history activities
    const historyActivities = await this.QuestionSubmissionCollection.aggregate(
      pipeline,
      {session},
    ).toArray();
  
    // Get reroute activities from separate collection
    // Get reroute activities from separate collection
    const reroutePipeline: any[] = [
      {
        $match: selectedHistoryId
          ? {questionId: new ObjectId(selectedHistoryId)}
          : {},
      },
  
      // Unwind reroutes array
      {
        $unwind: {
          path: '$reroutes',
          includeArrayIndex: 'rerouteIndex',
        },
      },
  
      // Match user as reroutedTo
      {$match: {'reroutes.reroutedTo': userObjId}},
  
      // Lookup the main answer (answerId in reroute)
      {
        $lookup: {
          from: 'answers',
          localField: 'reroutes.answerId',
          foreignField: '_id',
          as: 'rerouteAnswerDoc',
        },
      },
      {$unwind: {path: '$rerouteAnswerDoc', preserveNullAndEmptyArrays: true}},
  
      // Lookup question
      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'questionDoc',
        },
      },
      {$unwind: {path: '$questionDoc', preserveNullAndEmptyArrays: true}},
  
      // Lookup all answer details from answers collection
      {
        $lookup: {
          from: 'answers',
          let: {aId: '$reroutes.answerId'},
          pipeline: [
            {
              $match: {
                $expr: {$eq: ['$_id', '$aId']},
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
      {$unwind: {path: '$answerDetails', preserveNullAndEmptyArrays: true}},
  
      // Lookup rejected answer details if exists
      {
        $lookup: {
          from: 'answers',
          localField: 'reroutes.answerId',
          foreignField: '_id',
          as: 'rejectedAnswerDoc',
        },
      },
      {$unwind: {path: '$rejectedAnswerDoc', preserveNullAndEmptyArrays: true}},
  
      // Lookup modified answer details if exists
      {
        $lookup: {
          from: 'answers',
          localField: 'reroutes.answerId',
          foreignField: '_id',
          as: 'modifiedAnswerDoc',
        },
      },
      {$unwind: {path: '$modifiedAnswerDoc', preserveNullAndEmptyArrays: true}},
  
      // Lookup approved answer details if exists
      {
        $lookup: {
          from: 'answers',
          localField: 'reroutes.answerId',
          foreignField: '_id',
          as: 'approvedAnswerDoc',
        },
      },
      {$unwind: {path: '$approvedAnswerDoc', preserveNullAndEmptyArrays: true}},
  
      // Map reroute status to action
      {
        $addFields: {
          action: {
            $switch: {
              branches: [
                {case: {$eq: ['$reroutes.status', 'expert_completed']}, then: 'reroute_completed'},
               // {case: {$eq: ['$reroutes.status', 'rejected']}, then: 'reroute_rejected'},
                {case: {$eq: ['$reroutes.status', 'modified']}, then: 'reroute_modified'},
                {case: {$eq: ['$reroutes.status', 'expert_rejected']}, then: 'expert_rejected'},
                {case: {$eq: ['$reroutes.status', 'pending']}, then: 'reroute_pending'},
                {case: {$eq: ['$reroutes.status', 'approved']}, then: 'reroute_approved'},
                {case: {$eq: ['$reroutes.status', 'moderator_rejected']}, then: 'moderator_rejected'},
                {case: {$eq: ['$reroutes.status', 'rejected']}, then: 'reroute_created_answer'}
              ],
              default: 'reroute_assigned',
            },
          },
          activityType: {$literal: 'reroute'},
          mainDate: {$ifNull: ['$reroutes.updatedAt', '$reroutes.reroutedAt']},
        },
      },
  
      {
        $project: {
          _id: {
            $concat: [
              {$toString: '$_id'},
              '_reroute_',
              {$toString: '$rerouteIndex'},
            ],
          },
          activityType: 1,
          action: 1,
          mainDate: 1,
          createdAt: '$reroutes.reroutedAt',
          updatedAt: '$reroutes.updatedAt',
          rerouteStatus: '$reroutes.status',
          comment: '$reroutes.comment',
          rejectionReason: '$reroutes.rejectionReason',
          reroutedBy: '$reroutes.reroutedBy',
          question: {
            _id: {$toString: '$questionDoc._id'},
            question: '$questionDoc.question',
          },
          // For expert_rejected status, only send the main answer
          answer: {
            $cond: {
              if: {$eq: ['$reroutes.status', 'expert_rejected']},
              then: {
                _id: {$toString: '$rerouteAnswerDoc._id'},
                answer: '$rerouteAnswerDoc.answer',
              },
              else: {
                _id: {$toString: '$rerouteAnswerDoc._id'},
                answer: '$rerouteAnswerDoc.answer',
              },
            },
          },
          // Include rejected answer details for rejected status
          rejectedAnswer: {
            $cond: {
              if: {
                $and: [
                  {$eq: ['$reroutes.status', 'rejected']},
                  {$ne: ['$rejectedAnswerDoc', null]},
                ],
              },
              then: {
                _id: {$toString: '$rejectedAnswerDoc._id'},
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
                  {$eq: ['$reroutes.status', 'modified']},
                  {$ne: ['$modifiedAnswerDoc', null]},
                ],
              },
              then: {
                _id: {$toString: '$modifiedAnswerDoc._id'},
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
                      {$eq: ['$reroutes.status', 'expert_completed']},
                      {$eq: ['$reroutes.status', 'approved']},
                    ],
                  },
                  {$ne: ['$approvedAnswerDoc', null]},
                ],
              },
              then: {
                _id: {$toString: '$approvedAnswerDoc._id'},
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
      {session},
    ).toArray();
  
    // Combine both arrays
    const combinedActivities = [...historyActivities, ...rerouteActivities];
  
    // Apply date filter
    const filteredActivities = dateFilter && Object.keys(dateFilter).length > 0
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
    if(selectedHistoryId)
    {
      paginatedData=filteredActivities.filter((ele)=>ele.rerouteStatus==="moderator_rejected").slice(0,1)
      totalCount=1
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
    let {userId, startTime, endTime} = query;
    const reviewerId = new ObjectId(userId);
    const pipeline = [
      // 1) Safe fields
      {
        $addFields: {
          queueIndex: {$indexOfArray: ['$queue', reviewerId]},
          historyArr: {$ifNull: ['$history', []]},
        },
      },

      // 2) Compute history length
      {
        $addFields: {
          historyLen: {$size: '$historyArr'},
        },
      },

      // 3) Slice history excluding 0th index
      {
        $addFields: {
          historyExceptFirst: {
            $cond: [
              {$gt: ['$historyLen', 1]},
              {$slice: ['$historyArr', 1, {$subtract: ['$historyLen', 1]}]},
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
                        {$eq: ['$$h.updatedBy', reviewerId]},
                        {$eq: ['$$h.status', 'in-review']},
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
            $and: [{$eq: ['$queueIndex', 0]}, {$eq: ['$historyLen', 0]}],
          },
          computedLevel: {
            $cond: [
              {
                $and: [
                  {$eq: ['$hasInReviewEntry', true]},
                  {$gt: ['$historyLen', 1]},
                ],
              },
              {
                $concat: [
                  'Level ',
                  {$toString: {$subtract: ['$historyLen', 1]}},
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
            $cond: [{$eq: ['$isAuthor', true]}, 'Author', '$computedLevel'],
          },
        },
      },

      // 7) Keep only documents with Review_level
      {$match: {Review_level: {$ne: null}}},

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
          isInReview: {$eq: ['$questionDetails.status', 'in-review']},
          isDelayed: {$eq: ['$questionDetails.status', 'delayed']},
        },
      },

      // 11) Group counts by level with status breakdown
      {
        $group: {
          _id: '$Review_level',
          count: {$sum: 1},
          inReview: {
            $sum: {
              $cond: [{$eq: ['$isInReview', true]}, 1, 0],
            },
          },
          delayed: {
            $sum: {
              $cond: [{$eq: ['$isDelayed', true]}, 1, 0],
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
                            input: {$ifNull: ['$actual', []]},
                            cond: {$eq: ['$$this.Review_level', '$$lvl']},
                          },
                        },
                      },
                    },
                    in: {$ifNull: ['$$found.count', 0]},
                  },
                },
                inReview: {
                  $let: {
                    vars: {
                      found: {
                        $first: {
                          $filter: {
                            input: {$ifNull: ['$actual', []]},
                            cond: {$eq: ['$$this.Review_level', '$$lvl']},
                          },
                        },
                      },
                    },
                    in: {$ifNull: ['$$found.inReview', 0]},
                  },
                },
                delayed: {
                  $let: {
                    vars: {
                      found: {
                        $first: {
                          $filter: {
                            input: {$ifNull: ['$actual', []]},
                            cond: {$eq: ['$$this.Review_level', '$$lvl']},
                          },
                        },
                      },
                    },
                    in: {$ifNull: ['$$found.delayed', 0]},
                  },
                },
              },
            },
          },
        },
      },

      {$unwind: '$merged'},
      {$replaceRoot: {newRoot: '$merged'}},

      // Optional: ensure Author comes first
      {$sort: {Review_level: 1}},
    ];
    console.log(startTime, endTime);
    const start = startTime ? new Date(`${startTime}T00:00:00.000Z`) : null;

    const end = endTime ? new Date(`${endTime}T23:59:59.999Z`) : null;
    const pipe = [
      {
        $addFields: {
          history: {
            $filter: {
              input: '$history',
              as: 'h',
              cond: {
                $and: [
                  ...(start ? [{$gte: ['$$h.updatedAt', start]}] : []),
                  ...(end ? [{$lte: ['$$h.updatedAt', end]}] : []),
                ],
              },
            },
          },
        },
      },
      {$match: {history: {$ne: []}}},
      // 1) Ensure history exists
      {
        $addFields: {
          historyArr: {$ifNull: ['$history', []]},
          historyLen: {$size: {$ifNull: ['$history', []]}},
        },
      },

      // 2) Check if reviewer is Author (history[0])
      {
        $addFields: {
          isAuthor: {
            $and: [
              {$gt: ['$historyLen', 0]},
              {$eq: [{$arrayElemAt: ['$historyArr.updatedBy', 0]}, reviewerId]},
            ],
          },
        },
      },

      // 3) Map history[1..] with index
      {
        $addFields: {
          completedEntriesWithIndex: {
            $map: {
              input: {$range: [1, {$size: '$historyArr'}]}, // indices 1..N
              as: 'i',
              in: {
                index: '$$i',
                entry: {$arrayElemAt: ['$historyArr', '$$i']},
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
                  {$eq: ['$$x.entry.updatedBy', reviewerId]},
                  {$ne: ['$$x.entry.status', 'in-review']},
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
              {$arrayElemAt: ['$historyArr', 0]},
              {$arrayElemAt: ['$completedEntriesWithIndex.entry', 0]},
            ],
          },
        },
      },

      // 6) Determine Review_level with Level number starting from 1
      {
        $addFields: {
          Review_level: {
            $cond: [
              {$eq: ['$isAuthor', true]},
              'Author',
              {
                $cond: [
                  {$gt: [{$size: '$completedEntriesWithIndex'}, 0]},
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
            $cond: [{$ifNull: ['$reviewEntry.approvedAnswer', false]}, 1, 0],
          },
          rejectedCount: {
            $cond: [{$ifNull: ['$reviewEntry.rejectedAnswer', false]}, 1, 0],
          },
          modifiedCount: {
            $cond: [{$ifNull: ['$reviewEntry.modifiedAnswer', false]}, 1, 0],
          },
        },
      },

      // 8) Keep only documents with Review_level
      {$match: {Review_level: {$ne: null}}},

      // 9) Group counts by Review_level
      {
        $group: {
          _id: '$Review_level',
          count: {$sum: 1},
          approvedCount: {$sum: '$approvedCount'},
          rejectedCount: {$sum: '$rejectedCount'},
          modifiedCount: {$sum: '$modifiedCount'},
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
                            input: {$ifNull: ['$actual', []]},
                            cond: {$eq: ['$$this.Review_level', '$$lvl']},
                          },
                        },
                      },
                    },
                    in: {$ifNull: ['$$found.count', 0]},
                  },
                },
                approvedCount: {
                  $cond: [
                    {$eq: ['$$lvl', 'Author']},
                    0,
                    {
                      $let: {
                        vars: {
                          found: {
                            $first: {
                              $filter: {
                                input: {$ifNull: ['$actual', []]},
                                cond: {$eq: ['$$this.Review_level', '$$lvl']},
                              },
                            },
                          },
                        },
                        in: {$ifNull: ['$$found.approvedCount', 0]},
                      },
                    },
                  ],
                },
                rejectedCount: {
                  $cond: [
                    {$eq: ['$$lvl', 'Author']},
                    0,
                    {
                      $let: {
                        vars: {
                          found: {
                            $first: {
                              $filter: {
                                input: {$ifNull: ['$actual', []]},
                                cond: {$eq: ['$$this.Review_level', '$$lvl']},
                              },
                            },
                          },
                        },
                        in: {$ifNull: ['$$found.rejectedCount', 0]},
                      },
                    },
                  ],
                },
                modifiedCount: {
                  $cond: [
                    {$eq: ['$$lvl', 'Author']},
                    0,
                    {
                      $let: {
                        vars: {
                          found: {
                            $first: {
                              $filter: {
                                input: {$ifNull: ['$actual', []]},
                                cond: {$eq: ['$$this.Review_level', '$$lvl']},
                              },
                            },
                          },
                        },
                        in: {$ifNull: ['$$found.modifiedCount', 0]},
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
      {$unwind: '$merged'},
      {$replaceRoot: {newRoot: '$merged'}},

      // 13) Sort Author first, then Levels numerically
      {
        $addFields: {
          levelSort: {
            $cond: [
              {$eq: ['$Review_level', 'Author']},
              0,
              {$toInt: {$substr: ['$Review_level', 6, -1]}},
            ],
          },
        },
      },
      {$sort: {levelSort: 1}},
      {$project: {levelSort: 0}},
    ];

    let pending = await this.QuestionSubmissionCollection.aggregate(
      pipeline,
    ).toArray();
    let completed = await this.QuestionSubmissionCollection.aggregate(
      pipe,
    ).toArray();
    if (pending.length == 0) {
      pending = [
        {Review_level: 'Author', count: 0},
        {Review_level: 'Level 1', count: 0},
        {Review_level: 'Level 2', count: 0},
        {Review_level: 'Level 3', count: 0},
        {Review_level: 'Level 4', count: 0},
        {Review_level: 'Level 5', count: 0},
        {Review_level: 'Level 6', count: 0},
        {Review_level: 'Level 7', count: 0},
        {Review_level: 'Level 8', count: 0},
        {Review_level: 'Level 9', count: 0},
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

    return merged;
  }

  async getReviewWiseCount(): Promise<IReviewWiseStats> {
    await this.init();
    const [result] =
      await this.QuestionSubmissionCollection.aggregate<IReviewWiseStats>([
        {
          $addFields: {
            historyLength: {$size: '$history'},
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

        {$unwind: '$question'},

        {
          $group: {
            _id: null,

            authorLevel: {
              $sum: {$cond: [{$gte: ['$historyLength', 1]}, 1, 0]},
            },

            levelOne: {
              $sum: {$cond: [{$gte: ['$historyLength', 3]}, 1, 0]},
            },

            levelTwo: {
              $sum: {$cond: [{$gte: ['$historyLength', 4]}, 1, 0]},
            },

            levelThree: {
              $sum: {$cond: [{$gte: ['$historyLength', 5]}, 1, 0]},
            },

            levelFour: {
              $sum: {$cond: [{$gte: ['$historyLength', 6]}, 1, 0]},
            },

            levelFive: {
              $sum: {$cond: [{$gte: ['$historyLength', 7]}, 1, 0]},
            },

            levelSix: {
              $sum: {$cond: [{$gte: ['$historyLength', 8]}, 1, 0]},
            },

            levelSeven: {
              $sum: {$cond: [{$gte: ['$historyLength', 9]}, 1, 0]},
            },

            levelEight: {
              $sum: {$cond: [{$gte: ['$historyLength', 10]}, 1, 0]},
            },

            levelNineEligible: {
              $sum: {
                $cond: [{$gte: ['$historyLength', 10]}, 1, 0],
              },
            },

            levelNineInReview: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {$gte: ['$historyLength', 10]},
                      {$eq: ['$question.status', 'in-review']},
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
}
