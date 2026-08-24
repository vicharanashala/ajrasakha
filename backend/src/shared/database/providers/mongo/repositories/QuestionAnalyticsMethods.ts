import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
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
import { GLOBAL_TYPES } from '#root/types.js';
import { inject } from 'inversify';
import { ClientSession, Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '../MongoDatabase.js';
import { isValidObjectId } from '#root/utils/isValidObjectId.js';
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
import { getReviewerQueuePosition } from '#root/utils/getReviewerQueuePosition.js';
import {
  QuestionLevelResponse,
  ReviewLevelTimeValue,
} from '#root/modules/question/classes/transformers/QuestionLevel.js';
import { buildQuestionFilter } from '#root/utils/buildQuestionFilter.js';
import {
  AllocatedQuestionsBodyDto,
  DetailedQuestionsBodyDto,
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '#root/modules/question/classes/validators/QuestionVaidators.js';
import { buildReviewTimeline } from '#root/utils/buildReviewTat.js';
import { getShiftFilter } from '#root/utils/date.utils.js';
import {
  QueueQuestionData,
  RawQueueQuestionRow,
} from '#root/modules/question/interfaces/IQuestionService.js';

const VECTOR_INDEX_NAME = 'questions_vector_index';
const EMBEDDING_FIELD = 'embedding';
const VECTOR_NUM_CANDIDATES = 200;
const VECTOR_COUNT_LIMIT = 20000;

import type { QuestionRepository } from './QuestionRepository.js';

/**
 * Analytics / dashboard / metrics query implementations extracted from
 * QuestionRepository. They run with `this` bound to the repository (assigned as
 * instance fields there), so bodies use this.QuestionCollection / this.init() etc.
 */

export async function getYearAnalytics(
  this: QuestionRepository,
    goldenDataSelectedYear: string,
    customStartTime?: string,
    customEndTime?: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<{
    yearData: GoldenDatasetEntry[];
    totalEntriesByType: number;
    totalVerifiedByType: number;
    moderatorBreakdown?: { moderatorName: string; count: number, moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number }[];
    questionSourceBreakdown?: { whatsapp: number; ajrasakha: number };
    questionsAnsweredWithin120Min?: { whatsapp: number; ajrasakha: number };
    averageResponseTime?: { whatsapp: number; ajrasakha: number };
    questionsAnsweredAfter120Min?: { whatsapp: number; ajrasakha: number };
    questionStateBreakdown?: QuestionStateBreakdownBySource;
    paeMetrics?: { assigned: number; submitted: number; closed: number };
  }> {
    await this.init();
    const selectedYearNum = Number(goldenDataSelectedYear);

    const startDate = new Date(selectedYearNum, 0, 1);
    const endDate = new Date(selectedYearNum + 1, 0, 1);

    // Build match condition with optional time filtering
    const matchCondition: any = {
      createdAt: { $gte: startDate, $lt: endDate },
      status: { $ne: 'pass' },
      ...(!isAdmin &&
        (isTrainingUser
          ? { isTrainingQuestion: true }
          : { isTrainingQuestion: { $ne: true } })),
    };

    const closedMatchCondition: any = {
      status: 'closed',
      closedAt: {
        $gte: startDate,
        $lt: endDate,
      },
      ...(!isAdmin &&
        (isTrainingUser
          ? { isTrainingQuestion: true }
          : { isTrainingQuestion: { $ne: true } })),
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
            _id: { month: { $month: '$createdAt' } },
            totalEntries: { $sum: 1 },
            totalVerified: {
              $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] },
            },
          },
        },
        { $sort: { '_id.month': 1 } },
      ],
      { session },
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
      { length: 12 },
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
    const { moderatorBreakdown } = await this.getTodayApproved(
      isTrainingUser,
      isAdmin,
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
      isTrainingUser,
      isAdmin
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

export async function getTodayApproved(
  this: QuestionRepository,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    todayApproved: number;
    moderatorBreakdown?: { moderatorName: string; count: number; closedCount?: number; dynamicClosedCount?: number; duplicateClosedCount?: number; moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number }[];
  }> {
    await this.init();

    let start = startDate;
    let end = endDate;
    const now = new Date();

    if (!start || !end) {
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    }

    // Get moderator breakdown
    const moderatorBreakdown = (await this.QuestionCollection.aggregate(
      [
        // Start from CLOSED questions, NOT answers. The old answer-first pipeline
        // counted orphaned final answers whose question was deleted (question got
        // deleted but the answer didn't), inflating the counts. Starting from the
        // questions collection means a deleted question simply can't be counted.
        {
          $match: {
            closedAt: { $gte: start, $lt: end },
            status: { $in: ['closed', 'dynamic_closed', 'duplicate_closed'] },
            ...(!isAdmin &&
              (isTrainingUser
                ? { isTrainingQuestion: true }
                : { isTrainingQuestion: { $ne: true } })),
          },
        },

        // Look up this question's FINAL answer and its approver — the person who
        // closed it, moderator OR auditor. Take the most recent one so each closed
        // question is credited exactly once.
        {
          $lookup: {
            from: 'answers',
            let: { qid: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$questionId', '$$qid'] },
                      { $eq: ['$isFinalAnswer', true] },
                    ],
                  },
                  approvedBy: { $exists: true, $ne: null },
                },
              },
              { $sort: { updatedAt: -1 } },
              { $limit: 1 },
            ],
            as: 'finalAnswer',
          },
        },

        // Drop closed questions with no final answer / no approver.
        {
          $unwind: {
            path: '$finalAnswer',
            preserveNullAndEmptyArrays: false,
          },
        },

        // Group by the approver (from the final answer), with per-close-status counts.
        {
          $group: {
            _id: '$finalAnswer.approvedBy',
            count: { $sum: 1 },
            closedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] },
            },
            dynamicClosedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'dynamic_closed'] }, 1, 0] },
            },
            duplicateClosedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'duplicate_closed'] }, 1, 0] },
            },
          },
        },

        // Lookup moderator details
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

        // Lookup moderator role history
        {
          $lookup: {
            from: 'user_role_history',
            let: {
              moderatorId: '$_id',
              reportStart: start,
              reportEnd: end,
              currentTime: now,
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$userId', '$$moderatorId'] },
                      {
                        $in: ['$role', ['moderator', 'auditor', 'gate_keeper']],
                      },
                      {
                        $eq: [
                          { $ifNull: ['$isBlocked', false] },
                          false,
                        ],
                      },

                      // Role started before report ended
                      { $lt: ['$from', '$$reportEnd'] },

                      // Role ended after report started OR is still active
                      {
                        $or: [
                          { $eq: ['$to', null] },
                          { $gt: ['$to', '$$reportStart'] },
                        ],
                      },
                    ],
                  },
                },
              },
              {
                $project: {
                  role: 1,
                  hours: {
                    $divide: [
                      {
                        $subtract: [
                          // Effective end
                          {
                            $min: [
                              {
                                $ifNull: ['$to', '$$currentTime'],
                              },
                              '$$reportEnd',
                            ],
                          },

                          // Effective start
                          {
                            $max: [
                              '$from',
                              '$$reportStart',
                            ],
                          },
                        ],
                      },
                      1000 * 60 * 60,
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: '$role',
                  hours: {
                    $sum: '$hours',
                  },
                },
              },
            ],
            as: 'roleHistory',
          },
        },

        {
          $project: {
            _id: 0,
            moderatorName: {
              $concat: [
                '$moderator.firstName',
                ' ',
                { $ifNull: ['$moderator.lastName', ''] },
              ],
            },
            count: 1,
            closedCount: 1,
            dynamicClosedCount: 1,
            duplicateClosedCount: 1,

            moderatorHours: {
              $round: [
                {
                  $ifNull: [
                    {
                      $first: {
                        $map: {
                          input: {
                            $filter: {
                              input: '$roleHistory',
                              as: 'r',
                              cond: { $eq: ['$$r._id', 'moderator'] },
                            },
                          },
                          as: 'r',
                          in: '$$r.hours',
                        },
                      },
                    },
                    0,
                  ],
                },
                2,
              ],
            },

            auditorHours: {
              $round: [
                {
                  $ifNull: [
                    {
                      $first: {
                        $map: {
                          input: {
                            $filter: {
                              input: '$roleHistory',
                              as: 'r',
                              cond: { $eq: ['$$r._id', 'auditor'] },
                            },
                          },
                          as: 'r',
                          in: '$$r.hours',
                        },
                      },
                    },
                    0,
                  ],
                },
                2,
              ],
            },

            gateKeeperHours: {
              $round: [
                {
                  $ifNull: [
                    {
                      $first: {
                        $map: {
                          input: {
                            $filter: {
                              input: '$roleHistory',
                              as: 'r',
                              cond: { $eq: ['$$r._id', 'gate_keeper'] },
                            },
                          },
                          as: 'r',
                          in: '$$r.hours',
                        },
                      },
                    },
                    0,
                  ],
                },
                2,
              ],
            },
          },
        },

        {
          $sort: {
            count: -1,
          },
        },
      ],
      { session },
    ).toArray()) as {
      moderatorName: string;
      count: number;
      closedCount: number;
      dynamicClosedCount: number;
      duplicateClosedCount: number;
      moderatorHours: number;
      auditorHours: number;
      gateKeeperHours: number;
    }[];
    // todayApproved counts ONLY questions closed as plain 'closed' (Push to GDB) —
    // not the Notify-User closes (dynamic_closed / duplicate_closed). Compute it as a
    // DIRECT count of closed questions in the window (not the by-approver breakdown
    // sum) so it isn't undercounted when a closed question has no attributable final
    // answer / approver — those are dropped from the per-approver breakdown but must
    // still be counted in the total.
    const totalApproved = await this.QuestionCollection.countDocuments({
      status: 'closed',
      closedAt: { $gte: start, $lt: end },
      ...(!isAdmin &&
        (isTrainingUser
          ? { isTrainingQuestion: true }
          : { isTrainingQuestion: { $ne: true } })),
    } as any);

    return {
      todayApproved: totalApproved,
      moderatorBreakdown: moderatorBreakdown,
    };
  }

