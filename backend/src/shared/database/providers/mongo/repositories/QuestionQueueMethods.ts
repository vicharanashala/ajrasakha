import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import * as analytics from './QuestionAnalyticsMethods.js';
import * as reads from './QuestionReadMethods.js';
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
 * Queue / role-assignee / feedback / PAE-validation query implementations extracted
 * from QuestionRepository. They run with `this` bound to the repository (assigned as
 * instance fields there), so bodies use this.QuestionCollection / this.init() etc.
 */

export async function findUnassignedInReviewQuestions(
  this: QuestionRepository,
    sources?: QuestionSource[],
    isTrainingUser?: boolean,
    isAdmin?: boolean,
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
    if (isAdmin !== true && isTrainingUser !== undefined) {
      filter.isTrainingQuestion = isTrainingUser
        ? true
        : { $ne: true };
    }
    return this.QuestionCollection.find(filter)
      .sort({ createdAt: 1 })
      .toArray();
  }

export async function findModeratorAssignedQuestions(
  this: QuestionRepository,
    sources?: QuestionSource[],
    isTrainingUser?: boolean,
    isAdmin?: boolean
  ): Promise<IQuestion[]> {
    await this.init();
    const filter: Record<string, unknown> = {
      status: { $in: ['in-review', 're-routed', 'duplicate', 'pae_submitted'] },
      moderatorId: { $exists: true, $ne: null },
    };
    if (sources && sources.length > 0) {
      filter.source = { $in: sources };
    }
    if (isAdmin !== true && isTrainingUser !== undefined) {
      filter.isTrainingQuestion = isTrainingUser
        ? true
        : { $ne: true };
    }
    return this.QuestionCollection.find(filter)
      .sort({ createdAt: 1 })
      .toArray();
  }

export async function closeFeedbackSourceAndCheckAll(
  this: QuestionRepository,
    questionId: string,
    source: string,
  ): Promise<boolean> {
    await this.init();
    await this.QuestionCollection.updateOne(
      { _id: new ObjectId(questionId) },
      {
        $set: { 'feedbacks.$[f].status': 'closed', updatedAt: new Date() },
      } as any,
      { arrayFilters: [{ 'f.source': source }] },
    );
    const q = await this.QuestionCollection.findOne(
      { _id: new ObjectId(questionId) },
      { projection: { feedbacks: 1 } },
    );
    const fb = ((q as any)?.feedbacks ?? []) as { status?: string }[];
    return fb.length > 0 && fb.every(f => f.status === 'closed');
  }

export async function findQuestionsWithOpenFeedbacks(
  this: QuestionRepository,
    requireAutoAllocate = false,
  ): Promise<IQuestion[]> {
    await this.init();
    // Feedback questions are CLOSED questions that later received feedback (an open
    // feedback entry). The in-review pool is handled separately by
    // findUnassignedInReviewQuestions (autoAllocateModerator), so scope this to closed.
    const filter: Record<string, unknown> = {
      status: 'closed',
      'feedbacks.status': 'open',
    };
    if (requireAutoAllocate) {
      // Only questions with feedback auto-allocation EXPLICITLY true. A missing or
      // false field means OFF (same convention as autoAllocateModerator).
      filter.autoAllocateFeedback = true;
    }
    // Feedback questions are ordered by when their feedback arrived (recentFeedback),
    // not the question's original createdAt. createdAt is the fallback for legacy
    // feedback questions that predate the recentFeedback stamp.
    return this.QuestionCollection.find(filter as any)
      .sort({ recentFeedback: 1, createdAt: 1 })
      .toArray();
  }

