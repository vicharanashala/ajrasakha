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

//   async getUserActivityHistory(
//     userId: string,
//     page = 1,
//     limit = 20
//   ): Promise<any> {
//     await this.init()
//     const userObjId = new ObjectId(userId);
//     const safePage = Math.max(1, Math.floor(page));
//     const safeLimit = Math.max(1, Math.floor(limit));
//     const skip = (safePage - 1) * safeLimit;

//     // Build aggregation
//     const pipeline: any[] = [
//       // Only submissions that have at least one history updated by this user
//       {
//         $match: {
//           "history.updatedBy": userObjId
//         }
//       },

//       // unwind history entries and keep index so we can detect first entry (author)
//       {
//         $unwind: {
//           path: "$history",
//           includeArrayIndex: "historyIndex"
//         }
//       },

//       // only keep entries that were updatedBy this user
//       {
//         $match: {
//           "history.updatedBy": userObjId
//         }
//       },

//       // sort by history.createdAt descending so newest actions appear first
//       {
//         $sort: {
//           "history.createdAt": -1
//         }
//       },

//       // Use facet so we can get totalCount and paginated data in one go
//       {
//         $facet: {
//           data: [
//             { $skip: skip },
//             { $limit: safeLimit },

//             // Lookup review (if any)
//             {
//               $lookup: {
//                 from: 'reviews',
//                 localField: "history.reviewId",
//                 foreignField: "_id",
//                 as: "reviewDoc"
//               }
//             },
//             { $unwind: { path: "$reviewDoc", preserveNullAndEmptyArrays: true } },

//             // Lookup answer referenced by this history entry (history.answer)
//             {
//               $lookup: {
//                 from: 'answers',
//                 localField: "history.answer",
//                 foreignField: "_id",
//                 as: "answerDoc"
//               }
//             },
//             { $unwind: { path: "$answerDoc", preserveNullAndEmptyArrays: true } },

//             // Lookup rejectedAnswer (if any)
//             {
//               $lookup: {
//                 from:"answers",
//                 localField: "history.rejectedAnswer",
//                 foreignField: "_id",
//                 as: "rejectedAnswerDoc"
//               }
//             },
//             { $unwind: { path: "$rejectedAnswerDoc", preserveNullAndEmptyArrays: true } },

//             // Lookup modifiedAnswer (if any) - optional
//             {
//               $lookup: {
//                 from: "answers",
//                 localField: "history.modifiedAnswer",
//                 foreignField: "_id",
//                 as: "modifiedAnswerDoc"
//               }
//             },
//             { $unwind: { path: "$modifiedAnswerDoc", preserveNullAndEmptyArrays: true } },

//             // Lookup approvedAnswer (if any)
//             {
//               $lookup: {
//                 from: 'answers',
//                 localField: "history.approvedAnswer",
//                 foreignField: "_id",
//                 as: "approvedAnswerDoc"
//               }
//             },
//             { $unwind: { path: "$approvedAnswerDoc", preserveNullAndEmptyArrays: true } },

//             // Lookup question details using the parent document's questionId
//             {
//               $lookup: {
//                 from:'questions',
//                 localField: "questionId",
//                 foreignField: "_id",
//                 as: "questionDoc"
//               }
//             },
//             { $unwind: { path: "$questionDoc", preserveNullAndEmptyArrays: true } },

//             // Build final action mapping and project into desired shape
//             // {
//             //   $addFields: {
//             //     isAuthor: {
//             //       // author if this was the first history entry (index === 0)
//             //       $eq: ["$historyIndex", 0]
//             //     }
//             //   }
//             // },

//             {
//   $addFields: {
//     isAuthor: {
//       $and: [
//         { $eq: ["$historyIndex", 0] },
//         {
//           $eq: [
//             "$answerDoc.authorId",
//             userObjId
//           ]
//         }
//       ]
//     }
//   }
// },