export async function getClosedAnswerMismatch(
  this: QuestionRepository,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    window: { start: Date; end: Date };
    totalClosed: number;
    matched: number;
    mismatched: number;
    items: any[];
  }> {
    await this.init();
    const rows = (await this.QuestionCollection.aggregate([
      { $match: { status: 'closed', closedAt: { $gte: startDate, $lt: endDate } } },
      {
        $lookup: {
          from: 'answers',
          localField: '_id',
          foreignField: 'questionId',
          as: 'answers',
        },
      },
      {
        $addFields: {
          totalAnswers: { $size: '$answers' },
          finalAnswers: {
            $filter: {
              input: '$answers',
              as: 'a',
              cond: { $eq: ['$$a.isFinalAnswer', true] },
            },
          },
        },
      },
      {
        $addFields: {
          // Final answers that have a proper ObjectId approvedBy — what the breakdown counts.
          finalWithObjectIdApprover: {
            $filter: {
              input: '$finalAnswers',
              as: 'a',
              cond: {
                $and: [
                  { $ne: [{ $ifNull: ['$$a.approvedBy', null] }, null] },
                  { $eq: [{ $type: '$$a.approvedBy' }, 'objectId'] },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          question: 1,
          source: 1,
          status: 1,
          closedBy: 1,
          closedAt: 1,
          moderatorId: 1,
          totalAnswers: 1,
          finalAnswerCount: { $size: '$finalAnswers' },
          finalWithApproverCount: { $size: '$finalWithObjectIdApprover' },
          // approvedBy value + BSON type on each final answer, to spot string ids.
          finalAnswerApprovers: {
            $map: {
              input: '$finalAnswers',
              as: 'a',
              in: {
                approvedBy: '$$a.approvedBy',
                approvedByType: { $type: '$$a.approvedBy' },
                status: '$$a.status',
              },
            },
          },
          isMatched: { $gt: [{ $size: '$finalWithObjectIdApprover' }, 0] },
        },
      },
      { $sort: { closedAt: 1 } },
    ]).toArray()) as any[];

    const mismatchedItems = rows.filter(r => !r.isMatched);
    return {
      window: { start: startDate, end: endDate },
      totalClosed: rows.length,
      matched: rows.length - mismatchedItems.length,
      mismatched: mismatchedItems.length,
      items: mismatchedItems,
    };
  }

export async function getQuestionSourceBreakdown(
  this: QuestionRepository,
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
    customStartTime?: string,
    customEndTime?: string,
  ): Promise<{ whatsapp: number; ajrasakha: number }> {
    await this.init();

    const matchCondition: any = { status: { $ne: 'pass' } };
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
          ? [{ $match: matchCondition }]
          : []),
        {
          $group: {
            _id: '$source',
            count: { $sum: 1 },
          },
        },
      ],
      { session },
    ).toArray()) as { _id: string; count: number }[];

    const whatsapp =
      sourceBreakdown.find(s => s._id?.toLowerCase() === 'whatsapp')?.count ??
      0;
    const ajrasakha =
      sourceBreakdown.find(s => s._id?.toLowerCase() === 'ajrasakha')?.count ??
      0;

    return { whatsapp, ajrasakha };
  }