export async function updateModeratorId(
  this: QuestionRepository,
  questionId: string, moderatorId: string | null): Promise<void> {
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

export async function findUnassignedQuestionsForRole(
  this: QuestionRepository,
    statuses: QuestionStatus[],
    assigneeField: 'gateKeeperId' | 'auditorId',
    autoAllocateField: 'autoAllocateGateKeeper' | 'autoAllocateAuditor',
  ): Promise<IQuestion[]> {
    await this.init();
    const filter: Record<string, unknown> = {
      status: { $in: statuses },
      // Gate keeper / auditor only handle time-bound (chatbot) questions.
      source: { $in: ['AJRASAKHA', 'WHATSAPP'] },
      [assigneeField]: { $in: [null, undefined] },
      // Only fetch when auto-allocation is explicitly ON — a missing field or `false`
      // both mean "don't auto-assign".
      [autoAllocateField]: { $eq: true },
      isOnHold: { $ne: true },
    };
    return this.QuestionCollection.find(filter as any)
      .sort({ createdAt: 1 })
      .toArray();
  }

export async function findQuestionsForTatReport(
  this: QuestionRepository,
    from: Date,
    to: Date,
    sources?: string[],
    statuses?: string[],
  ): Promise<IQuestion[]> {
    await this.init();
    const CLOSED_STATUSES = ['closed', 'dynamic_closed', 'duplicate_closed'];
    // The special status `all-closed` expands to the three closed statuses.
    const expandedStatuses = statuses?.length
      ? [
          ...new Set(
            statuses.flatMap(s => (s === 'all-closed' ? CLOSED_STATUSES : [s])),
          ),
        ]
      : undefined;
    const window = { $gte: from, $lte: to };
    const match: Record<string, unknown> = {
      // A question counts if it was CREATED or CLOSED within the range — so picking
      // e.g. 14→18 returns everything created OR closed in that window (matching the
      // chosen status), not just one of the two.
      $or: [{ createdAt: window }, { closedAt: window }],
      isTesting: { $ne: true },
      ...(sources && sources.length ? { source: { $in: sources } } : {}),
      ...(expandedStatuses ? { status: { $in: expandedStatuses } } : {}),
    };
    return this.QuestionCollection.find(match as any)
      .sort({ createdAt: 1 })
      .toArray();
  }

export async function findQuestionsAssignedToRole(
  this: QuestionRepository,
    assigneeField: 'gateKeeperId' | 'auditorId',
    statuses: QuestionStatus[],
  ): Promise<IQuestion[]> {
    await this.init();
    return this.QuestionCollection.find({
      [assigneeField]: { $ne: null, $exists: true },
      status: { $in: statuses },
      // Gate keeper / auditor only handle time-bound (chatbot) questions.
      source: { $in: ['AJRASAKHA', 'WHATSAPP'] },
    } as any)
      .toArray();
  }

export async function findLeakedRoleAssignments(
  this: QuestionRepository,
    assigneeField: 'gateKeeperId' | 'auditorId',
    finishedAtField: 'gateKeeperFinishedAt' | 'auditorFinishedAt',
    statuses: QuestionStatus[],
  ): Promise<IQuestion[]> {
    await this.init();
    return this.QuestionCollection.find({
      [assigneeField]: { $ne: null, $exists: true },
      // `{ field: null }` matches both an explicit null and a missing field.
      [finishedAtField]: null,
      status: { $nin: statuses },
    } as any)
      .toArray();
  }

export async function getRoleAssigneeDashboard(
  this: QuestionRepository,
    userId: string,
    assigneeField: 'gateKeeperId' | 'auditorId',
    finishedField: 'gateKeeperFinishedAt' | 'auditorFinishedAt',
    assignedAtField: 'gateKeeperAssignedAt' | 'auditorAssignedAt',
    page: number,
    limit: number,
    search?: string,
    startDate?: Date,
    endDate?: Date,
    dateFilterType: 'assigned' | 'completed' | 'both' = 'both',
  ): Promise<{
    assignedCount: number;
    submittedCount: number;
    questions: any[];
    totalPages: number;
    totalCount: number;
  }> {
    await this.init();
    if (!isValidObjectId(userId)) {
      return { assignedCount: 0, submittedCount: 0, questions: [], totalPages: 0, totalCount: 0 };
    }
    const oid = new ObjectId(userId);
    const baseMatch: Record<string, unknown> = { [assigneeField]: oid };
    if (search && search.trim()) {
      baseMatch.question = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    // Apply date range filters based on filter type
    if (startDate && endDate) {
      if (dateFilterType === 'assigned') {
        baseMatch[assignedAtField] = {
          $gte: startDate,
          $lte: endDate,
        };
      } else if (dateFilterType === 'completed') {
        baseMatch[finishedField] = {
          $gte: startDate,
          $lte: endDate,
        };
      } else {
        // 'both' - questions that were either assigned OR completed within the range
        baseMatch.$or = [
          { [assignedAtField]: { $gte: startDate, $lte: endDate } },
          { [finishedField]: { $gte: startDate, $lte: endDate } },
        ];
      }
    }

    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 11), 100);

    // Build count queries with date filters
    const assignedCountMatch: Record<string, unknown> = { [assigneeField]: oid };
    const submittedCountMatch: Record<string, unknown> = { [assigneeField]: oid, [finishedField]: { $ne: null } };

    if (startDate && endDate) {
      if (dateFilterType === 'assigned') {
        assignedCountMatch[assignedAtField] = { $gte: startDate, $lte: endDate };
        submittedCountMatch[assignedAtField] = { $gte: startDate, $lte: endDate };
      } else if (dateFilterType === 'completed') {
        assignedCountMatch[finishedField] = { $gte: startDate, $lte: endDate };
        submittedCountMatch[finishedField] = { $gte: startDate, $lte: endDate };
      } else {
        assignedCountMatch.$or = [
          { [assignedAtField]: { $gte: startDate, $lte: endDate } },
          { [finishedField]: { $gte: startDate, $lte: endDate } },
        ];
        submittedCountMatch.$or = [
          { [assignedAtField]: { $gte: startDate, $lte: endDate } },
          { [finishedField]: { $gte: startDate, $lte: endDate } },
        ];
      }
    }

    const [assignedCount, submittedCount, totalCount, questions] = await Promise.all([
      this.QuestionCollection.countDocuments(assignedCountMatch as any),
      this.QuestionCollection.countDocuments(submittedCountMatch as any),
      this.QuestionCollection.countDocuments(baseMatch as any),
      this.QuestionCollection.find(baseMatch as any, {
        projection: {
          _id: 1, question: 1, status: 1, source: 1, priority: 1, createdAt: 1,
          [assignedAtField]: 1, [finishedField]: 1,
          'details.state': 1, 'details.crop': 1,
        },
      })
        .sort({ [assignedAtField]: -1, createdAt: -1 } as any)
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .toArray(),
    ]);

    return {
      assignedCount,
      submittedCount,
      // Stringify _id so the client gets a plain id (avoids "[object Object]" in URLs).
      questions: questions.map(q => ({ ...q, _id: q._id?.toString() })),
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / safeLimit)),
    };
  }