//             {
//               $addFields: {
//                 action: {
//                   $switch: {
//                     branches: [
//                       { case: { $eq: ["$isAuthor", true] }, then: "author" },
//                       // prefer explicit review.action if exists
//                       { case: { $eq: ["$reviewDoc.action", "accepted"] }, then: "approved" },
//                       { case: { $eq: ["$reviewDoc.action", "rejected"] }, then: "rejected" },
//                       { case: { $eq: ["$reviewDoc.action", "modified"] }, then: "modify" },
//                       // fallback to history.status
//                       { case: { $eq: ["$history.status", "approved"] }, then: "approved" },
//                       { case: { $eq: ["$history.status", "rejected"] }, then: "rejected" },
//                       { case: { $eq: ["$history.status", "in-review"] }, then: "created" }
//                     ],
//                     default: "created"
//                   }
//                 }
//               }
//             },

//             {
//               $project: {
//                 // unique id for this history entry: submissionId_index (string)
//                 _id: {
//                   $concat: [{ $toString: "$_id" }, "_", { $toString: "$historyIndex" }]
//                 },
//                 // keep timestamps from the history entry
//                 // createdAt: "$history.createdAt",
//                 // updatedAt: "$history.updatedAt",

//                 createdAt: {
//   $ifNull: ["$history.createdAt", "$history.createdAt"]
// },
// updatedAt: {
//   $ifNull: ["$history.updatedAt", "$history.updatedAt"]
// },

//                 action: 1,
//                 reviewType: "$reviewDoc.reviewType",
//                 reason: "$history.reasonForRejection", // or "$reviewDoc.reason" if review stores reason
//                 remarks: "$answerDoc.remarks",

//                 review: {
//                   parameters: "$reviewDoc.parameters",
//                   action: "$reviewDoc.action",
//                   reason: "$reviewDoc.reason"
//                 },

//                 question: {
//                   _id: "$questionDoc._id",
//                   question: "$questionDoc.question"
//                 },

//                 // answers: prefer the most relevant field from history
//                 answer: {
//                   _id: "$answerDoc._id",
//                   answer: "$answerDoc.answer"
//                 },

//                 rejectedAnswer: {
//                   _id: "$rejectedAnswerDoc._id",
//                   answer: "$rejectedAnswerDoc.answer"
//                 },

//                 modifiedAnswer: {
//                   _id: "$modifiedAnswerDoc._id",
//                   answer: "$modifiedAnswerDoc.answer"
//                 },

//                 approvedAnswer: {
//                   _id: "$approvedAnswerDoc._id",
//                   answer: "$approvedAnswerDoc.answer"
//                 },

//                 // raw fields if needed
//                 raw: {
//                   submissionId: "$_id",
//                   historyIndex: "$historyIndex",
//                   historyStatus: "$history.status",
//                   historyUpdatedBy: "$history.updatedBy",
//                   reviewId: "$history.reviewId"
//                 }
//               }
//             }
//           ],

//           // count total matched entries (for pagination)
//           totalCount: [{ $count: "count" }]
//         }
//       },

//       // unwind the totalCount result to a single number (or default to 0)
//       {
//         $unwind: {
//           path: "$totalCount",
//           preserveNullAndEmptyArrays: true
//         }
//       },

//       // reshape to have totalCount and data at root
//       {
//         $project: {
//           data: 1,
//           totalCount: { $ifNull: ["$totalCount.count", 0] }
//         }
//       }
//     ];

//     // Run aggregation
//     const [aggResult] = await this.QuestionSubmissionCollection
//       .aggregate(pipeline)
//       .toArray()
//       // aggregation always returns array; if empty use defaults
//       .catch((err: any) => {
//         throw err;
//       });

//     const totalCount = (aggResult && aggResult.totalCount) || 0;
//     const rawData = (aggResult && aggResult.data) || [];

//     // Convert any ObjectId to string recursively
//     const stringifyIds = (v: any): any => {
//       if (v === null || v === undefined) return v;
//       if (v instanceof ObjectId) return v.toString();
//       if (Array.isArray(v)) return v.map(stringifyIds);
//       if (typeof v === "object") {
//         const o: any = {};
//         for (const [k, val] of Object.entries(v)) {
//           o[k] = stringifyIds(val);
//         }
//         return o;
//       }
//       return v;
//     };

//     const data = rawData.map(stringifyIds);

//     const totalPages = Math.ceil(totalCount / safeLimit);

//     return {
//       totalCount,
//       page: safePage,
//       totalPages,
//       limit: safeLimit,
//       data
//     };
//   }




