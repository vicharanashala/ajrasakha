import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {BadRequestError, NotFoundError} from 'routing-controllers';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IFeedbackRepository} from '#root/shared/database/interfaces/IFeedbackRepository.js';
import {NotificationService} from '#root/modules/notification/services/NotificationService.js';
import {IFeedback, IQuestion} from '#root/shared/interfaces/models.js';
import {isQuestionMatchForPaeExpert} from '../helpers/duplicateQuestionHelper.js';
import {
  QueueQuestionItem,
  QueueExpertItem,
  PaeValidationQueueDetails,
} from '../interfaces/IQuestionService.js';
import type {
  PaeValidationQuestion,
  PaeValidationAnswer,
  PaeValidationAssignedQuestionsResponse,
} from '../interfaces/QuestionValidationTypes.js';
import {resolveExpertMeta} from './helpers/reportHelpers.js';
import {submissionToQueueItem} from './helpers/queueItem.js';

/**
 * PAE (Pre-Answer Expert) validation workflow extracted from QuestionService:
 * the review-assignment cron, manual reviewer assignment/removal, the reviewer's
 * assigned-questions view, processing a validation decision, timelines and queue
 * details. QuestionService keeps thin delegating wrappers for each of these.
 */
@injectable()
export class PaeValidationService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(CORE_TYPES.FeedbackRepository)
    private readonly feedbackRepo: IFeedbackRepository,

    @inject(GLOBAL_TYPES.NotificationService)
    private readonly notificationService: NotificationService,

    @inject(GLOBAL_TYPES.Database)
    mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  /**
   * Cron job to assign questions pending PAE validation to available PAE experts.
   */
  async runPaeValidationQueueCron(): Promise<{
    assigned: number;
    availableWaiting: number;
    failedAssignments: number;
  }> {
    console.log(
      '[PaeValidationQueue] Starting PAE validation queue assignment check...',
    );

    try {
      const pendingQuestions =
        await this.questionRepo.findQuestionsPendingPaeValidation();
      const availableExperts = await this.userRepo.findAvailablePaeExperts();

      if (!pendingQuestions.length) {
        console.log(
          '[PaeValidationQueue] No pending questions for PAE validation',
        );
        return {
          assigned: 0,
          availableWaiting: availableExperts.length,
          failedAssignments: 0,
        };
      }

      if (!availableExperts.length) {
        console.log('[PaeValidationQueue] No available PAE experts');
        return {assigned: 0, availableWaiting: 0, failedAssignments: 0};
      }

      console.log(
        `[PaeValidationQueue] Found ${pendingQuestions.length} pending questions and ${availableExperts.length} available PAE experts`,
      );

      const claimedQuestionIds = new Set<string>();
      let assigned = 0;
      let availableWaiting = 0;
      let failedAssignments = 0;

      for (const expert of availableExperts) {
        const expertId = expert._id!.toString();

        const matchedQuestion = pendingQuestions.find(
          q =>
            !claimedQuestionIds.has(q._id!.toString()) &&
            isQuestionMatchForPaeExpert(q, expert),
        );

        if (!matchedQuestion) {
          console.log(
            '[PaeValidationQueue] No matching question found for PAE expert',
            expertId,
          );
          availableWaiting++;
          continue;
        }

        const questionId = matchedQuestion._id!.toString();
        claimedQuestionIds.add(questionId);

        try {
          await this._withTransaction(async (session: ClientSession) => {
            await this.questionRepo.updatePaeValidationStatus(
              questionId,
              'in-progress',
              session,
            );
            await this.questionRepo.addPaeValidationEntry(
              questionId,
              {
                paeAssignedAt: new Date(),
                paeId: expertId,
                paeStatus: 'in-progress',
                paeFinishedAt: null,
              },
              session,
            );
            await this.userRepo.addPaeValidationAssigned(
              expertId,
              questionId,
              session,
            );
          });

          await this.notificationService.saveTheNotifications(
            `A question (${matchedQuestion.question.substring(0, 50)}...) has been assigned to you for PAE validation`,
            'Question Assigned for PAE Validation',
            questionId,
            expertId,
            'pae_validation',
          );

          console.log(
            `[PaeValidationQueue] Assigned question ${questionId} → PAE expert ${expertId}`,
          );
          assigned++;
        } catch (error: any) {
          console.error(
            `[PaeValidationQueue] Failed to assign question ${questionId} to ${expertId}:`,
            error?.message,
          );
          claimedQuestionIds.delete(questionId);
          failedAssignments++;
        }
      }

      console.log(
        `[PaeValidationQueue] Done: assigned=${assigned}, availableWaiting=${availableWaiting}, failedAssignments=${failedAssignments}`,
      );
      return {assigned, availableWaiting, failedAssignments};
    } catch (error: any) {
      console.error(
        '[PaeValidationQueue] PAE validation queue cron failed:',
        error?.message,
      );
      throw new BadRequestError(
        `PAE validation queue cron failed: ${error?.message}`,
      );
    }
  }

  //pae validation timeline
  async getPaeValidationTimeline(questionId: string): Promise<{
    autoAllocatePaeValidationExpert: boolean;
    hasOpenRound: boolean;
    reviews: {
      index: number;
      paeId: string;
      paeName: string;
      paeAssignedAt: Date;
      paeFinishedAt: Date | null;
      paeStatus: string;
    }[];
  }> {
    const [question, submission] = await Promise.all([
      this.questionRepo.getById(questionId),
      this.questionSubmissionRepo.getByQuestionId(questionId),
    ]);

    const rounds = ((submission as any)?.paeValidation ?? []) as any[];

    const names = await resolveExpertMeta(this.userRepo, 
      rounds.map(r => r.paeId?.toString()).filter(Boolean),
    );

    return {
      autoAllocatePaeValidationExpert:
        (question as any)?.autoAllocatePaeValidationExpert === true,

      hasOpenRound:
        Array.isArray(rounds) &&
        rounds.some(r => r?.paeStatus === 'in-progress'),

      reviews: rounds
        .map((r, i) => ({
          index: i,
          paeId: r.paeId?.toString() ?? '',
          paeName: names.get(r.paeId?.toString())?.name ?? 'Unknown',
          paeAssignedAt: r.paeAssignedAt,
          paeFinishedAt: r.paeFinishedAt ?? null,
          paeStatus: r.paeStatus ?? '',
        }))
        .sort(
          (a, b) =>
            new Date(a.paeAssignedAt).getTime() -
            new Date(b.paeAssignedAt).getTime(),
        ),
    };
  }

  /** Manually assign OR reassign the pae validation reviewer (admin/moderator). When a round
   *  is already open it repoints that round to the new reviewer and releases the old one;
   *  otherwise it opens a fresh round. Respects the same one-at-a-time;
   *  rules as the cron. */
  async assignPaeValidationReviewerManually(
    questionId: string,
    userId: string,
    index?: number,
  ): Promise<{success: true}> {
    await this._withTransaction(async session => {
      // Don't allow assigning a reviewer once the feedback is closed (no open
      // feedback left on the question).
      // const question = await this.questionRepo.getById(questionId);
      // const feedbacks = ((question as any)?.feedbacks ?? []) as any[];
      // const hasOpenFeedback =
      //   Array.isArray(feedbacks) && feedbacks.some(f => f?.status === 'open');
      // if (!hasOpenFeedback) {
      //   throw new BadRequestError('This feedback is already closed.');
      // }

      const question = await this.questionRepo.getById(questionId);

      if ((question as any)?.paeValidation === 'completed')
        throw new BadRequestError(
          'This question has already completed PAE validation.',
        );

      const submission =
        await this.questionSubmissionRepo.getByQuestionId(questionId);
      const rounds = ((submission as any)?.paeValidation ?? []) as any[];

      // Resolve the round being changed: an explicit index (one of several rounds)
      // or the single open round when none is given.
      const targetIndex =
        typeof index === 'number' && index >= 0
          ? index
          : rounds.findIndex(r => !r.paeFinishedAt);
      const targetRound = targetIndex >= 0 ? rounds[targetIndex] : undefined;

      if (targetRound && targetRound.paeFinishedAt) {
        throw new BadRequestError(
          'That pae validation review is already completed and cannot be reassigned.',
        );
      }
      const oldReviewerId = targetRound?.paeId?.toString();
      if (oldReviewerId === userId) {
        return; // already assigned to this reviewer — no-op
      }

      // Claim the new reviewer's slot first (fails if they're not free). Manual claim
      // lets an admin/moderator pick ANY active user (not restricted to mod/auditor),
      // still one feedback at a time.
      const claimed = await this.userRepo.addPaeValidationAssigned(
        userId,
        questionId,
        session,
      );
      if (!claimed) {
        throw new BadRequestError(
          'Selected user is not available (already holds a pae validation, or is inactive/blocked).',
        );
      }
      // Fresh assignment: open a new round.
      const assigned =
        await this.questionSubmissionRepo.assignPaeValidationReviewer(
          questionId,
          userId,
          new Date(),
          session,
        );
      if (!assigned) {
        throw new BadRequestError(
          'This question already has an open pae validation review.',
        );
      }

      if (oldReviewerId) {
        await this.userRepo.removePaeValidationAssigned(
          oldReviewerId,
          questionId,
          session,
        );
      }

      await this.questionRepo.updatePaeValidationStatus(
        questionId,
        'in-progress',
        session,
      );
    });
    return {success: true};
  }

  //Remove an OPEN pae-validation--review round by index (admin/moderator/etc).
  async removePaeValidationReviewer(
    questionId: string,
    index: number,
  ): Promise<{success: true}> {
    await this._withTransaction(async session => {
      const submission =
        await this.questionSubmissionRepo.getByQuestionId(questionId);
      const rounds = ((submission as any)?.paeValidation ?? []) as any[];
      const round = rounds[index];
      if (!round) {
        throw new BadRequestError(
          'No pae validation review found at that position.',
        );
      }
      if (round.paeFinishedAt) {
        throw new BadRequestError(
          'A completed pae validation review cannot be removed.',
        );
      }
      const removed =
        await this.questionSubmissionRepo.removePaeValidationReviewByIndex(
          questionId,
          index,
          session,
        );
      if (!removed) {
        throw new BadRequestError(
          'Could not remove the pae validation review.',
        );
      }

      await this.questionRepo.updatePaeValidationStatus(
        questionId,
        'pending',
        session,
      );
      const reviewerId = round.paeId?.toString();
      if (reviewerId) {
        await this.userRepo.removePaeValidationAssigned(
          reviewerId,
          questionId,
          session,
        );
      }
    });
    return {success: true};
  }

  /** Get all questions assigned to a PAE expert for validation, with pagination.
   *  Includes answer data and sources from the answer collection.
   */
  async getPaeValidationAssignedQuestions(
    paeExpertId: string,
    page: number,
    limit: number,
  ): Promise<PaeValidationAssignedQuestionsResponse> {
    // Get the user to check paeValidationAssigned
    const user = await this.userRepo.findById(paeExpertId);

    if (!user) {
      throw new NotFoundError(`User with ID ${paeExpertId} not found`);
    }

    // Get the question IDs from paeValidationAssigned
    const questionIds = (user.paeValidationAssigned || []).map(id => {
      if (typeof id === 'string') {
        return new ObjectId(id);
      }
      return id as ObjectId;
    });

    if (questionIds.length === 0) {
      return {
        questions: [],
        totalCount: 0,
        totalPages: 0,
        currentPage: page,
      };
    }

    // Get paginated questions with answers joined in a single aggregation call
    const {
      questions: paginatedQuestions,
      totalCount,
      totalPages,
      currentPage,
    } = await this.questionRepo.findByIdsWithAnswers(questionIds, page, limit);

    // Transform the results to match the expected response format
    const questionsWithAnswers: PaeValidationQuestion[] =
      paginatedQuestions.map(q => ({
        _id: q._id.toString(),
        question: q.question,
        status: q.status,
        source: q.source,
        priority: q.priority,
        totalAnswersCount: q.totalAnswersCount,
        createdAt: q.createdAt || new Date(),
        state: q.state,
        district: q.district,
        crop: q.crop,
        domain: q.domain,
        season: q.season,
        normalised_crop: q.normalised_crop,
        answer: q.answer
          ? {
              _id: q.answer._id.toString(),
              answer: q.answer.answer,
              sources: q.answer.sources || [],
              authorId: q.answer.authorId.toString(),
              isFinalAnswer: q.answer.isFinalAnswer,
            }
          : undefined,
      }));

    return {
      questions: questionsWithAnswers,
      totalCount,
      totalPages,
      currentPage,
    };
  }

  /**
   * Process a PAE validation decision (approve or provide feedback).
   *
   * When status is 'approve':
   * - Updates question.paeValidation to 'completed'
   * - Removes the question from the user's paeValidationAssigned array
   * - Updates the question submission's paeValidation array entry to 'completed' with paeFinishedAt
   *
   * When status is 'feedback':
   * - Currently just logs the feedback; can be extended to store feedback in the submission
   * - The question remains in the user's paeValidationAssigned for further work
   */
  async processPaeValidation(
    paeExpertId: string,
    questionId: string,
    status: 'approve' | 'feedback',
    suggestionComment?: string,
    suggestionLink?: string,
    answerId?: string,
    suggestionSourceName?: string,
  ): Promise<{success: boolean; message: string}> {
    // Verify the question exists and is assigned to this PAE expert
    const question = await this.questionRepo.getById(questionId);
    if (!question) {
      throw new NotFoundError(`Question with ID ${questionId} not found`);
    }

    // Check if the question is in paeValidation status (either pending or in-progress)
    if (!question.paeValidation || question.paeValidation === 'completed') {
      throw new BadRequestError(
        `Question ${questionId} is not in a valid state for PAE validation`,
      );
    }

    // Verify the user has this question assigned
    const user = await this.userRepo.findById(paeExpertId);
    if (!user) {
      throw new NotFoundError(`User with ID ${paeExpertId} not found`);
    }

    const questionIds = (user.paeValidationAssigned || []).map(id =>
      typeof id === 'string' ? id : (id as ObjectId).toString(),
    );

    if (!questionIds.includes(questionId)) {
      throw new BadRequestError(
        `Question ${questionId} is not assigned to this PAE expert`,
      );
    }

    if (status === 'approve') {
      // Use transaction to update all related documents atomically
      await this._withTransaction(async (session: ClientSession) => {
        // 1. Update question.paeValidation to 'completed'
        await this.questionRepo.updatePaeValidationStatus(
          questionId,
          'completed',
          session,
        );

        // 2. Remove the question from user's paeValidationAssigned array
        await this.userRepo.removePaeValidationAssigned(
          paeExpertId,
          questionId,
          session,
        );

        // 3. Update the question submission's paeValidation array entry to 'completed'
        await this.questionSubmissionRepo.updatePaeValidationStatus(
          questionId,
          paeExpertId,
          'completed',
          new Date(),
          session,
        );
      });

      return {
        success: true,
        message: `Question ${questionId} has been approved and PAE validation completed`,
      };
    } else {
      // Status is 'feedback' - store the feedback and keep the question assigned
      const now = new Date();

      await this._withTransaction(async (session: ClientSession) => {
        // 1. Update the question submission's paeValidation array entry with paeFinishedAt
        // (Mark this validation round as finished even though we're providing feedback)
        await this.questionRepo.updatePaeValidationStatus(
          questionId,
          'completed',
          session,
        );
        await this.questionSubmissionRepo.updatePaeValidationStatus(
          questionId,
          paeExpertId,
          'completed',
          now,
          session,
        );

        await this.userRepo.removePaeValidationAssigned(
          paeExpertId,
          questionId,
          session,
        );

        // 2. Create a new feedback entry in the feedbacks collection
        const feedbackData: Omit<IFeedback, '_id'> = {
          questionId: new ObjectId(questionId),
          userId: {
            name: `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`.trim(),
            email: user.email,
          },
          type: 'PAE_VALIDATION',
          comment: suggestionComment || '',
          answerId: answerId ? new ObjectId(answerId) : undefined,
          link: suggestionLink
            ? {
                name: suggestionSourceName || suggestionLink,
                source: suggestionLink,
              }
            : undefined,
          status: 'open',
          createdAt: now,
        };

        const createdFeedback = await this.feedbackRepo.create(
          feedbackData,
          session,
        );

        await this.questionRepo.updateQuestion(
          questionId,
          {autoAllocateFeedback: true} as any,
          session,
        );

        // 3. Update the question's feedbacks array
        await this.questionRepo.addFeedback(
          questionId,
          {
            source: 'PAE_Validation',
            status: 'open',
          },
          session,
        );

        console.log(
          `[processPaeValidation] Feedback created for question ${questionId} by PAE expert ${paeExpertId}`,
          {
            feedbackId: createdFeedback._id?.toString(),
            suggestionComment,
            suggestionLink,
            suggestionSourceName,
          },
        );
      });

      // Note: Question remains in user's paeValidationAssigned for further work
      // The moderator will need to address the feedback

      return {
        success: true,
        message: `Feedback noted for question ${questionId}. The question remains assigned for further work.`,
      };
    }
  }

    /** Data for the dedicated pae validation tab. **/

  async getPaeValidationQueueDetails(
    params?: { section?: 'waitingAuto' | 'waitingManual' | 'assigned'; page?: number; limit?: number }
  ): Promise<PaeValidationQueueDetails> {
    // Get paginated questions with TRUE server-side pagination.
    // The repository handles: fetching only needed docs, categorizing in MongoDB, skip/limit in MongoDB, counting in MongoDB.
    const startedAt = Date.now();
    const DEFAULT_LIMIT = 50;
    
    const requestedPage = Math.max(1, params?.page ?? 1);
    const limit = Math.min(Math.max(1, params?.limit ?? DEFAULT_LIMIT), 100);
    
    const logMem = (label: string) => {
      const mem = process.memoryUsage();
      console.log(
        `[PAE QUEUE] Memory [${label}]: heapUsed=${Math.round(mem.heapUsed/1024/1024)}MB, heapTotal=${Math.round(mem.heapTotal/1024/1024)}MB, rss=${Math.round(mem.rss/1024/1024)}MB`
      );
    };

    try {
      logMem('start');
      console.log('[PAE QUEUE] Starting queue details', { section: params?.section, page: requestedPage, limit });

      // Step 1: Get paginated questions from repository (server-side pagination)
      console.log('[PAE QUEUE] Fetching paginated questions from MongoDB...');
      const paginatedData = await this.questionRepo.getPaeValidationQueuePaginated({
        page: requestedPage,
        limit,
        section: params?.section,
      });
      console.log(
        `[PAE QUEUE] Paginated data fetched: auto=${paginatedData.waitingAuto.count}, manual=${paginatedData.waitingManual.count}, assigned=${paginatedData.assigned.count}`
      );
      logMem('after-paginated-query');

      // Step 2: Get assigned question IDs for reviewer lookup
      console.log('[PAE QUEUE] Fetching open reviews for reviewer info...');
      const openReviews = await this.questionSubmissionRepo.findOpenPaeValidationReviews();
      
      const reviewerByQuestion = new Map<string, string>();
      for (const o of openReviews) {
        if (o.questionId && !reviewerByQuestion.has(o.questionId)) {
          reviewerByQuestion.set(o.questionId, o.reviewerId);
        }
      }
      logMem('after-reviews-query');

      // Step 3: Resolve reviewer metadata
      const reviewerIds = [...reviewerByQuestion.values()];
      const meta = await resolveExpertMeta(
        this.userRepo,
        reviewerIds.length > 0 ? reviewerIds : ['__no_reviewers__'],
      );
      logMem('after-meta-resolve');

      // Step 4: Transform raw questions to QueueQuestionItems
      const transformToQueueItems = (questions: IQuestion[]): QueueQuestionItem[] => {
        return questions.map((q) => {
          const id = q._id?.toString();
          const reviewerId = id ? reviewerByQuestion.get(id) : undefined;
          const base = submissionToQueueItem({ question: q });
          if (id && reviewerByQuestion.has(id)) {
            return { ...base, assigneeName: (reviewerId && meta.get(reviewerId)?.name) || 'Unknown' };
          }
          return base;
        });
      };

      const waitingAutoItems = transformToQueueItems(paginatedData.waitingAuto.items);
      const waitingManualItems = transformToQueueItems(paginatedData.waitingManual.items);
      const assignedItems = transformToQueueItems(paginatedData.assigned.items);

      console.log('[PAE QUEUE] Fetching available PAE experts...');
      const availablePaeExperts = await this.userRepo.findAvailablePaeExperts();
      logMem('after-experts-query');

      const toExpertItem = (u: any): QueueExpertItem => ({
        _id: u._id.toString(),
        name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || 'Unknown',
        email: u.email,
        reputationScore: u.reputation_score,
        role: u.role,
        isSpecialTaskForce: u.special_task_force === true,
        isTrainingUser: u.isTrainingUser === true,
      });

      const availablePaeExpertItems = availablePaeExperts.map(toExpertItem);

      // Build the response
      const result = {
        waitingAuto: {
          count: paginatedData.waitingAuto.count,
          items: waitingAutoItems,
          page: requestedPage,
          totalPages: paginatedData.waitingAuto.totalPages,
        },
        waitingManual: {
          count: paginatedData.waitingManual.count,
          items: waitingManualItems,
          page: requestedPage,
          totalPages: paginatedData.waitingManual.totalPages,
        },
        assigned: {
          count: paginatedData.assigned.count,
          items: assignedItems,
          page: requestedPage,
          totalPages: paginatedData.assigned.totalPages,
        },
        availablePaeExperts: { count: availablePaeExpertItems.length, items: availablePaeExpertItems },
      };

      console.log(`[PAE QUEUE] Completed in ${Date.now() - startedAt}ms (page ${requestedPage})`);
      logMem('end');

      return result;
    } catch (error) {
      console.error(`[PAE QUEUE] FAILED after ${Date.now() - startedAt}ms`, error);
      throw error;
    }
  }
}
