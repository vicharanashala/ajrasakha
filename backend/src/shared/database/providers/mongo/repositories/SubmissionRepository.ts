import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {
  IQuestionSubmission,
  ISubmissionHistory,
  IReviewerHeatmapRow,
  IReview,
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

export class QuestionSubmissionRepository
  implements IQuestionSubmissionRepository
{
  private QuestionSubmissionCollection: Collection<IQuestionSubmission>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.QuestionSubmissionCollection =
      await this.db.getCollection<IQuestionSubmission>('question_submissions');
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

      const populatedHistory: HistoryItem[] = historyData.map(item => {
        const h = item.history;
        const updatedBy = item.updatedBy;
        const answer = item.answer;
        const review = item.review as IReview;
        const lastModifiedBy = item.lastModifiedBy;

        return {
          updatedBy: updatedBy
            ? {
                _id: updatedBy._id.toString(),
                userName: `${updatedBy.firstName} ${updatedBy.lastName}`,
                email: updatedBy.email,
              }
            : {_id: '', userName: '', email: ''},

          lastModifiedBy: lastModifiedBy
            ? {
                _id: lastModifiedBy._id.toString(),
                userName: `${lastModifiedBy.firstName} ${lastModifiedBy.lastName}`,
                email: lastModifiedBy.email,
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
  async heatMapResultsForReviewer(): Promise<IReviewerHeatmapRow[] | null> {
    try {
      await this.init();

      const pipeline = [
        {$unwind: '$history'},

        {
          $match: {
            'history.status': {$in: ['reviewed', 'rejected']},
          },
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

async getUserActivityHistory(
  userId: string,
  page = 1,
  limit = 20,
  dateRange?: { from?: string; to?: string },
  session?:ClientSession
): Promise<any> {
  await this.init();

  const userObjId = new ObjectId(userId);
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.max(1, Math.floor(limit));
  const skip = (safePage - 1) * safeLimit;

  // Parse date range
  const fromDate = dateRange?.from ? new Date(dateRange.from) : null;
  const toDate = dateRange?.to ? new Date(dateRange.to) : null;

  // Build Mongo match object
  const dateFilter: any = {};
  if (fromDate) dateFilter.$gte = fromDate;
  if (toDate) dateFilter.$lte = toDate;

  const pipeline = [
    {
      $match: {
        "history.updatedBy": userObjId
      }
    },

    {
      $unwind: {
        path: "$history",
        includeArrayIndex: "historyIndex"
      }
    },

    {
      $match: {
        "history.updatedBy": userObjId
      }
    },

    {
      $addFields: {
        historyCreatedAt: "$history.createdAt",
        historyUpdatedAt: "$history.updatedAt"
      }
    },

    // ---------------------------
    // NEW DATE RANGE FILTER
    // ---------------------------
    ...(Object.keys(dateFilter).length > 0
      ? [
          {
            $match: {
              historyCreatedAt: dateFilter
            }
          }
        ]
      : []),

    {
      $sort: {
        historyCreatedAt: -1
      }
    },

    {
      $facet: {
        filtered: [
          { $skip: skip },
          { $limit: safeLimit },

          {
            $lookup: {
              from: "reviews",
              localField: "history.reviewId",
              foreignField: "_id",
              as: "reviewDoc"
            }
          },
          { $unwind: { path: "$reviewDoc", preserveNullAndEmptyArrays: true } },

          {
            $lookup: {
              from: "answers",
              localField: "history.answer",
              foreignField: "_id",
              as: "answerDoc"
            }
          },
          { $unwind: { path: "$answerDoc", preserveNullAndEmptyArrays: true } },

          {
            $lookup: {
              from: "answers",
              localField: "history.rejectedAnswer",
              foreignField: "_id",
              as: "rejectedAnswerDoc"
            }
          },
          { $unwind: { path: "$rejectedAnswerDoc", preserveNullAndEmptyArrays: true } },

          {
            $lookup: {
              from: "answers",
              localField: "history.modifiedAnswer",
              foreignField: "_id",
              as: "modifiedAnswerDoc"
            }
          },
          { $unwind: { path: "$modifiedAnswerDoc", preserveNullAndEmptyArrays: true } },

          {
            $lookup: {
              from: "answers",
              localField: "history.approvedAnswer",
              foreignField: "_id",
              as: "approvedAnswerDoc"
            }
          },
          { $unwind: { path: "$approvedAnswerDoc", preserveNullAndEmptyArrays: true } },

          {
            $lookup: {
              from: "questions",
              localField: "questionId",
              foreignField: "_id",
              as: "questionDoc"
            }
          },
          { $unwind: { path: "$questionDoc", preserveNullAndEmptyArrays: true } },

          {
            $addFields: {
              isAuthor: {
                $and: [
                  { $eq: ["$historyIndex", 0] },
                  { $eq: ["$answerDoc.authorId", userObjId] }
                ]
              }
            }
          },

          {
            $addFields: {
              action: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$isAuthor", true] }, then: "author" },
                    { case: { $eq: ["$reviewDoc.action", "accepted"] }, then: "approved" },
                    { case: { $eq: ["$reviewDoc.action", "rejected"] }, then: "rejected" },
                    { case: { $eq: ["$reviewDoc.action", "modified"] }, then: "modified" }
                  ],
                  default: null
                }
              }
            }
          },

          {
            $match: {
              action: { $in: ["author", "approved", "rejected", "modified"] }
            }
          },

          {
            $project: {
              _id: {
                $concat: [{ $toString: "$_id" }, "_", { $toString: "$historyIndex" }]
              },
              action: 1,
              createdAt: "$historyCreatedAt",
              updatedAt: "$historyUpdatedAt",
              reviewType: "$reviewDoc.reviewType",
              reason: { $ifNull: ["$reviewDoc.reason", "$history.reasonForRejection"] },
              remarks: "$answerDoc.remarks",
              review: {
                parameters: "$reviewDoc.parameters",
                action: "$reviewDoc.action",
                reason: "$reviewDoc.reason",
                reviewerId: "$reviewDoc.reviewerId",
                createdAt: "$reviewDoc.createdAt"
              },
              question: {
                // _id: "$questionDoc._id",
                 _id: { $toString: "$questionDoc._id" },
                question: "$questionDoc.question"
              },
              answer: {
                // _id: "$answerDoc._id",
                _id: { $toString: "$answerDoc._id" },
                answer: "$answerDoc.answer"
              },
              rejectedAnswer: {
                // _id: "$rejectedAnswerDoc._id",
                _id: { $toString: "$rejectedAnswerDoc._id" },
                answer: "$rejectedAnswerDoc.answer"
              },
              modifiedAnswer: {
                // _id: "$modifiedAnswerDoc._id",
                _id: { $toString: "$modifiedAnswerDoc._id" },
                answer: "$modifiedAnswerDoc.answer"
              },
              approvedAnswer: {
                // _id: "$approvedAnswerDoc._id",
                _id: { $toString: "$approvedAnswerDoc._id" },
                answer: "$approvedAnswerDoc.answer"
              }
            }
          }
        ],

        totalCount: [
          {
            $lookup: {
              from: "reviews",
              localField: "history.reviewId",
              foreignField: "_id",
              as: "reviewDoc"
            }
          },
          { $unwind: { path: "$reviewDoc", preserveNullAndEmptyArrays: true } },

          {
            $lookup: {
              from: "answers",
              localField: "history.answer",
              foreignField: "_id",
              as: "answerDoc"
            }
          },
          { $unwind: { path: "$answerDoc", preserveNullAndEmptyArrays: true } },

          {
            $addFields: {
              isAuthor: {
                $and: [
                  { $eq: ["$historyIndex", 0] },
                  { $eq: ["$answerDoc.authorId", userObjId] }
                ]
              }
            }
          },

          {
            $addFields: {
              action: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$isAuthor", true] }, then: "author" },
                    { case: { $eq: ["$reviewDoc.action", "accepted"] }, then: "approved" },
                    { case: { $eq: ["$reviewDoc.action", "rejected"] }, then: "rejected" },
                    { case: { $eq: ["$reviewDoc.action", "modified"] }, then: "modified" }
                  ],
                  default: null
                }
              }
            }
          },

          { $match: { action: { $in: ["author", "approved", "rejected", "modified"] } } },

          { $count: "count" }
        ]
      }
    },

    {
      $project: {
        data: "$filtered",
        totalCount: {
          $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0]
        }
      }
    }
  ];

  const [aggResult] = await this.QuestionSubmissionCollection.aggregate(pipeline,{session}).toArray();

  const totalCount = aggResult?.totalCount ?? 0;
  const rawData = aggResult?.data ?? [];

  return {
    totalCount,
    page: safePage,
    totalPages: Math.ceil(totalCount / safeLimit),
    limit: safeLimit,
    data: rawData
  };
}


}