async getUserActivityHistory(
  userId: string,
  page = 1,
  limit = 20
): Promise<any> {
  await this.init();
  const userObjId = new ObjectId(userId);
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.max(1, Math.floor(limit));
  const skip = (safePage - 1) * safeLimit;

  const pipeline = [
    // Narrow documents to those that contain at least one history updated by user
    {
      $match: {
        "history.updatedBy": userObjId
      }
    },

    // Expand history array into individual documents and keep index
    {
      $unwind: {
        path: "$history",
        includeArrayIndex: "historyIndex"
      }
    },

    // Keep only the history entries updated by the user
    {
      $match: {
        "history.updatedBy": userObjId
      }
    },

    // Capture timestamps from the history entry immediately so they never get lost/overwritten
    {
      $addFields: {
        historyCreatedAt: "$history.createdAt",
        historyUpdatedAt: "$history.updatedAt"
      }
    },

    // Sort by the history timestamp (latest first)
    {
      $sort: {
        historyCreatedAt: -1
      }
    },

    // Use facet: one branch for data (with pagination) and one branch for counting
    {
      $facet: {
        filtered: [
          // pagination
          { $skip: skip },
          { $limit: safeLimit },

          // lookups
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

          // Author detection: first history entry for the submission AND the user is the answer author
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

          // Action mapping (NO default). If none match, action will be null and filtered out next.
          {
            $addFields: {
              action: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$isAuthor", true] }, then: "author" },
                    { case: { $eq: ["$reviewDoc.action", "accepted"] }, then: "approved" },
                    { case: { $eq: ["$reviewDoc.action", "rejected"] }, then: "rejected" },
                    { case: { $eq: ["$reviewDoc.action", "modified"] }, then: "modify" }
                  ],
                  default: null
                }
              }
            }
          },

          // Keep only the allowed actions
          {
            $match: {
              action: { $in: ["author", "approved", "rejected", "modify"] }
            }
          },

          // Final project shape
          {
            $project: {
              _id: {
                $concat: [{ $toString: "$_id" }, "_", { $toString: "$historyIndex" }]
              },
              action: 1,
              createdAt: "$historyCreatedAt",
              updatedAt: "$historyUpdatedAt",
              reviewType: "$reviewDoc.reviewType",
              // prefer review reason, fallback to history rejection reason
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
                _id: "$questionDoc._id",
                question: "$questionDoc.question"
              },
              answer: {
                _id: "$answerDoc._id",
                answer: "$answerDoc.answer"
              },
              rejectedAnswer: {
                _id: "$rejectedAnswerDoc._id",
                answer: "$rejectedAnswerDoc.answer"
              },
              modifiedAnswer: {
                _id: "$modifiedAnswerDoc._id",
                answer: "$modifiedAnswerDoc.answer"
              },
              approvedAnswer: {
                _id: "$approvedAnswerDoc._id",
                answer: "$approvedAnswerDoc.answer"
              }
            }
          }
        ],

        // For totalCount we must perform the same lookup+action detection but without skip/limit
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
                    { case: { $eq: ["$reviewDoc.action", "modified"] }, then: "modify" }
                  ],
                  default: null
                }
              }
            }
          },

          { $match: { action: { $in: ["author", "approved", "rejected", "modify"] } } },
          { $count: "count" }
        ]
      }
    },

    // Normalize facet output
    {
      $project: {
        data: "$filtered",
        totalCount: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] }
      }
    }
  ];

  // Execute pipeline
  const [aggResult] = await this.QuestionSubmissionCollection.aggregate(pipeline).toArray();

  const totalCount = aggResult?.totalCount ?? 0;
  const rawData = aggResult?.data ?? [];

  // Recursively convert ObjectId to string and Date to ISO strings
  const serializeDbValue = (v: any): any => {
    if (v === null || v === undefined) return v;
    // ObjectId -> string
    if (v instanceof ObjectId) return v.toString();
    // Date -> ISO string
    if (v instanceof Date) return v.toISOString();
    // Array -> map
    if (Array.isArray(v)) return v.map(serializeDbValue);
    // Plain object -> recurse
    if (typeof v === "object") {
      const out: any = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = serializeDbValue(val);
      }
      return out;
    }
    // primitive
    return v;
  };

  const data = rawData.map(serializeDbValue);

  return {
    totalCount,
    page: safePage,
    totalPages: Math.ceil(totalCount / safeLimit),
    limit: safeLimit,
    data
  };
}



}