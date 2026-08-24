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
 * Detailed question-read / response-building query implementations extracted from
 * QuestionRepository. They run with `this` bound to the repository (assigned as
 * instance fields there), so bodies use this.QuestionCollection / this.init() etc.
 */

export async function findDetailedQuestions(
  this: QuestionRepository,
    query: GetDetailedQuestionsQuery & { searchEmbedding: number[] | null },
    body?: DetailedQuestionsBodyDto,
  ): Promise<{ questions: IQuestion[]; totalPages: number; totalCount: number }> {
    try {
      await this.init();
      const escapeRegex = (str: string) =>
        str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const caseInsensitiveStringFilter = (field: string, value?: string) => {
        if (value && value !== 'all') {
          const escapedValue = escapeRegex(value);
          // filter[field] = {$regex: `^${value}$`, $options: 'i'};
          filter[field] = { $regex: `^${escapedValue}$`, $options: 'i' };
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
        assignedUser,
        page = 1,
        limit = 10,
        review_level,
        closedAtStart,
        closedAtEnd,
        consecutiveApprovals,
        autoAllocateFilter,
        autoAllocateModeratorFilter,
        feedbackFilter,
        sort,
        closedInTwoHrs,
        hiddenQuestions,
        duplicateQuestions,
        isOnHold,
        unallocatedQuestions,
        pae_review,
        is_non_agri,
        is_testing,
        isTrainingQuestion,
        moderatorId,
        gateKeeperId,
        auditorId,
      } = query;
      //  const filter: any = {};
      const filter: any = {
        // isHidden: { $ne: true }, // default to exclude hidden questions
        // isOnHold: { $ne: true }, // default to exclude on hold questions
        isTesting: { $ne: true },
        isTrainingQuestion: { $ne: true },
      };
      if (pae_review) {
        filter.pae_review = { $eq: true };
      }
      if (!pae_review) {
        filter.$or = [
          { pae_review: { $eq: false } },
          { pae_review: { $exists: false } },
        ];
      }

      // --- Hidden question filter ---
      if (hiddenQuestions === 'true' || status === 'pass') {
        filter.isHidden = { $eq: true }; // filter by hidden questions
      }

      // --- on Hold question filter ---
      if (isOnHold === 'true') filter.isOnHold = { $eq: true }; // filter by on hold questions

      // --- Unallocated questions filter ---
      // Single aggregation: join questions (open/delayed) with question_submissions,
      // then match: no submission, OR empty queue, OR last history status != 'in-review' with non-empty queue
      if (unallocatedQuestions === 'true') {
        const unallocatedDocs = await this.QuestionCollection.aggregate([
          { $match: { status: { $in: ['open', 'delayed'] } } },
          {
            $lookup: {
              from: 'question_submissions',
              let: { qId: '$_id' },
              pipeline: [
                { $match: { $expr: { $eq: ['$questionId', '$$qId'] } } },
                { $project: { queue: 1, history: 1 } },
              ],
              as: 'sub',
            },
          },
          { $addFields: { sub: { $arrayElemAt: ['$sub', 0] } } },
          {
            $match: {
              $or: [
                // No submission OR empty queue
                { $expr: { $eq: [{ $size: { $ifNull: ['$sub.queue', []] } }, 0] } },
                // Queue not empty + history not empty + last history status != 'in-review'
                {
                  $and: [
                    { $expr: { $gt: [{ $size: { $ifNull: ['$sub.queue', []] } }, 0] } },
                    {
                      $expr: {
                        $gt: [{ $size: { $ifNull: ['$sub.history', []] } }, 0],
                      },
                    },
                    {
                      $expr: {
                        $ne: [
                          {
                            $arrayElemAt: [
                              {
                                $map: {
                                  input: { $ifNull: ['$sub.history', []] },
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
          { $project: { _id: 1 } },
        ]).toArray();

        filter._id = { $in: unallocatedDocs.map(d => d._id) };
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

      // --- Auto Allocate Moderator Filter ---
      if (autoAllocateModeratorFilter && autoAllocateModeratorFilter !== 'all') {
        if (autoAllocateModeratorFilter === 'on') {
          filter.autoAllocateModerator = true;
        } else if (autoAllocateModeratorFilter === 'off') {
          filter.autoAllocateModerator = false;
        }
      }

      // --- Feedback Status Filter ---
      if (feedbackFilter && feedbackFilter !== 'all') {
        const normFeedback = feedbackFilter.toLowerCase();
        if (!filter.$and) filter.$and = [];

        if (normFeedback === 'open') {
          filter.$and.push({
            $or: [
              { feedbacks: { $elemMatch: { status: { $regex: '^open$', $options: 'i' } } } },
              { feedback: { $elemMatch: { status: { $regex: '^open$', $options: 'i' } } } },
            ],
          });
        } else if (normFeedback === 'closed') {
          filter.$and.push({
            $or: [
              {
                feedbacks: {
                  $elemMatch: { status: { $regex: '^closed$', $options: 'i' } },
                  $not: { $elemMatch: { status: { $regex: '^open$', $options: 'i' } } },
                },
              },
              {
                feedback: {
                  $elemMatch: { status: { $regex: '^closed$', $options: 'i' } },
                  $not: { $elemMatch: { status: { $regex: '^open$', $options: 'i' } } },
                },
              },
            ],
          });
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
        filter.status = { $nin: ['non_agri'] };
      }

      // --- Testing tab filter ---
      // Test questions are excluded from every tab by the base `isTesting: {$ne:true}`
      // filter. The Testing tab opts back IN: override it to show ONLY test questions.
      if (is_testing === 'true' || is_testing === true) {
        filter.isTesting = true;
      }

      // --- Training tab filter ---
      // Training questions are excluded from every tab by the base `isTrainingQuestion: {$ne:true}`
      // filter. The Training tab opts back IN: override it to show ONLY training questions.
      if (isTrainingQuestion === 'true' || isTrainingQuestion === true) {
        filter.isTrainingQuestion = true;
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

      // --- Gate keeper "My Assignments" tab: questions assigned to this gate keeper,
      // restricted to the gate-keeper handling statuses. ---
      if (gateKeeperId) {
        if (!filter.$and) filter.$and = [];
        filter.$and.push({ gateKeeperId: new ObjectId(gateKeeperId as string) });
        filter.status = { $in: ['dynamic', 'duplicate', 'queue_duplicate'] };
        delete filter.$or;
        delete filter.pae_review;
      }

      // --- Auditor "My Assignments" tab: questions assigned to this auditor,
      // restricted to the auditor_review status. ---
      if (auditorId) {
        if (!filter.$and) filter.$and = [];
        filter.$and.push({ auditorId: new ObjectId(auditorId as string) });
        filter.status = { $in: ['auditor_review'] };
        delete filter.$or;
        delete filter.pae_review;
      }

      // --- State filter (from body array) ---
      if (body?.states && body.states.length > 0) {
        filter['details.state'] = { $in: body.states };
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
      const approvalCount =
        consecutiveApprovals && consecutiveApprovals !== 'all'
          ? parseInt(consecutiveApprovals, 10)
          : null;
      // --- Consecutive Approvals Filter ---
      if (approvalCount !== null && !isNaN(approvalCount)) {
        // Only exclude closed questions for consecutive approvals
        filter.status = { $not: { $regex: '^closed$', $options: 'i' } };

        const answers = await this.AnswersCollection.aggregate(
          [
            {
              $group: {
                _id: '$questionId',
                latestCreatedAt: { $max: '$createdAt' },
              },
            },
            {
              $lookup: {
                from: 'answers',
                let: { qId: '$_id', created: '$latestCreatedAt' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$questionId', '$$qId'] },
                          { $eq: ['$createdAt', '$$created'] },
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
            { $unwind: '$latestAnswer' },

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
          { allowDiskUse: true },
        ).toArray();

        const approvalFilteredIds = answers.map(a => a.questionId.toString());

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

        if (startDate) filter.createdAt = { $gte: startDate };
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
            { $subtract: ['$closedAt', '$createdAt'] },
            2 * 60 * 60 * 1000, // 2 hours in milliseconds
          ],
        };
      }

      let questionIdsByUser: string[] | null = null;
      if (user && user !== 'all') {
        const submissions = await this.QuestionSubmissionCollection.find({
          'history.updatedBy': new ObjectId(user),
        })
          .project({ questionId: 1 })
          .toArray();

        questionIdsByUser = submissions.map(s => s.questionId.toString());

        if (questionIdsByUser.length === 0) {
          return { questions: [], totalPages: 0, totalCount: 0 };
        }

        filter._id = { $in: questionIdsByUser.map(id => new ObjectId(id)) };
      }

      if (assignedUser && assignedUser !== 'all') {
        const userObjId = new ObjectId(assignedUser);
        const userStr = assignedUser.toString();

        const submissions = await this.QuestionSubmissionCollection.find({
          $or: [
            {
              $and: [
                { history: { $size: 0 } },
                { queue: { $size: 1 } },
                { $or: [{ 'queue.0': userObjId }, { 'queue.0': userStr }] },
              ],
            },
            {
              $and: [
                { history: { $not: { $size: 0 } } },
                {
                  $expr: {
                    $and: [
                      { $eq: [{ $arrayElemAt: ['$history.status', -1] }, 'in-review'] },
                      {
                        $in: [
                          { $arrayElemAt: ['$history.updatedBy', -1] },
                          [userObjId, userStr],
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        })
          .project({ questionId: 1 })
          .toArray();

        const assignedQuestionIds = submissions.map(s => s.questionId.toString());

        if (assignedQuestionIds.length === 0) {
          return { questions: [], totalPages: 0, totalCount: 0 };
        }

        if (filter._id) {
          filter._id = {
            $in: assignedQuestionIds
              .map(id => new ObjectId(id))
              .filter(id => filter._id.$in.some((existing: any) => existing.equals(id))),
          };
        } else {
          filter._id = { $in: assignedQuestionIds.map(id => new ObjectId(id)) };
        }
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

          const submissionQuery: any = { history: { $size: requiredSize } };
          // For levels > 0, only include submissions where the current level is still in-review
          if (numericLevel > 0) {
            submissionQuery[`history.${numericLevel}.status`] = 'in-review';
          }

          const submissions = await this.QuestionSubmissionCollection.find(
            submissionQuery,
          )
            .project({ questionId: 1 })
            .toArray();

          const levelFilteredIds = submissions.map(s =>
            s.questionId.toString(),
          );

          if (levelFilteredIds.length === 0) {
            return { questions: [], totalPages: 0, totalCount: 0 };
          }

          if (filter._id) {
            filter._id = {
              $in: levelFilteredIds
                .map(id => new ObjectId(id))
                .filter(id => filter._id.$in.some((u: any) => u.equals(id))),
            };
          } else {
            filter._id = { $in: levelFilteredIds.map(id => new ObjectId(id)) };
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
          { $match: filter },
          { $count: 'count' },
        ];

        const countResult = await questionsCollection
          .aggregate(countPipeline)
          .toArray();
        totalCount = countResult[0]?.count ?? 0;

        const totalPages = Math.ceil(totalCount / limit);

        if (totalCount === 0) {
          return { questions: [], totalPages, totalCount };
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
          { $match: filter },
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
                        if: { $gt: [{ $size: '$submissionData' }, 0] },
                        then: {
                          $size: { $arrayElemAt: ['$submissionData.history', 0] },
                        },
                        else: 0,
                      },
                    },
                  },
                  in: {
                    $cond: {
                      if: { $lte: ['$$len', 1] }, // 0 or 1 → return 0
                      then: 'Author',
                      else: { $subtract: ['$$len', 1] }, // >=2 → len-1
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
                $ifNull: ['$context', { $arrayElemAt: ['$contextDoc.text', 0] }],
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
                  if: { $gt: [{ $size: '$submission' }, 0] },
                  then: { $arrayElemAt: ['$submission', 0] },
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
                  if: { $ne: ['$submission', null] },
                  then: {
                    _id: { $toString: '$submission._id' },
                    questionId: { $toString: '$submission.questionId' },
                    createdAt: '$submission.createdAt',
                    updatedAt: '$submission.updatedAt',
                    queue: {
                      $map: {
                        input: { $ifNull: ['$submission.queue', []] },
                        as: 'q',
                        in: { $toString: '$$q' },
                      },
                    },
                    history: {
                      $map: {
                        input: { $ifNull: ['$submission.history', []] },
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
                  input: { $ifNull: ['$authors_history', []] },
                  as: 'ah',
                  in: {
                    authorId: {
                      $toString: { $ifNull: ['$$ah.authorId', '$$ah.authorId'] },
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
              score: { $meta: 'vectorSearchScore' },
            },
          },
          {
            $addFields: {
              statusOrder: {
                $cond: {
                  if: { $eq: [{ $toLower: '$status' }, 'closed'] },
                  then: 1,
                  else: 0,
                },
              },
            },
          },
          { $sort: { statusOrder: 1, score: -1 } },
          { $skip: (page - 1) * limit },
          { $limit: limit },
        ];

        result = await questionsCollection.aggregate(pipeline).toArray();

        const formattedQuestions: IQuestion[] = result.map((q: any) => ({
          ...q,
          _id: q._id.toString(),
          details: { ...q.details },
        }));

        return { questions: formattedQuestions, totalPages, totalCount };
      }

      if (search && search.trim() !== '') {
        // A search must surface ANY matching question that exists in the DB,
        // independent of every tab / scope / filter (status, source, PAE-review,
        // moderator assignment, crop, date range, etc.). So discard the entire
        // accumulated filter and match on the search term alone — only the
        // isTesting exclusion is kept so seeded test data never leaks in.
        for (const key of Object.keys(filter)) delete filter[key];
        filter.isTesting = { $ne: true };

        // Escape special regex characters so literal strings like "How to control weeds?"
        // are matched as-is rather than being interpreted as regex patterns.
        const escapedSearch = escapeRegex(search.trim());
        filter.$or = [
          { question: { $regex: escapedSearch, $options: 'i' } },
          { 'details.crop': { $regex: escapedSearch, $options: 'i' } },
          { 'details.state': { $regex: escapedSearch, $options: 'i' } },
          { 'details.domain': { $regex: escapedSearch, $options: 'i' } },
          { threadId: { $regex: escapedSearch, $options: 'i' } },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: '$_id' },
                regex: escapedSearch,
                options: 'i',
              },
            },
          },
        ];
      }

      totalCount = await questionsCollection.countDocuments(filter);
      const totalPages = Math.ceil(totalCount / limit);

      // Determine sort order
      // let sortStage: any = { statusOrder: 1, createdAt: -1, _id: -1 };
      let sortStage: any = { createdAt: -1, _id: -1 };
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
          sortStage = { statusOrder: 1, question: sortOrder, _id: -1 };
        } else if (field === 'state') {
          sortStage = { statusOrder: 1, 'details.state': sortOrder, _id: -1 };
        } else if (field === 'crop') {
          sortStage = { statusOrder: 1, 'details.crop': sortOrder, _id: -1 };
        } else if (field === 'domain') {
          sortStage = { statusOrder: 1, 'details.domain': sortOrder, _id: -1 };
        } else if (field === 'priority') {
          needsPriorityMapping = true;
          sortStage = { statusOrder: 1, priorityOrder: sortOrder, _id: -1 };
        } else if (field === 'status') {
          sortStage = { statusOrder: sortOrder, _id: -1 };
        } else if (field === 'answers') {
          sortStage = { statusOrder: 1, totalAnswersCount: sortOrder, _id: -1 };
        } else if (field === 'created') {
          sortStage = { statusOrder: 1, createdAt: sortOrder, _id: -1 };
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
        { $match: filter },
        {
          $addFields: {
            statusOrder: {
              $switch: {
                branches: [
                  { case: { $eq: [{ $toLower: '$status' }, 'open'] }, then: 1 },
                  { case: { $eq: [{ $toLower: '$status' }, 'delayed'] }, then: 2 },
                  { case: { $eq: [{ $toLower: '$status' }, 're-routed'] }, then: 3 },
                  { case: { $eq: [{ $toLower: '$status' }, 'in-review'] }, then: 4 },
                  { case: { $eq: [{ $toLower: '$status' }, 'closed'] }, then: 5 },
                  { case: { $eq: [{ $toLower: "$status" }, "hold"] }, then: 6 },
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
                  { case: { $eq: ['$priority', 'critical'] }, then: 1 },
                  { case: { $eq: ['$priority', 'high'] }, then: 2 },
                  { case: { $eq: ['$priority', 'medium'] }, then: 3 },
                  { case: { $eq: ['$priority', 'low'] }, then: 4 },
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
                        if: { $gt: [{ $size: '$submissionData' }, 0] },
                        then: {
                          $size: { $arrayElemAt: ['$submissionData.history', 0] },
                        },
                        else: 0,
                      },
                    },
                  },
                  in: {
                    $cond: {
                      if: { $lte: ['$$len', 1] },
                      then: 0,
                      else: { $subtract: ['$$len', 1] },
                    },
                  },
                },
              },
            },
          },
        );
      }

      aggregationPipeline.push(
        { $sort: sortStage },
        { $skip: (page - 1) * limit },
        { $limit: limit },
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
                        if: { $gt: [{ $size: '$submissionData' }, 0] },
                        then: {
                          $size: { $arrayElemAt: ['$submissionData.history', 0] },
                        },
                        else: 0,
                      },
                    },
                  },
                  in: {
                    $cond: {
                      if: { $lte: ['$$len', 1] }, // length 0 or 1 → return 0
                      then: 'Author',
                      else: { $subtract: ['$$len', 1] }, // length >=2 → length-1
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
                $ifNull: ['$context', { $arrayElemAt: ['$contextDoc.text', 0] }],
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
                  if: { $gt: [{ $size: '$submission' }, 0] },
                  then: { $arrayElemAt: ['$submission', 0] },
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
                  if: { $ne: ['$submission', null] },
                  then: {
                    _id: { $toString: '$submission._id' },
                    questionId: { $toString: '$submission.questionId' },
                    createdAt: '$submission.createdAt',
                    updatedAt: '$submission.updatedAt',
                    queue: {
                      $map: {
                        input: { $ifNull: ['$submission.queue', []] },
                        as: 'q',
                        in: { $toString: '$$q' },
                      },
                    },
                    history: {
                      $map: {
                        input: { $ifNull: ['$submission.history', []] },
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
                  input: { $ifNull: ['$authors_history', []] },
                  as: 'ah',
                  in: {
                    authorId: {
                      $toString: { $ifNull: ['$$ah.authorId', '$$ah.authorId'] },
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
        details: { ...q.details },
      }));

      return { questions: formattedQuestions, totalPages, totalCount };
    } catch (error) {
      throw new InternalServerError(`Failed to get Questions: ${error}`);
    }
  }

export async function getAllocatedQuestions(
  this: QuestionRepository,
    userId: string,
    query: GetDetailedQuestionsQuery,
    session?: ClientSession,
    body?: AllocatedQuestionsBodyDto,
  ): Promise<QuestionResponse[]> {
    try {
      await this.init();

      const { filter: sortFilter, page = 1, limit = 10 } = query;

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
            historyCount: { $size: { $ifNull: ['$history', []] } },
            lastHistory: { $arrayElemAt: ['$history', -1] },
            firstInQueue: { $arrayElemAt: ['$queue', 0] },
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
                    { $eq: [query.review_level, 'all'] },

                    // Author → historyCount = 0
                    {
                      $and: [
                        { $eq: [query.review_level, 'Author'] },
                        { $eq: ['$historyCount', 0] },
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
                                      { $split: [query.review_level, ' '] },
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
                        { $eq: ['$lastHistory.updatedBy', userObjectId] },
                        { $eq: ['$lastHistory.status', 'in-review'] },
                        {
                          $or: [
                            { $not: ['$lastHistory.answer'] },
                            { $eq: ['$lastHistory.answer', null] },
                            { $eq: ['$lastHistory.answer', ''] },
                          ],
                        },
                      ],
                    },

                    // Case 2: First reviewer
                    {
                      $and: [
                        { $eq: ['$historyCount', 0] },
                        { $eq: ['$firstInQueue', userObjectId] },
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

      const assignedAtByQuestionId = new Map(
        submissions.map((sub: any) => {
          const historyCount = sub?.historyCount ?? 0;
          const assignedAt = historyCount === 0
            ? sub?.currentExpertAllocatedAt
            : (sub?.lastHistory?.assignedAt ?? sub?.lastHistory?.createdAt);
          return [sub?.questionId?.toString(), assignedAt];
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

      const reroutedAssignedAtByQuestionId = new Map();
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
          { projection: { questionId: 1, reroutes: 1 }, session },
        ).toArray();

        reroutedDocs.forEach(doc => {
          if (doc?.questionId) {
            const pendingReroute = doc.reroutes
              ?.filter((r: any) => r.reroutedTo?.toString() === userObjectId.toString() && r.status === 'pending')
              ?.sort((a: any, b: any) => new Date(b.reroutedAt).getTime() - new Date(a.reroutedAt).getTime())[0];
            if (pendingReroute) {
              reroutedAssignedAtByQuestionId.set(doc.questionId.toString(), pendingReroute.reroutedAt);
            }
          }
        });

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
        _id: { $in: questionIdsToAttempt },
      };

      // Normal allocations must be in an open state. Rerouted questions are
      // typically already in-review/closed, so let them bypass that restriction
      // while preserving the original status filter for everything else.
      if (reroutedQuestionIdSet.size > 0) {
        filter.$or = [
          { _id: { $in: reroutedQuestionIds } },
          { status: { $nin: ['closed', 'in-review'] } },
        ];
      } else {
        filter.status = { $nin: ['closed', 'in-review'] };
      }

      // Apply preferences filters
      if (query.source && query.source !== 'all') {
        filter.source = {
          $regex: `^${escapeRegex(query.source)}$`,
          $options: 'i',
        };
      }
      if (body?.states && body.states.length > 0) {
        filter['details.state'] = { $in: body.states };
      }
      if (body?.crops && body.crops.length > 0) {
        filter['details.crop'] = { $in: body.crops };
      }

      const pipeline: any = [{ $match: filter }];

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

      pipeline.push({ $sort: { priorityOrder: 1, createdAt: 1, _id: 1 } });

      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limit });

      pipeline.push({
        $project: {
          id: { $toString: '$_id' },
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
        { session },
      ).toArray();
      return results.map((q: any) => {
        const isRerouted = reroutedQuestionIdSet.has(q.id);
        const assignedAt = isRerouted
          ? reroutedAssignedAtByQuestionId.get(q.id)
          : assignedAtByQuestionId.get(q.id);
        return {
          ...q,
          assignedAt: assignedAt ?? null,
          review_level_number: isRerouted
            ? 'rerouted'
            : reviewLevelByQuestionId.get(q.id) ?? 'Author',
        };
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch unanswered questions: ${error}`,
      );
    }
  }

export async function getQuestionWithFullData(
  this: QuestionRepository,
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
        { projection: { userId: 0, embedding: 0 } },
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
        _id: { $in: uniqueAnswerIds },
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
        answerId: { $in: uniqueAnswerIds },
      })
        .sort({ createdAt: -1 })
        .toArray();

      const reviewerIds: ObjectId[] = reviews
        .map(r => r.reviewerId.toString())
        .filter(Boolean)
        .map(id => new ObjectId(id));

      const reviewerUsers = await this.UsersCollection.find({
        _id: { $in: reviewerIds },
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
      // and `duplicate_closed` (duplicate questions finalised the same way) are treated the
      // same as `closed` so their final answer shows in the timeline too.
      let closedFinalAnswer: any = null;
      if (
        (question.status === 'closed' ||
          question.status === 'dynamic_closed' ||
          question.status === 'duplicate_closed') &&
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
              { _id: refId },
              { projection: { question: 1, status: 1, details: 1, text: 1 } },
            ) as any,
            this.AnswersCollection.findOne(
              { questionId: refId, isFinalAnswer: true },
              { projection: { sources: 1 } },
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
      const { aiApprovedAnswer, aiInitialAnswer, ...rest } = question;

      const result = {
        ...{
          ...rest,
          aiInitialAnswer:
            aiInitialAnswer && aiInitialAnswer.trim()
              ? aiInitialAnswer
              : aiApprovedAnswer,
          contextId: question.contextId?.toString(),
          isAutoAllocate: question.isAutoAllocate ?? true,
          referenceQuestionId: question.referenceQuestionId
            ? question.referenceQuestionId.toString()
            : undefined,
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

export async function getQuestionsAndReviewLevel(
  this: QuestionRepository,
    query: GetDetailedQuestionsQuery & { searchEmbedding: number[] | null },
    session?: ClientSession,
  ): Promise<QuestionLevelResponse> {
    await this.init();
    const { page = 1, limit = 10, search, sort = '' } = query;
    const skip = (page - 1) * limit;

    const { filter } = await buildQuestionFilter(
      query,
      this.QuestionSubmissionCollection,
      this.AnswersCollection,
    );
    if (search && search.trim().length) {
      filter.question = { $regex: search.trim(), $options: 'i' };
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

      { $unwind: { path: '$submission', preserveNullAndEmptyArrays: true } },

      //normalize date
      {
        $addFields: {
          submissionCreatedAt: {
            $cond: [
              { $eq: [{ $type: '$submission.createdAt' }, 'string'] },
              { $toDate: '$submission.createdAt' },
              '$submission.createdAt',
            ],
          },

          history: {
            $map: {
              input: { $ifNull: ['$submission.history', []] },
              as: 'h',
              in: {
                $mergeObjects: [
                  '$$h',
                  {
                    createdAt: {
                      $cond: [
                        { $eq: [{ $type: '$$h.createdAt' }, 'string'] },
                        { $toDate: '$$h.createdAt' },
                        '$$h.createdAt',
                      ],
                    },
                    updatedAt: {
                      $cond: [
                        { $eq: [{ $type: '$$h.updatedAt' }, 'string'] },
                        { $toDate: '$$h.updatedAt' },
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
              { $gt: [{ $size: '$history' }, 0] },
              { $subtract: [{ $size: '$history' }, 1] },
              -1,
            ],
          },

          // Author timer start time logic (same as getTimerStartTime)
          authorTimerStartTime: {
            $let: {
              vars: {
                isAuthor: {
                  $and: [
                    { $gt: [{ $size: { $ifNull: ['$submission.queue', []] } }, 0] },
                    { $eq: [{ $size: '$history' }, 0] },
                  ],
                },
                lastAuthorEntry: {
                  $cond: [
                    { $gt: [{ $size: { $ifNull: ['$authors_history', []] } }, 0] },
                    {
                      $arrayElemAt: [
                        { $ifNull: ['$authors_history', []] },
                        {
                          $subtract: [
                            { $size: { $ifNull: ['$authors_history', []] } },
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
                              { $size: { $ifNull: ['$authors_history', []] } },
                              0,
                            ],
                          },
                          { $ne: ['$$lastAuthorEntry', null] },
                        ],
                      },
                      '$$lastAuthorEntry.createdAt',
                      {
                        $cond: [
                          { $ne: ['$submissionCreatedAt', null] },
                          '$submissionCreatedAt',
                          '$createdAt',
                        ],
                      },
                    ],
                  },
                  {
                    $cond: [
                      { $gt: [{ $size: '$history' }, 0] },
                      {
                        $let: {
                          vars: {
                            lastHistoryEntry: {
                              $arrayElemAt: [
                                '$history',
                                { $subtract: [{ $size: '$history' }, 1] },
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
              input: { $range: [0, 11] },
              as: 'idx',

              in: {
                $let: {
                  vars: {
                    hist: { $arrayElemAt: ['$history', '$$idx'] },
                    nextHist: {
                      $arrayElemAt: ['$history', { $add: ['$$idx', 1] }],
                    },

                    isAuthorNoHistory: {
                      $and: [
                        { $eq: ['$$idx', 0] },
                        { $eq: ['$currentLevel', -1] },
                        { $ne: ['$submissionCreatedAt', null] },
                      ],
                    },
                  },

                  in: {
                    $let: {
                      vars: {
                        // pending only applies to last level
                        isPending: {
                          $and: [
                            { $eq: ['$$idx', '$currentLevel'] },
                            { $ne: ['$$hist', null] },
                            {
                              $or: [
                                { $eq: ['$$hist.updatedAt', null] },
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
                                in: { $max: [0, '$$rawDiff'] },
                              },
                            },

                            // normal
                            {
                              $cond: [
                                { $eq: ['$$idx', 0] },

                                {
                                  $cond: [
                                    {
                                      $and: [
                                        { $ne: ['$$hist', null] },
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
                                        in: { $max: [0, '$$rawDiff'] },
                                      },
                                    },
                                    null,
                                  ],
                                },

                                // ===== NON-AUTHOR =====
                                {
                                  $cond: [
                                    { $lt: ['$$idx', '$currentLevel'] },

                                    // non-last
                                    {
                                      $cond: [
                                        {
                                          $and: [
                                            { $ne: ['$$hist', null] },
                                            { $ne: ['$$nextHist', null] },
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
                                            { $ne: ['$$hist', null] },
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
                                            { $ne: ['$$hist', null] },
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
                            { $eq: ['$$idx', 0] },
                            'author',
                            { $concat: ['level ', { $toString: '$$idx' }] },
                          ],
                        },

                        value: {
                          $cond: [
                            {
                              $and: [
                                { $gt: ['$$idx', '$currentLevel'] },
                                { $not: '$$isAuthorNoHistory' },
                              ],
                            },
                            'NA',

                            {
                              $cond: [
                                { $eq: ['$$secs', null] },
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
                                          $mod: [{ $divide: ['$$secs', 60] }, 60],
                                        },
                                      },
                                      s: { $mod: ['$$secs', 60] },
                                    },

                                    in: {
                                      time: {
                                        $concat: [
                                          { $toString: '$$h' },
                                          ':',
                                          { $toString: '$$m' },
                                          ':',
                                          { $toString: '$$s' },
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
                  cond: { $ne: ['$$s', null] },
                },
              },
            },
          },
        },
        { $sort: { totalTurnAround: sortDir } },
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
        { $sort: { sortValue: sortDir } },
      );
    } else {
      dataPipeLine.push({ $sort: { createdAt: -1 } });
    }
    dataPipeLine.push(
      { $skip: skip },
      { $limit: limit },

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
      { $match: filter },

      {
        $facet: {
          metadata: [{ $count: 'totalDocs' }],
          data: dataPipeLine,
        },
      },
    ];
    const result = await this.QuestionCollection.aggregate(pipeline, {
      session,
    }).toArray();

    const meta = result[0]?.metadata?.[0] ?? { totalDocs: 0 };
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

export async function getQuestionsWithAnswerDetails(
  this: QuestionRepository,
    questionIds: string[],
  ): Promise<ICheckStatusResponse[]> {
    await this.init();
    const objectIds = questionIds.map(id => new ObjectId(id));

    const data = await this.QuestionCollection.aggregate([
      {
        $match: {
          _id: { $in: objectIds },
        },
      },

      // Lookup FINAL ANSWERS ONLY
      {
        $lookup: {
          from: 'answers',
          let: { qId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$questionId', '$$qId'] },
                    { $eq: ['$isFinalAnswer', true] },
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
                    input: { $ifNull: ['$sources', []] },
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
                        { $ifNull: ['$author.firstName', ''] },
                        ' ',
                        { $ifNull: ['$author.lastName', ''] },
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
          finalAnswer: { $arrayElemAt: ['$finalAnswer', 0] },
        },
      },

      // Final response shape
      {
        $project: {
          _id: 0,

          question_id: { $toString: '$_id' },

          status: {
            $cond: {
              if: { $ifNull: ['$finalAnswer', false] },
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

export async function getAllocatedQuestionPage(
  this: QuestionRepository,
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
          lastHistory: { $arrayElemAt: ['$history', -1] },
          historyCount: { $size: { $ifNull: ['$history', []] } },
          firstInQueue: { $arrayElemAt: ['$queue', 0] },
        },
      },
      {
        $match: {
          $or: [
            {
              'lastHistory.updatedBy': userObjectId,
              'lastHistory.status': 'in-review',
              $or: [
                { 'lastHistory.answer': { $exists: false } },
                { 'lastHistory.answer': null },
                { 'lastHistory.answer': '' },
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
      status: { $in: ['open', 'delayed'] },
      _id: { $in: questionIdsToAttempt },
    };

    // 3. Recreate the same sorting pipeline
    const sortedQuestions = await this.QuestionCollection.aggregate([
      { $match: filter },
      {
        $addFields: {
          priorityOrder: {
            $switch: {
              branches: [
                { case: { $eq: ['$priority', 'critical'] }, then: 1 },
                { case: { $eq: ['$priority', 'high'] }, then: 2 },
                { case: { $eq: ['$priority', 'medium'] }, then: 3 },
                { case: { $eq: ['$priority', 'low'] }, then: 4 },
              ],
              default: 5,
            },
          },
        },
      },
      { $sort: { priorityOrder: 1, createdAt: 1, _id: 1 } },
      { $project: { _id: 1 } },
    ]).toArray();

    const index = sortedQuestions.findIndex(
      q => q._id.toString() === questionId,
    );

    if (index === -1) return 1;

    const limit = 10;
    return Math.floor(index / limit) + 1;
  }