export async function setRoleAssignee(
  this: QuestionRepository,
    questionId: string,
    assigneeField: 'gateKeeperId' | 'auditorId',
    assignedAtField: 'gateKeeperAssignedAt' | 'auditorAssignedAt',
    assigneeId: string | null,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    const now = new Date();
    const finishedAtField =
      assigneeField === 'gateKeeperId'
        ? 'gateKeeperFinishedAt'
        : 'auditorFinishedAt';
    await this.QuestionCollection.updateOne(
      { _id: new ObjectId(questionId) },
      {
        $set: {
          [assigneeField]: assigneeId ? new ObjectId(assigneeId) : null,
          [assignedAtField]: assigneeId ? now : null,
          [finishedAtField]: null,
          updatedAt: now,
        },
      },
      { session },
    );
  }

export async function markRoleFinished(
  this: QuestionRepository,
    questionId: string,
    finishedAtField: 'gateKeeperFinishedAt' | 'auditorFinishedAt',
    finishedAt: Date,
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    await this.QuestionCollection.updateOne(
      { _id: new ObjectId(questionId) },
      { $set: { [finishedAtField]: finishedAt, updatedAt: new Date() } },
      { session },
    );
  }

export async function getQueueQuestionSection(
  this: QuestionRepository,
    kind: 'received' | 'allocated' | 'autoOff' | 'autoAllocateOpen' | 'autoAllocateDelayed',
    skip: number,
    limit: number,
    startTime?: Date,
    endTime?: Date,
    sources: string[] = ['AJRASAKHA', 'WHATSAPP'],
    requirePaeReviewNotDone: boolean = false,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<{ count: number; items: RawQueueQuestionRow[] }> {
    await this.init();

    // Optional createdAt date-range filter applied to all kinds.
    const createdAtFilter: Record<string, unknown> = {};
    if (startTime) createdAtFilter.$gte = startTime;
    if (endTime) createdAtFilter.$lte = endTime;
    const dateScope = startTime || endTime ? { createdAt: createdAtFilter } : {};

    // Manual single-allocation: restrict to questions not yet PAE-reviewed
    // (pae_review false or missing), mirroring the manual cron's fetch filter.
    const paeScope = requirePaeReviewNotDone ? { pae_review: { $ne: true } } : {};

    const receivedMatch = {
      source: { $in: sources },
      // isAutoAllocate: true,
      //  status: {$in: ['open', 'delayed', 'duplicate']},
      ...paeScope,
      ...dateScope,
    };
    const allocatedMatch = {
      source: { $in: sources },
      isAutoAllocate: { $eq: true },
      // firstAllocationAt: {$exists: true, $ne: null},
      status: { $in: ['open', 'delayed'] },
      ...paeScope,
      // ...dateScope,
    };
    const autoOffMatch = {
      source: { $in: sources },
      isAutoAllocate: { $eq: true },
      status: { $in: ['open', 'delayed'] },
      ...paeScope,
      //  ...dateScope,
    };
    const autoAllocateOpenMatch = {
      source: { $in: sources },
      isAutoAllocate: { $eq: true },
      status: 'open',
      ...paeScope,
    };
    const autoAllocateDelayedMatch = {
      source: { $in: sources },
      isAutoAllocate: { $eq: true },
      status: 'delayed',
      ...paeScope,
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
      { $addFields: { sub: { $arrayElemAt: ['$sub', 0] } } },
    ];
    const projectStage = {
      $project: {
        _id: 1,
        question: 1,
        status: 1,
        source: 1,
        isTrainingQuestion: 1,
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
        { $match: allocatedMatch },
        ...(
          !isAdmin
            ? [
              {
                $match: isTrainingUser
                  ? { isTrainingQuestion: true }
                  : { isTrainingQuestion: { $ne: true } },
              },
            ]
            : []
        ),
        ...lookupStages,
        { $match: { 'sub.queue.0': { $exists: true } } },
        { $addFields: { lastHistory: { $arrayElemAt: [{ $ifNull: ['$sub.history', []] }, -1] } } },
        {
          $match: {
            'lastHistory.answer': { $in: [null] },
            'lastHistory.approvedAnswer': { $in: [null] },
            'lastHistory.modifiedAnswer': { $in: [null] },
            'lastHistory.rejectedAnswer': { $in: [null] },
          },
        },
      ];
      const [items, countRes] = await Promise.all([
        this.QuestionCollection.aggregate<RawQueueQuestionRow>([
          ...base,
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          projectStage,
        ]).toArray(),
        this.QuestionCollection.aggregate<{ count: number }>([
          ...base,
          { $count: 'count' },
        ]).toArray(),
      ]);
      return { count: countRes[0]?.count ?? 0, items };
    }

    const match =
      kind === 'received' ? receivedMatch :
        kind === 'autoAllocateOpen' ? autoAllocateOpenMatch :
          kind === 'autoAllocateDelayed' ? autoAllocateDelayedMatch :
            autoOffMatch;

    const finalMatch = {
      ...match,
      ...(!isAdmin && {
        isTrainingQuestion: isTrainingUser
          ? true
          : { $ne: true },
      }),
    }
    const [count, items] = await Promise.all([
      this.QuestionCollection.countDocuments(finalMatch as any),
      this.QuestionCollection.aggregate<RawQueueQuestionRow>([
        { $match: finalMatch },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
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
        { $match: finalMatch },
        {
          $lookup: {
            from: 'question_submissions',
            localField: '_id',
            foreignField: 'questionId',
            as: 'sub',
          },
        },
        { $addFields: { sub: { $arrayElemAt: ['$sub', 0] } } },
        {
          $addFields: {
            queueEmpty: { $eq: [{ $size: { $ifNull: ['$sub.queue', []] } }, 0] },
            hasAllocatedAt: {
              $cond: [{ $ifNull: ['$sub.currentExpertAllocatedAt', false] }, true, false],
            },
          },
        },
        {
          $group: {
            _id: { queueEmpty: '$queueEmpty', hasAllocatedAt: '$hasAllocatedAt' },
            count: { $sum: 1 },
          },
        },
      ]).toArray();
      /* console.log(
         '[getQueueQuestionSection][autoOff breakdown] (queueEmpty & !hasAllocatedAt = never-allocated queue):',
         JSON.stringify(breakdown),
       );*/
    }

    return { count, items };
  }

export async function getReceivedStatusCounts(
  this: QuestionRepository,
    startTime?: Date,
    endTime?: Date,
    sources: string[] = ['AJRASAKHA', 'WHATSAPP'],
  ): Promise<{ status: string; count: number }[]> {
    await this.init();

    const createdAtFilter: Record<string, unknown> = {};
    if (startTime) createdAtFilter.$gte = startTime;
    if (endTime) createdAtFilter.$lte = endTime;
    const dateScope = startTime || endTime ? { createdAt: createdAtFilter } : {};

    const match = {
      source: { $in: sources },
      ...dateScope,
    };

    const rows = await this.QuestionCollection.aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    return rows.map(r => ({ status: r._id ?? 'unknown', count: r.count }));
  }

export async function getCountByStatus(
  this: QuestionRepository,
  ): Promise<any> {
    const statusCount = await this.QuestionCollection.aggregate([
      {
        $match: {
          isTesting: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]).toArray();
    return statusCount;
  }

export async function addOrUpdateFeedbackStatus(
  this: QuestionRepository,
    questionId: string,
    source: 'DATASET' | 'WEB_APPLICATION' | "PAE_Validation",
    session?: ClientSession,
  ): Promise<number> {
    try {
      const normalizedSource = source.toUpperCase() as
        | 'DATASET'
        | 'WEB_APPLICATION'
        | "PAE_Validation";
      await this.init();

      const result = await this.QuestionCollection.updateOne(
        { _id: new ObjectId(questionId) },
        [
          {
            $set: {
              autoAllocateFeedback: true,
              // Feedback (re)opened now — stamp recency so the moderator queue can
              // order feedback questions by when feedback arrived, not question age.
              // Only stamp it when there is no existing value (null / missing): the first
              // feedback sets the clock; a later feedback arriving while one is still open
              // must NOT reset it. It's cleared back to null once all feedbacks close.
              recentFeedback: {
                $cond: [
                  { $eq: [{ $ifNull: ['$recentFeedback', null] }, null] },
                  '$$NOW',
                  '$recentFeedback',
                ],
              },
              feedbacks: {
                $let: {
                  vars: {
                    feedbacks: { $ifNull: ['$feedbacks', []] },
                  },
                  in: {
                    $cond: [
                      {
                        $in: [
                          normalizedSource,
                          {
                            $map: {
                              input: '$$feedbacks',
                              as: 'feedback',
                              in: '$$feedback.source',
                            },
                          },
                        ],
                      },
                      {
                        $map: {
                          input: '$$feedbacks',
                          as: 'feedback',
                          in: {
                            $cond: [
                              {
                                $eq: [
                                  '$$feedback.source',
                                  normalizedSource,
                                ],
                              },
                              {
                                $mergeObjects: [
                                  '$$feedback',
                                  { status: 'open' },
                                ],
                              },
                              '$$feedback',
                            ],
                          },
                        },
                      },
                      {
                        $concatArrays: [
                          '$$feedbacks',
                          [
                            {
                              source: normalizedSource,
                              status: 'open',
                            },
                          ],
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
        { session },
      );

      return result.matchedCount;
    } catch (error) {
      throw new InternalServerError(
        `Error while updating Question: More info: ${error}`,
      );
    }
  }

export async function findQuestionsPendingPaeValidation(
  this: QuestionRepository,
    session?: ClientSession,
  ): Promise<IQuestion[]> {
    await this.init();
    return this.QuestionCollection.find(
      { paeValidation: 'pending',autoAllocatePaeValidationExpert:true },
      { session },
    )
      .sort({ createdAt: 1 })
      .toArray();
  }

export async function updatePaeValidationStatus(
  this: QuestionRepository,
    questionId: string,
    paeValidation: 'pending' | 'in-progress' | 'completed',
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    await this.init();
    const result = await this.QuestionCollection.updateOne(
      { _id: new ObjectId(questionId) },
      {
        $set: {
          paeValidation,
          updatedAt: new Date(),
        },
      },
      { session },
    );
    return { modifiedCount: result.modifiedCount };
  }

export async function addPaeValidationEntry(
  this: QuestionRepository,
    questionId: string,
    paeValidationEntry: {
      paeAssignedAt: Date;
      paeId: string | ObjectId;
      paeStatus: 'in-progress' | 'completed';
      paeFinishedAt?: Date | null;
    },
    session?: ClientSession,
  ): Promise<void> {
    await this.init();
    const qid = new ObjectId(questionId);
    // Ensure paeId is stored as ObjectId
    const entryWithObjectId = {
      ...paeValidationEntry,
      paeId: ObjectId.isValid(paeValidationEntry.paeId)
        ? new ObjectId(paeValidationEntry.paeId)
        : paeValidationEntry.paeId,
    };
    await this.QuestionSubmissionCollection.updateOne(
      { questionId: qid },
      {
        $push: {
          paeValidation: entryWithObjectId,
        },
        $set: {
          updatedAt: new Date(),
        },
      },
      { session },
    );
  }

export async function addFeedback(
  this: QuestionRepository,
    questionId: string,
    feedbackEntry: {
      source: string;
      status: string;
      recentFeedback?: Date;
    },
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    await this.init();
    const qid = new ObjectId(questionId);
    const now = new Date();

    // Only consider updating recentFeedback for open status feedbacks
    const shouldCheckForOpenFeedbacks = feedbackEntry.status === 'open';

    // Check if there's already an open feedback BEFORE we add the new one
    // We need to do this check first to determine whether to update recentFeedback
    let hasExistingOpenFeedback = false;
    if (shouldCheckForOpenFeedbacks) {
      const existingQuestion = await this.QuestionCollection.findOne(
        { _id: qid },
        { 
          projection: { _id: 1 }, 
          // Use readConcern 'snapshot' for transaction consistency
          ...(session ? { session } : {}) 
        }
      );
      
      if (existingQuestion) {
        // Use aggregation to check existing feedbacks in a transaction-safe way
        const pipeline = [
          { $match: { _id: qid } },
          { 
            $project: {
              hasOpenFeedback: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: { $ifNull: ['$feedbacks', []] },
                        cond: { $eq: ['$$this.status', 'open'] }
                      }
                    }
                  },
                  0
                ]
              }
            }
          }
        ];
        
        const result = await this.QuestionCollection.aggregate(pipeline, { session }).toArray();
        hasExistingOpenFeedback = result[0]?.hasOpenFeedback === true;
      }
    }

    // Determine if we should update recentFeedback:
    // - If there's already an open feedback, don't update recentFeedback (leave it as is)
    // - If no open feedbacks exist, update recentFeedback to now (this is the first open feedback)
    const shouldUpdateRecentFeedback = shouldCheckForOpenFeedbacks && !hasExistingOpenFeedback;

    // Build the update operations
    const updateOps: any = {
      $push: {
        feedbacks: {
          source: feedbackEntry.source,
          status: feedbackEntry.status,
        },
      },
    };

    // Add $set operation if we need to update recentFeedback
    if (shouldUpdateRecentFeedback) {
      updateOps.$set = {
        recentFeedback: feedbackEntry.recentFeedback || now,
      };
    }

    const result = await this.QuestionCollection.updateOne(
      { _id: qid },
      updateOps,
      { session },
    );

    return { modifiedCount: result.modifiedCount };
  }

export async function findByIdsWithAnswers(
  this: QuestionRepository,
    ids: ObjectId[],
    page: number,
    limit: number,
    session?: ClientSession,
  ): Promise<{
    questions: Array<{
      _id: ObjectId;
      question: string;
      status: QuestionStatus;
      source: QuestionSource;
      priority?: string;
      totalAnswersCount?: number;
      createdAt: Date;
      state?: string;
      district?: string;
      crop?: string;
      domain?: string;
      season?: string;
      normalised_crop?: string;
      answer?: {
        _id: ObjectId;
        answer: string;
        sources: Array<{
          source: string;
          sourceType?: string;
          sourceName?: string;
          page?: string | number;
        }>;
        authorId: ObjectId;
        isFinalAnswer: boolean;
      };
    }>;
    totalCount: number;
    totalPages: number;
    currentPage: number;
  }> {
    await this.init();

    const totalCount = ids.length;
    const totalPages = Math.ceil(totalCount / limit);
    const safePage = Math.min(Math.max(page, 1), totalPages || 1);
    const skip = (safePage - 1) * limit;

    // Get the IDs for the current page
    const pageIds = ids.slice(skip, skip + limit);

    if (pageIds.length === 0) {
      return {
        questions: [],
        totalCount,
        totalPages,
        currentPage: safePage,
      };
    }

    // Use aggregation pipeline with $lookup to join answers in a single call
    const pipeline: object[] = [
      // Match only the questions we need
      { $match: { _id: { $in: pageIds } } },
      // Lookup the final answer from answers collection
      {
        $lookup: {
          from: 'answers',
          let: { questionId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$questionId', '$$questionId'] },
                    { $eq: ['$isFinalAnswer', true] },
                  ],
                },
              },
            },
            // Project only the fields we need
            {
              $project: {
                _id: 1,
                answer: 1,
                sources: 1,
                authorId: 1,
                isFinalAnswer: 1,
              },
            },
            // Limit to 1 final answer
            { $limit: 1 },
          ],
          as: 'answerData',
        },
      },
      // Unwind the answer array (if exists) or keep as empty
      {
        $addFields: {
          answer: {
            $cond: {
              if: { $gt: [{ $size: '$answerData' }, 0] },
              then: { $arrayElemAt: ['$answerData', 0] },
              else: null,
            },
          },
        },
      },
      // Project the final shape, excluding the answerData array
      {
        $project: {
          answerData: 0,
        },
      },
    ];

    const options = session ? { session } : undefined;
    const results = await this.QuestionCollection.aggregate(pipeline, options).toArray();
    // Map the results to the expected shape
    const questions = results.map((doc: any) => ({
      _id: doc._id,
      question: doc.question,
      status: doc.status,
      source: doc.source,
      priority: doc.priority,
      totalAnswersCount: doc.totalAnswersCount,
      createdAt: doc.createdAt,
      state: doc.details.state,
      district: doc.details.district,
      crop: doc.details.crop,
      domain: doc.details.domain,
      season: doc.details.season,
      normalised_crop: doc.details.normalised_crop,
      answer: doc.answer
        ? {
            _id: doc.answer._id,
            answer: doc.answer.answer,
            sources: doc.answer.sources || [],
            authorId: doc.answer.authorId,
            isFinalAnswer: doc.answer.isFinalAnswer,
          }
        : undefined,
    }));

    return {
      questions,
      totalCount,
      totalPages,
      currentPage: safePage,
    };
  }

export async function findQuestionsWithOpenPaeValidation(
  this: QuestionRepository,
    requireAutoAllocate = false,
  ): Promise<IQuestion[]> {
    await this.init();

    const filter: Record<string, unknown> = {
      status: {$in:['closed','dynamic_closed','duplicate_closed']},
      paeValidation: {$ne:'completed'},
    };
    if (requireAutoAllocate) {
      // Only questions with pae validation auto-allocation EXPLICITLY true. A missing or
      // false field means OFF (same convention as autoAllocateModerator).
      filter.autoAllocatePaeValidationExpert = true;
    }

    return this.QuestionCollection.find(filter as any, {
      // Exclude the heavy per-document fields — above all the `embedding` vector.
      // This query is unbounded (every closed question pending PAE validation), so
      // loading full docs (thousands, each with an embedding array) OOM-crashes the
      // Cloud Run instance → 503. The PAE queue only needs lightweight fields
      // (question/details/status), so drop the big ones.
      projection: {
        embedding: 0,
        text: 0,
        aiInitialAnswer: 0,
        aiApprovedSources: 0,
        aiApprovedAnswer: 0,
        popContext: 0,
        referenceQuestionDetails: 0,
      },
    } as any)
      .sort({ createdAt: 1 })
      .toArray();
  }