export async function getQuestionsAnsweredWithin120Minutes(
  this: QuestionRepository,
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
    customStartTime?: string,
    customEndTime?: string,
  ): Promise<{ whatsapp: number; ajrasakha: number }> {
    await this.init();

    const matchCondition: any = {
      status: 'closed',
      closedAt: { $exists: true },
      createdAt: { $exists: true },
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
        { $match: matchCondition },
        {
          $addFields: {
            timeTakenMinutes: {
              $divide: [{ $subtract: ['$closedAt', '$createdAt'] }, 60000],
            },
          },
        },
        {
          $match: {
            timeTakenMinutes: { $lte: 120 },
          },
        },
        {
          $group: {
            _id: '$source',
            count: { $sum: 1 },
          },
        },
      ],
      { session },
    ).toArray()) as { _id: string; count: number }[];

    const whatsapp =
      result.find(s => s._id?.toLowerCase() === 'whatsapp')?.count ?? 0;
    const ajrasakha =
      result.find(s => s._id?.toLowerCase() === 'ajrasakha')?.count ?? 0;

    return { whatsapp, ajrasakha };
  }

export async function getQuestionsAnsweredAfter120Minutes(
  this: QuestionRepository,
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{ whatsapp: number; ajrasakha: number }> {
    await this.init();

    const matchCondition: any = {
      status: 'closed',
      closedAt: { $exists: true },
      createdAt: { $exists: true },
    };

    if (startDate && endDate) {
      matchCondition.createdAt = { $gte: startDate, $lt: endDate };
    }

    const result = (await this.QuestionCollection.aggregate(
      [
        { $match: matchCondition },
        {
          $addFields: {
            timeTakenMinutes: {
              $divide: [{ $subtract: ['$closedAt', '$createdAt'] }, 60000],
            },
          },
        },
        {
          $match: {
            timeTakenMinutes: { $gt: 120 },
          },
        },
        {
          $group: {
            _id: '$source',
            count: { $sum: 1 },
          },
        },
      ],
      { session },
    ).toArray()) as { _id: string; count: number }[];

    const whatsapp =
      result.find(s => s._id?.toLowerCase() === 'whatsapp')?.count ?? 0;
    const ajrasakha =
      result.find(s => s._id?.toLowerCase() === 'ajrasakha')?.count ?? 0;

    return { whatsapp, ajrasakha };
  }

export async function getQuestionStateBreakdown(
  this: QuestionRepository,
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
  ): Promise<QuestionStateBreakdownBySource> {
    await this.init();

    const matchCondition: any = { status: { $ne: 'pass' } };
    if (startDate && endDate) {
      matchCondition.createdAt = { $gte: startDate, $lt: endDate };
    }

    const stateBreakdown = (await this.QuestionCollection.aggregate(
      [
        ...(Object.keys(matchCondition).length > 0
          ? [{ $match: matchCondition }]
          : []),
        {
          $group: {
            _id: {
              source: '$source',
              status: '$status',
            },
            count: { $sum: 1 },
          },
        },
      ],
      { session },
    ).toArray()) as { _id: { source?: string; status?: string }; count: number }[];

    const buildBreakdown = (sourceName: 'whatsapp' | 'ajrasakha') => {
      const sourceKey = sourceName.toUpperCase();
      const getCount = (status: string) =>
        stateBreakdown.find(
          item =>
            item._id?.source?.toUpperCase() === sourceKey &&
            item._id?.status?.toLowerCase() === status,
        )?.count ?? 0;

      return [
        { status: 'open', count: getCount('open') },
        { status: 'pass', count: getCount('pass') },
        { status: 'delayed', count: getCount('delayed') },
      ];
    };

    return {
      whatsapp: buildBreakdown('whatsapp'),
      ajrasakha: buildBreakdown('ajrasakha'),
    };
  }

export async function getAverageResponseTime(
  this: QuestionRepository,
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
    customStartTime?: string,
    customEndTime?: string,
  ): Promise<{ whatsapp: number; ajrasakha: number }> {
    await this.init();

    const matchCondition: any = {
      status: 'closed',
      createdAt: { $exists: true },
      closedAt: { $exists: true },
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

export async function getMonthAnalytics(
  this: QuestionRepository,
    goldenDataSelectedYear: string,
    goldenDataSelectedMonth: string,
    customStartTime?: string,
    customEndTime?: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<{
    weeksData: GoldenDatasetEntry[];
    totalEntriesByType: number;
    totalVerifiedByType: number;
    moderatorBreakdown?: { moderatorName: string; count: number, moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number }[];
    questionSourceBreakdown?: { whatsapp: number; ajrasakha: number };
    questionsAnsweredWithin120Min?: { whatsapp: number; ajrasakha: number };
    averageResponseTime?: { whatsapp: number; ajrasakha: number };
    questionsAnsweredAfter120Min?: { whatsapp: number; ajrasakha: number };
    questionStateBreakdown?: QuestionStateBreakdownBySource;
    paeMetrics?: { assigned: number; submitted: number; closed: number };
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
      createdAt: { $gte: startDate, $lt: endDate },
      status: { $ne: 'pass' },
      ...(!isAdmin &&
        (isTrainingUser
          ? { isTrainingQuestion: true }
          : { isTrainingQuestion: { $ne: true } })),
    };

    const closedMatchCondition: any = {
      status: 'closed',
      closedAt: {
        $gte: startDate,
        $lt: endDate,
      },
      ...(!isAdmin &&
        (isTrainingUser
          ? { isTrainingQuestion: true }
          : { isTrainingQuestion: { $ne: true } })),
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
            weekOfMonth: { $ceil: { $divide: [{ $dayOfMonth: '$createdAt' }, 7] } },
          },
        },
        {
          $group: {
            _id: { week: '$weekOfMonth' },
            totalEntries: { $sum: 1 },
            totalVerified: {
              $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] },
            },
          },
        },
        { $sort: { '_id.week': 1 } },
      ],
      { session },
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

    const { moderatorBreakdown } = await this.getTodayApproved(
      isTrainingUser,
      isAdmin,
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
      isTrainingUser,
      isAdmin
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

export async function getWeekAnalytics(
  this: QuestionRepository,
    goldenDataSelectedYear: string,
    goldenDataSelectedMonth: string,
    goldenDataSelectedWeek: string,
    customStartTime?: string,
    customEndTime?: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<{
    dailyData: GoldenDatasetEntry[];
    totalEntriesByType: number;
    totalVerifiedByType: number;
    moderatorBreakdown?: { moderatorName: string; count: number, moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number }[];
    questionSourceBreakdown?: { whatsapp: number; ajrasakha: number };
    questionsAnsweredWithin120Min?: { whatsapp: number; ajrasakha: number };
    averageResponseTime?: { whatsapp: number; ajrasakha: number };
    questionsAnsweredAfter120Min?: { whatsapp: number; ajrasakha: number };
    questionStateBreakdown?: QuestionStateBreakdownBySource;
    paeMetrics?: { assigned: number; submitted: number; closed: number };
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
      createdAt: { $gte: startDate, $lt: endDate },
      status: { $ne: 'pass' },
      ...(!isAdmin &&
        (isTrainingUser
          ? { isTrainingQuestion: true }
          : { isTrainingQuestion: { $ne: true } })),
    };

    const closedMatchCondition: any = {
      status: 'closed',
      closedAt: {
        $gte: startDate,
        $lt: endDate,
      },
      ...(!isAdmin &&
        (isTrainingUser
          ? { isTrainingQuestion: true }
          : { isTrainingQuestion: { $ne: true } })),
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
            dayOfWeek: { $dayOfWeek: '$createdAt' },
          },
        },
        {
          $group: {
            _id: { day: '$dayOfWeek' },
            totalEntries: { $sum: 1 },
            totalVerified: {
              $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] },
            },
          },
        },
        { $sort: { '_id.day': 1 } },
      ],
      { session },
    ).toArray();

    const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const dailyData: GoldenDatasetEntry[] = Array.from({ length: 7 }, (_, i) => {
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

    const { moderatorBreakdown } = await this.getTodayApproved(
      isTrainingUser,
      isAdmin,
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
      isTrainingUser,
      isAdmin
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

export async function getDailyAnalytics(
  this: QuestionRepository,
    goldenDataSelectedYear: string,
    goldenDataSelectedMonth: string,
    goldenDataSelectedWeek: string,
    goldenDataSelectedDay: string,
    customStartTime?: string,
    customEndTime?: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<{
    dayHourlyData: Record<string, GoldenDatasetEntry[]>;
    totalEntriesByType: number;
    totalVerifiedByType: number;
    moderatorBreakdown?: { moderatorName: string; count: number, moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number }[];
    questionSourceBreakdown?: { whatsapp: number; ajrasakha: number };
    questionsAnsweredWithin120Min?: { whatsapp: number; ajrasakha: number };
    averageResponseTime?: { whatsapp: number; ajrasakha: number };
    paeMetrics?: { assigned: number; submitted: number; closed: number };
    questionsAnsweredAfter120Min?: { whatsapp: number; ajrasakha: number };
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
      createdAt: { $gte: startDate, $lt: endDate },
      status: { $ne: 'pass' },
      ...(!isAdmin &&
        (isTrainingUser
          ? { isTrainingQuestion: true }
          : { isTrainingQuestion: { $ne: true } })),
    };

    const closedMatchCondition: any = {
      // status: 'closed',
      closedAt: {
        $gte: startDate,
        $lt: endDate,
      },
      ...(!isAdmin &&
        (isTrainingUser
          ? { isTrainingQuestion: true }
          : { isTrainingQuestion: { $ne: true } })),
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
            hourOfDay: { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
            dayOfWeek: {
              $dayOfWeek: { date: '$createdAt', timezone: 'Asia/Kolkata' },
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
            totalEntries: { $sum: 1 },
            totalVerified: {
              $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] },
            },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ],
      { session },
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
      { length: 24 },
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

    let moderatorBreakdown: { moderatorName: string; count: number, moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number }[] = [];
    let questionSourceBreakdown: { whatsapp: number; ajrasakha: number } = {
      whatsapp: 0,
      ajrasakha: 0,
    };
    let questionsAnsweredWithin120Min: { whatsapp: number; ajrasakha: number } = {
      whatsapp: 0,
      ajrasakha: 0,
    };
    let averageResponseTime: { whatsapp: number; ajrasakha: number } = {
      whatsapp: 0,
      ajrasakha: 0,
    };
    let questionsAnsweredAfter120Min: { whatsapp: number; ajrasakha: number } = {
      whatsapp: 0,
      ajrasakha: 0,
    };
    let questionStateBreakdown: QuestionStateBreakdownBySource | undefined;

    if (specificDayStart) {
      const specificDayEnd = new Date(specificDayStart);
      specificDayEnd.setDate(specificDayEnd.getDate() + 1);
      const result = await this.getTodayApproved(
        isTrainingUser,
        isAdmin,
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
      isTrainingUser,
      isAdmin
    );

    return {
      dayHourlyData: { [goldenDataSelectedDay]: hourlyData },
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

export async function getCustomRangeAnalytics(
  this: QuestionRepository,
    customStartDateTime: string,
    customEndDateTime: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<{
    customData: GoldenDatasetEntry[];
    totalEntriesByType: number;
    totalVerifiedByType: number;
    moderatorBreakdown?: { moderatorName: string; count: number, moderatorHours?: number, auditorHours?: number, gateKeeperHours?: number }[];
    questionSourceBreakdown?: { whatsapp: number; ajrasakha: number };
    questionsAnsweredWithin120Min?: { whatsapp: number; ajrasakha: number };
    averageResponseTime?: { whatsapp: number; ajrasakha: number };
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
            createdAt: { $gte: startDate, $lt: endDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            totalEntries: { $sum: 1 },
            totalVerified: {
              $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ],
      { session },
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

    const { moderatorBreakdown } = await this.getTodayApproved(
      isTrainingUser,
      isAdmin,
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

export async function getCountBySource(
  this: QuestionRepository,
    timeRange: string, // 90d, 30d, 7d ,...
    isTrainingUser?: boolean,
    isAdmin?: boolean,
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
            createdAt: { $gte: startDate },
            ...(!isAdmin &&
              (isTrainingUser
                ? { isTrainingQuestion: true }
                : { isTrainingQuestion: { $ne: true } })),
          },
        },
        {
          $group: {
            _id: {
              source: '$source',
              day: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
            },
            count: { $sum: 1 },
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
      { session },
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

export async function getQuestionOverviewByStatus(
  this: QuestionRepository,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession,
  ): Promise<QuestionStatusOverview[]> {
    await this.init();

    const results = await this.QuestionCollection.aggregate(
      [
        {
          $match: {
            status: { $ne: 'pass' },
            ...(!isAdmin &&
              (isTrainingUser
                ? { isTrainingQuestion: true }
                : { isTrainingQuestion: { $ne: true } })),
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
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
      { session },
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

export async function getQuestionAnalytics(
  this: QuestionRepository,
    startTime?: string,
    endTime?: string,
    session?: ClientSession,
    status?: string[],
    state?: string[],
    source?: string[],
    crop?: string[],
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<{ analytics: Analytics }> {
    await this.init();

    const filterDate: any = {};
    if (startTime) filterDate.$gte = new Date(`${startTime}T00:00:00.000Z`);
    if (endTime) filterDate.$lte = new Date(`${endTime}T23:59:59.999Z`);

    const matchStage: any = {
      ...(!isAdmin &&
        (isTrainingUser
          ? { isTrainingQuestion: true }
          : { isTrainingQuestion: { $ne: true } })),
    };
    if (status?.length) {
      matchStage.status = { $in: status };
    }
    if (Object.keys(filterDate).length > 0) {
      matchStage.createdAt = filterDate;
    }
    if (state?.length) {
      matchStage['details.state'] = { $in: state };
    }
    if (source?.length) {
      matchStage.source = { $in: source };
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

    const sortAllItems = (data: { name: string; count: number }[]) => {
      return [...data].sort((a, b) => b.count - a.count);
    };

    // Aggregate crop data
    const cropDataRaw = (await this.QuestionCollection.aggregate(
      [
        { $match: matchStage },
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
            count: { $sum: 1 },
          },
        },
        { $project: { name: '$_id', count: 1, _id: 0 } },
      ],
      { session },
    ).toArray()) as AnalyticsItem[];

    // Aggregate state data
    const stateDataRaw = (await this.QuestionCollection.aggregate(
      [
        { $match: matchStage },
        { $group: { _id: '$details.state', count: { $sum: 1 } } },
        { $project: { name: '$_id', count: 1, _id: 0 } },
      ],
      { session },
    ).toArray()) as AnalyticsItem[];

    // Aggregate domain data
    const domainDataRaw = (await this.QuestionCollection.aggregate(
      [
        { $match: matchStage },
        { $unwind: '$details.domain' },
        { $group: { _id: '$details.domain', count: { $sum: 1 } } },
        { $project: { name: '$_id', count: 1, _id: 0 } },
      ],
      { session },
    ).toArray()) as AnalyticsItem[];

    // Table: group by state × crop × source, pivot status counts
    const tableData = (await this.QuestionCollection.aggregate(
      [
        { $match: matchStage },
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
            open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
            closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
            inReview: { $sum: { $cond: [{ $eq: ['$status', 'in-review'] }, 1, 0] } },
            delayed: { $sum: { $cond: [{ $eq: ['$status', 'delayed'] }, 1, 0] } },
            reRouted: { $sum: { $cond: [{ $eq: ['$status', 're-routed'] }, 1, 0] } },
            hold: { $sum: { $cond: [{ $eq: ['$status', 'hold'] }, 1, 0] } },
            paeSubmitted: {
              $sum: { $cond: [{ $eq: ['$status', 'pae_submitted'] }, 1, 0] },
            },
            draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
            duplicate: { $sum: { $cond: [{ $eq: ['$status', 'duplicate'] }, 1, 0] } },
            total: { $sum: 1 },
            // Earliest question ever created in this group
            lastPushedDate: { $min: '$createdAt' },
            // Most recent closedAt among questions that are actually closed
            lastClosedDate: {
              $max: {
                $cond: [{ $eq: ['$status', 'closed'] }, '$closedAt', null],
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
                { $gt: ['$total', 0] },
                {
                  $round: [
                    { $multiply: [{ $divide: ['$closed', '$total'] }, 100] },
                    1,
                  ],
                },
                0,
              ],
            },
          },
        },
        { $sort: { state: 1, crop: 1, source: 1 } },
      ],
      { session },
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

export async function getModeratorApprovalRate(
  this: QuestionRepository,
    currentUserId: string,
    session?: ClientSession,
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<ModeratorApprovalRate> {
    try {
      await this.init();

      const pending = await this.QuestionCollection.countDocuments(
        {
          status: 'in-review',
          ...(
            !isAdmin &&
            (isTrainingUser
              ? { isTrainingQuestion: true }
              : { isTrainingQuestion: { $ne: true } })
          ),
        },
        { session },
      );

      const approved = await this.QuestionCollection.countDocuments(
        {
          status: 'closed',
          ...(
            !isAdmin &&
            (isTrainingUser
              ? { isTrainingQuestion: true }
              : { isTrainingQuestion: { $ne: true } })
          ),
        },
        { session },
      );

      const totalReviews = pending + approved || 0;

      // const approvedCount = await this.QuestionCollection.countDocuments(
      //   {status: 'closed'},
      //   {session},
      // );

      const approvalRate =
        totalReviews > 0
          ? Number(((approved / totalReviews) * 100).toFixed(2))
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

export async function getMonthlyQuestionStats(
  this: QuestionRepository,
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
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
            createdAt: { $gte: defaultStartDate, $lte: defaultEndDate },
            ...(
              !isAdmin && isTrainingUser === true
                ? { isTrainingQuestion: true }
                : !isAdmin && isTrainingUser === false
                  ? { isTrainingQuestion: { $ne: true } }
                  : {}
            ),
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            totalQuestions: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ],
      { session },
    ).toArray();

    const answerStats = await this.AnswersCollection.aggregate(
      [
        {
          $match: {
            createdAt: { $gte: defaultStartDate, $lte: defaultEndDate },
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
            ...(
              !isAdmin && isTrainingUser === true
                ? { isTrainingQuestion: true }
                : !isAdmin && isTrainingUser === false
                  ? { isTrainingQuestion: { $ne: true } }
                  : {}
            ),
          },
        },

        // Count modifications per answer
        {
          $addFields: {
            modificationsCount: { $size: { $ifNull: ['$modifications', []] } },
          },
        },

        // Group per question
        {
          $group: {
            _id: '$questionId',
            totalAnswers: { $sum: 1 },
            hasModifiedAnswer: {
              $max: { $cond: [{ $gte: ['$modificationsCount', 1] }, 1, 0] },
            },
            latestCreatedAt: { $max: '$createdAt' },
          },
        },

        // Month-wise metrics
        {
          $group: {
            _id: {
              year: { $year: '$latestCreatedAt' },
              month: { $month: '$latestCreatedAt' },
            },

            // Modified questions
            modifiedCount: {
              $sum: {
                $cond: [{ $eq: ['$hasModifiedAnswer', 1] }, 1, 0],
              },
            },

            // Rejected = multiple answers BUT no modifications
            rejectedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$totalAnswers', 2] },
                      { $eq: ['$hasModifiedAnswer', 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },

        { $sort: { '_id.year': 1, '_id.month': 1 } },
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

export async function getQuestionStatusSummary(
  this: QuestionRepository,
    query: GetDetailedQuestionsQuery,
    body: DetailedQuestionsBodyDto,
    session?: ClientSession,
  ): Promise<{
    totalQuestions: number;
    statuses: { status: string; count: number }[];
    sourceCounts: { source: string; count: number }[];
  }> {
    await this.init();

    const { filter } = await buildQuestionFilter(
      { ...query, searchEmbedding: null },
      this.QuestionSubmissionCollection,
      this.AnswersCollection,
    );

    // Apply pae_review filter exactly matching findDetailedQuestions logic
    if (query.pae_review) {
      filter.pae_review = { $eq: true };
    } else {
      filter.$or = [{ pae_review: { $eq: false } }, { pae_review: { $exists: false } }];
    }

    // Apply is_non_agri / dynamic filter exactly matching findDetailedQuestions logic
    if (query.is_non_agri === 'true' || query.is_non_agri === true) {
      // filter.status = 'non_agri';
    } else if (filter.status === undefined) {
      // filter.status = {$nin: ['non_agri', 'dynamic']};
    }

    // Apply isOnHold filter exactly matching findDetailedQuestions logic
    if (query.isOnHold === 'true') {
      filter.isOnHold = { $eq: true };
    }

    // Apply isHidden filter exactly matching findDetailedQuestions logic
    if (query.hiddenQuestions === 'true' || query.status === 'pass') {
      filter.isHidden = { $eq: true };
    }

    // Apply states/normalisedCrops from body if provided (matching findDetailedQuestions logic)
    if (body?.states && body.states.length > 0) {
      filter['details.state'] = { $in: body.states };
    }
    if (body?.normalisedCrops && body.normalisedCrops.length > 0) {
      const hasNotSet = body.normalisedCrops.includes('__NOT_SET__');
      const realCrops = body.normalisedCrops.filter(c => c !== '__NOT_SET__');
      if (!hasNotSet) {
        filter['details.normalised_crop'] = { $in: realCrops };
      } else {
        const orConditions: any[] = [
          { 'details.normalised_crop': { $exists: false } },
          { 'details.normalised_crop': null },
          { 'details.normalised_crop': '' },
        ];
        if (realCrops.length > 0) {
          orConditions.push({ 'details.normalised_crop': { $in: realCrops } });
        }
        if (!filter.$and) filter.$and = [];
        filter.$and.push({ $or: orConditions });
      }
    }

    const [statusResults, sourceResults] = await Promise.all([
      this.QuestionCollection.aggregate(
        [
          { $match: filter },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $project: { _id: 0, status: '$_id', count: 1 } },
        ],
        { session },
      ).toArray(),
      this.QuestionCollection.aggregate(
        [
          { $match: filter },
          { $group: { _id: '$source', count: { $sum: 1 } } },
          { $project: { _id: 0, source: '$_id', count: 1 } },
        ],
        { session },
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

    return { totalQuestions, statuses, sourceCounts };
  }

export async function getPAEMetrics(
  this: QuestionRepository,
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
    customStartTime?: string,
    customEndTime?: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<{
    assigned: number;
    submitted: number;
    closed: number;
  }> {
    await this.init();

    const matchCondition: any = {
      status: { $ne: 'pass' },
      ...(!isAdmin &&
        (isTrainingUser
          ? { isTrainingQuestion: true }
          : { isTrainingQuestion: { $ne: true } })),
    };
    const closedMatchCondition: any = {
      ...(!isAdmin &&
        (isTrainingUser
          ? { isTrainingQuestion: true }
          : { isTrainingQuestion: { $ne: true } })),
    };

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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
                      { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
                      60,
                    ],
                  },
                  { $minute: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
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
                ? [{ $match: matchCondition }]
                : []),
              {
                $match: {
                  pae_review: true,
                  $or: [{ status: 'open' }, { status: 'delayed' }],
                },
              },
              {
                $count: 'total',
              },
            ],
            submitted: [
              ...(Object.keys(matchCondition).length > 0
                ? [{ $match: matchCondition }]
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
                ? [{ $match: closedMatchCondition }]
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
      { session },
    ).toArray();

    const result = paeMetrics[0];

    return {
      assigned: result.assigned[0]?.total ?? 0,
      submitted: result.submitted[0]?.total ?? 0,
      closed: result.closed[0]?.total ?? 0,
    };
  }

export async function getShiftBasedMetrics(
  this: QuestionRepository,
    startDate: string,
    // endDate: string,
    shift: 'morning' | 'evening' | 'all',
    source: 'annam' | 'whatsapp' | 'agri_expert',
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
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

    const trainingFilter = !isAdmin && isTrainingUser === true
      ? { isTrainingQuestion: true }
      : !isAdmin && isTrainingUser === false
        ? { isTrainingQuestion: { $ne: true } }
        : {}


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
          ...trainingFilter,
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
          ...trainingFilter,
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
          ...trainingFilter,

          ...createdAtShiftFilter,
        },
        { session },
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
          ...trainingFilter,

          ...closedAtShiftFilter,
        },
        { session },
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
              ...trainingFilter,

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
        { session },
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
              ...trainingFilter,

              ...createdAtShiftFilter,
            },
          },

          {
            $count: 'totalReroutedQuestions',
          },
        ],
        { session },
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

export async function getShiftBasedTrends(
  this: QuestionRepository,
    startDate: string,
    // endDate: string,
    shift: 'morning' | 'evening' | 'all',
    source: 'annam' | 'whatsapp' | 'agri_expert',
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
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

    const trainingFilter = !isAdmin && isTrainingUser === true
      ? { isTrainingQuestion: true }
      : !isAdmin && isTrainingUser === false
        ? { isTrainingQuestion: { $ne: true } }
        : {}

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
            ...trainingFilter,
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
      { session },
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
            ...trainingFilter,
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
      { session },
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

export async function getQuestionStatusDistribution(
  this: QuestionRepository,
    startDate: string,
    // endDate: string,
    shift: 'morning' | 'evening' | 'all',
    source: 'annam' | 'whatsapp' | 'agri_expert',
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
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

    const trainingFilter = !isAdmin && isTrainingUser === true
      ? { isTrainingQuestion: true }
      : !isAdmin && isTrainingUser === false
        ? { isTrainingQuestion: { $ne: true } }
        : {}

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
            ...trainingFilter,
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
      { session },
    ).toArray();

    return result.map(item => ({
      status: item._id || 'unknown',
      count: item.count,
    }));
  }

export async function getQuestionLevelDistribution(
  this: QuestionRepository,
    startDate: string,
    // endDate: string,
    shift: 'morning' | 'evening' | 'all',
    source: 'annam' | 'whatsapp' | 'agri_expert',
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
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

    const trainingFilter = !isAdmin && isTrainingUser === true
      ? { isTrainingQuestion: true }
      : !isAdmin && isTrainingUser === false
        ? { isTrainingQuestion: { $ne: true } }
        : {}

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
            ...trainingFilter
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
      { session },
    ).toArray();

    return result.map(item => ({
      level: `Level ${item._id}`,
      count: item.count,
    }));
  }

export async function getShiftBasedTopExperts(
  this: QuestionRepository,
    startDate: string,
    // endDate: string,
    shift: 'morning' | 'evening' | 'all',
    source: 'annam' | 'whatsapp' | 'agri_expert',
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
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

    const trainingFilter = !isAdmin && isTrainingUser === true
      ? { isTrainingQuestion: true }
      : !isAdmin && isTrainingUser === false
        ? { isTrainingQuestion: { $ne: true } }
        : {}

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
                  ...trainingFilter,
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
      { session },
    ).toArray();

    return result.map(item => ({
      ...item,
      userId: item.userId.toString(),
    }));
  }

export async function getShiftBasedTopApprovingExperts(
  this: QuestionRepository,
    startDate: string,
    // endDate: string,
    shift: 'morning' | 'evening' | 'all',
    source: 'annam' | 'whatsapp' | 'agri_expert',
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
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

    const trainingFilter = !isAdmin && isTrainingUser === true
      ? { isTrainingQuestion: true }
      : !isAdmin && isTrainingUser === false
        ? { isTrainingQuestion: { $ne: true } }
        : {}

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
                  ...trainingFilter,
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
      { session },
    ).toArray();

    return result.map(item => ({
      ...item,
      userId: item.userId.toString(),
    }));
  }
