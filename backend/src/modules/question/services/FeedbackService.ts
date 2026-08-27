import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import {ObjectId} from 'mongodb';
import {
  BadRequestError,
  NotFoundError,
  InternalServerError,
} from 'routing-controllers';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {CHATBOT_TYPES} from '#root/modules/chatbot/types.js';
import {AUDIT_TRAILS_TYPES} from '#root/modules/auditTrails/types.js';
import {IAuditTrailsService} from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import {
  AuditAction,
  AuditCategory,
  OutComeStatus,
  ModeratorAuditTrail,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IChatbotRepository} from '#root/shared/database/interfaces/IChatbotRepository.js';
import {IFeedbackRepository} from '#root/shared/database/interfaces/IFeedbackRepository.js';
import {IFeedback} from '#root/shared/interfaces/models.js';
import {
  FeedbackResponse,
  FeedbackData,
  FeedbackQueueDetails,
  QueueQuestionItem,
  QueueExpertItem,
} from '../interfaces/IQuestionService.js';
import {resolveExpertMeta} from './helpers/reportHelpers.js';
import {submissionToQueueItem} from './helpers/queueItem.js';

/** Guard so the feedback-allocation cron never runs two passes concurrently. */
let isReallocatingFeedback = false;

/**
 * Feedback-review workflow extracted from QuestionService: allocation of feedback
 * questions to reviewers, accept/reject actions, reviewer assignment/removal,
 * timelines, queue details and the paginated feedback fetch. QuestionService keeps
 * thin delegating wrappers for each of these.
 */
@injectable()
export class FeedbackService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(CHATBOT_TYPES.ChatbotRepository)
    private readonly chatbotRepository: IChatbotRepository,

    @inject(CORE_TYPES.FeedbackRepository)
    private readonly feedbackRepo: IFeedbackRepository,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,

    @inject(GLOBAL_TYPES.Database)
    mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async getQuestionFeedback(questionId: string) {
    const questionData = await this.questionRepo.getById(questionId);

    if (!questionData) {
      throw new Error('Question not found');
    }

    const {question, details, createdAt, messageId} = questionData;

    const annamMessages = await this.chatbotRepository.findFromSecondDb({
      question,
      details,
      createdAt,
      questionId: questionId.toString(),
      messageId: messageId ? messageId.toString() : undefined,
    });

    const message = annamMessages?.[0];

    // Convert feedback _id to string if it exists
    const feedback = message?.feedback;
    const processedFeedback = feedback
      ? {
          ...feedback,
          id: feedback._id?.toString() || feedback.id,
          _id: feedback._id?.toString(),
        }
      : null;

    return {
      feedback: processedFeedback,
      user: {
        username: message?.userDetails?.username || 'N/A',
        email: message?.userDetails?.email || '',
        avatar: message?.userDetails?.avatar || null,
      },
      createdAt: message?.createdAt
        ? new Date(message.createdAt).toISOString()
        : '',
    };
  }

  async allocateFeedbackQuestions(): Promise<{
    message: string;
    allocated: number;
    skipped: number;
  }> {
    if (isReallocatingFeedback) {
      console.log(
        '[Feedback] Previous run still in progress — skipping this tick to avoid double-allocation.',
      );
      return {
        message: 'Reallocation already in progress',
        allocated: 0,
        skipped: 0,
      };
    }
    isReallocatingFeedback = true;
    try {
      const questions =
        await this.questionRepo.findQuestionsWithOpenFeedbacks();
      if (!questions.length) {
        console.log('[Feedback] No questions found with open feedback.');
        return {
          message: 'No questions found with open feedback',
          allocated: 0,
          skipped: 0,
        };
      }

      const questionIds = questions
        .map(question => question._id?.toString())
        .filter((id): id is string => Boolean(id));
      const finalAnswers =
        await this.answerRepo.getFinalAnswersByQuestionIds(questionIds);
      const approverByQuestionId = new Map<string, string>();

      for (const answer of finalAnswers) {
        const questionId = answer.questionId?.toString();
        const approvedBy = answer.approvedBy?.toString();
        if (questionId && approvedBy && !approverByQuestionId.has(questionId)) {
          approverByQuestionId.set(questionId, approvedBy);
        }
      }

      let allocated = 0;
      let skipped = 0;

      for (const question of questions) {
        const questionId = question._id?.toString();
        if (!questionId) {
          skipped++;
          continue;
        }

        const approvedByUserId = approverByQuestionId.get(questionId);
        if (!approvedByUserId) {
          console.log(
            `[Feedback] Skipped question ${questionId}: no approvedBy user found.`,
          );
          skipped++;
          continue;
        }

        try {
          const assignedAt = new Date();
          let assignedReviewerId: string | undefined;
          // Try to claim the approved reviewer first; if unavailable, try other
          // available moderators/auditors until one successfully claims the feedback.
          await this._withTransaction(async session => {
            // Candidate order: approvedByUserId first, then available moderators,
            // then available auditors. Exclude the approved user when fetching lists
            // to avoid duplicate checks.
            const candidateIds: string[] = [];

            // Start with the approved reviewer as preferred candidate.
            candidateIds.push(approvedByUserId);

            // Fetch other available auditors to use as fallback.

            const availAuditors =
              await this.userRepo.findAvailableUsersByRole('auditor');
            for (const a of availAuditors) {
              const id = a._id?.toString();
              if (id && id !== approvedByUserId) candidateIds.push(id);
            }

            let assigned = false;
            let lastClaimedUser: string | undefined;

            for (const candidateId of candidateIds) {
              const reviewerClaimed =
                await this.userRepo.claimFeedbackAllocation(
                  candidateId,
                  questionId,
                  session,
                );
              if (!reviewerClaimed) continue;

              // We claimed this user's feedback slot; now assign the submission
              // to that reviewer. If assignment fails, the transaction will abort
              // and the claim will not persist.
              const submissionAssigned =
                await this.questionSubmissionRepo.assignFeedbackReviewer(
                  questionId,
                  candidateId,
                  assignedAt,
                  session,
                );
              if (submissionAssigned) {
                assigned = true;
                lastClaimedUser = candidateId;
                // capture outside-transaction variable for logging after commit
                assignedReviewerId = candidateId;
                // Mark the question's feedback auto-allocation ON now that a reviewer
                // has been assigned — keeps the flag/toggle in sync with the state.
                await this.questionRepo.updateQuestion(
                  questionId,
                  {autoAllocateFeedback: true} as any,
                  session,
                );
                break;
              }
            }

            if (!assigned) {
              throw new Error(
                'FEEDBACK_SUBMISSION_NOT_ASSIGNABLE_OR_NO_REVIEWER',
              );
            }
          });

          allocated++;
          console.log(
            `[Feedback] Allocated question ${questionId} to reviewer ${assignedReviewerId ?? approvedByUserId}.`,
          );

          // Audit the system feedback allocation (fire-and-forget, mirrors the
          // time-bound / moderator-queue crons' SYSTEM_ALLOCATED entries).
          if (assignedReviewerId) {
            const meta = await resolveExpertMeta(this.userRepo, [assignedReviewerId]);
            const reviewerName =
              meta.get(assignedReviewerId)?.name ?? assignedReviewerId;
            this.auditTrailsService
              .createAuditTrail({
                category: AuditCategory.EXPERTS_CATEGORY,
                action: AuditAction.SYSTEM_ALLOCATED,
                actor: {
                  id: 'system',
                  name: 'System',
                  email: '',
                  role: 'system',
                  avatar: '',
                },
                context: {
                  questionId,
                  question: (question as any)?.question,
                  expertId: assignedReviewerId,
                  operation: 'feedback',
                },
                changes: {after: {'feedback reviewer': reviewerName}},
                outcome: {status: OutComeStatus.SUCCESS},
                createdAt: new Date(),
              } as ModeratorAuditTrail)
              .catch((err: any) =>
                console.error(
                  '[Feedback] Failed to write SYSTEM_ALLOCATED audit:',
                  err?.message,
                ),
              );
          }
        } catch (error: any) {
          skipped++;
          const reason =
            error?.message === 'FEEDBACK_REVIEWER_UNAVAILABLE'
              ? 'reviewer not available'
              : error?.message === 'FEEDBACK_SUBMISSION_NOT_ASSIGNABLE'
                ? 'submission missing or already assigned'
                : error?.message ===
                    'FEEDBACK_SUBMISSION_NOT_ASSIGNABLE_OR_NO_REVIEWER'
                  ? 'no available reviewer or submission not assignable'
                  : error?.message || 'unknown error';
          console.log(`[Feedback] Skipped question ${questionId}: ${reason}.`);
        }
      }

      console.log(
        `[Feedback] Done. allocated=${allocated}, skipped=${skipped}`,
      );
      return {
        message: 'Feedback allocation completed',
        allocated,
        skipped,
      };
    } finally {
      isReallocatingFeedback = false;
    }
  }

  /**
   * Handle feedback action (accept/reject) and notify data release service
   */
  async handleFeedbackAction(
    questionId: string,
    feedbackId: string,
    action: 'accept' | 'reject',
    reason: string,
    processedBy: string,
    source: 'DATASET' | 'WEB_APPLICATION' | 'PAE_Validation',
  ): Promise<{
    success: boolean;
    message: string;
    data?: {
      feedbackId: string;
      action: string;
      reason: string;
      processedBy: string;
      processedAt: string;
    };
  }> {
    if (source === 'PAE_Validation') {
      const feedback = await this.feedbackRepo.findById(feedbackId.toString());
      if (!feedback) {
        throw new NotFoundError(`Feedback with ID ${feedbackId} not found`);
      }

      // Update the feedback in the feedbacks collection
      await this.feedbackRepo.updateFeedbackAction(
        feedbackId.toString(),
        action,
        reason,
        processedBy,
      );

      const processedAt = new Date().toISOString();

      // Record this individual feedback as closed on the OPEN feedback-review round
      // (so the view can hide accept/reject for it going forward).
      await this.questionSubmissionRepo.addClosedFeedbackToOpenRound(
        questionId,
        feedbackId,
        new Date(),
      );

      // Close ONLY this source's feedback entry, then check whether EVERY source is
      // now closed. The reviewer's feedbacksAssigned id is removed AND the review
      // round is finished only when all feedback statuses are closed — a still-open
      // source keeps the question assigned and the round open.
      const allClosed = await this.questionRepo.closeFeedbackSourceAndCheckAll(
        questionId,
        source,
      );

      if (allClosed) {
        // Close the open feedback-review round on the submission (stamps finishedAt
        // on the round that has no finishedAt yet).
        await this.questionSubmissionRepo.finishOpenFeedbackReviews(
          questionId,
          new Date(),
        );

        // Remove the questionId from the processedBy user's feedbacksAssigned array
        await this.userRepo.removeFeedbacksAssigned(processedBy, questionId);

        // All feedback sources are closed — clear the feedback-arrival time so the
        // question no longer counts as having recent feedback (queue ordering / timeline).
        await this.questionRepo.updateQuestion(questionId, {
          recentFeedback: null,
        } as any);
      }

      return {
        success: true,
        message: allClosed
          ? `Feedback ${action}ed successfully. All feedbacks processed.`
          : `Feedback ${action}ed successfully. Other feedback sources still open.`,
        data: {
          feedbackId,
          action,
          reason,
          processedBy,
          processedAt,
        },
      };
    }
    const dataReleaseUrl = process.env.DATA_RELEASE_URL;
    const WEB_APP_Url = process.env.WEB_APP_URL;
    const authKey = process.env.REVIEW_SYSTEM_AUTH_KEY;
    const webAuthKey = process.env.WEB_WEBHOOK_API_KEY;

    if (!dataReleaseUrl) {
      throw new Error(
        'DATA_RELEASE_URL environment variable is not configured',
      );
    }

    if (!authKey) {
      throw new Error(
        'REVIEW_SYSTEM_AUTH_KEY environment variable is not configured',
      );
    }

    // Call the data release service
    const payload = {
      note: reason,
      status: action === 'accept' ? 'accepted' : 'rejected',
    };

    let dataReleaseResponse: {status: string; pendingFeedbackCount: number};

    try {
      let response;
      if (source === 'DATASET') {
        response = await fetch(
          `${dataReleaseUrl}/feedbacks/${feedbackId}/status`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authKey}`,
            },
            body: JSON.stringify(payload),
          },
        );
      } else if (source === 'WEB_APPLICATION') {
        response = await fetch(
          `${WEB_APP_Url}/feedbacks/${feedbackId}/status`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${webAuthKey}`,
            },
            body: JSON.stringify(payload),
          },
        );
      }

      if (!response.ok) {
        throw new Error(
          `Data release service returned status ${response.status}`,
        );
      }

      const responseData = (await response.json()) as {
        status: string;
        pendingFeedbackCount: number;
      };
      dataReleaseResponse = responseData;
      //dataReleaseResponse = {status: 'closed', pendingFeedbackCount: 0};
    } catch (error: any) {
      console.error(
        '[QuestionService] handleFeedbackAction: Failed to call data release service:',
        error,
      );
      throw new InternalServerError(
        'Failed to process feedback action: ' + error.message,
      );
    }

    const processedAt = new Date().toISOString();

    // Record this individual feedback as closed on the OPEN feedback-review round
    // (so the view can hide accept/reject for it going forward).
    await this.questionSubmissionRepo.addClosedFeedbackToOpenRound(
      questionId,
      feedbackId,
      new Date(),
    );

    // This source's feedbacks are all processed once the data-release service reports
    // no pending items for it. Close ONLY this source's entry on the question, then
    // remove the reviewer's feedbacksAssigned id AND finish the round only when EVERY
    // feedback status is closed (a still-open source keeps the question assigned).
    if (dataReleaseResponse.pendingFeedbackCount <= 0) {
      const now = new Date();

      const allClosed = await this.questionRepo.closeFeedbackSourceAndCheckAll(
        questionId,
        source,
      );

      if (allClosed) {
        // Close the open feedback-review round on the submission (stamps finishedAt
        // on the round that has no finishedAt yet).
        await this.questionSubmissionRepo.finishOpenFeedbackReviews(
          questionId,
          now,
        );

        // Remove the questionId from the processedBy user's feedbacksAssigned array
        await this.userRepo.removeFeedbacksAssigned(processedBy, questionId);

        // All feedback sources are closed — clear the feedback-arrival time so the
        // question no longer counts as having recent feedback (queue ordering / timeline).
        await this.questionRepo.updateQuestion(questionId, {
          recentFeedback: null,
        } as any);
      }

      return {
        success: true,
        message: allClosed
          ? `Feedback ${action}ed successfully. All feedbacks processed.`
          : `Feedback ${action}ed successfully. Other feedback sources still open.`,
        data: {
          feedbackId,
          action,
          reason,
          processedBy,
          processedAt,
        },
      };
    }

    // There are still pending feedbacks
    return {
      success: true,
      message: `Feedback ${action}ed successfully. ${dataReleaseResponse.pendingFeedbackCount} pending feedback(s) remaining.`,
      data: {
        feedbackId,
        action,
        reason,
        processedBy,
        processedAt,
      },
    };
  }

  /** Data for the dedicated Feedback tab — every feedback-related bucket in one call.
   *  Read-only; touches no allocation state. */
  async getFeedbackQueueDetails(): Promise<FeedbackQueueDetails> {
    // All questions with an open feedback (auto ON and OFF).
    const openFeedbackQuestions =
      await this.questionRepo.findQuestionsWithOpenFeedbacks(false);
    const qIds = openFeedbackQuestions
      .map(q => q._id?.toString())
      .filter((id): id is string => Boolean(id));

    // Questions already assigned a reviewer (open feedback-review round).
    const openReviews =
      await this.questionSubmissionRepo.findOpenFeedbackReviews();
    const reviewerByQuestion = new Map<string, string>();
    for (const o of openReviews) {
      if (o.questionId && !reviewerByQuestion.has(o.questionId)) {
        reviewerByQuestion.set(o.questionId, o.reviewerId);
      }
    }
    const assignedIds = new Set(reviewerByQuestion.keys());

    // Final-answer approver per question.
    const finalAnswers =
      await this.answerRepo.getFinalAnswersByQuestionIds(qIds);
    const approverByQuestion = new Map<string, string>();
    for (const a of finalAnswers) {
      const qid = a.questionId?.toString();
      const approver = a.approvedBy?.toString();
      if (qid && approver && !approverByQuestion.has(qid)) {
        approverByQuestion.set(qid, approver);
      }
    }

    // Names (reviewers + approvers) and approver user docs (for eligibility).
    const meta = await resolveExpertMeta(this.userRepo, [
      ...reviewerByQuestion.values(),
      ...approverByQuestion.values(),
    ]);
    const approverIds = [...new Set(approverByQuestion.values())];
    const approverUsers = approverIds.length
      ? await this.userRepo.getUsersByIds(approverIds)
      : [];
    const approverById = new Map(
      approverUsers.map(u => [u._id!.toString(), u]),
    );
    const isActiveModerator = (u: any) =>
      !!u &&
      u.role === 'moderator' &&
      u.isBlocked !== true &&
      u.status !== 'in-active';

    const waitingAuto: QueueQuestionItem[] = [];
    const waitingManual: QueueQuestionItem[] = [];
    const assigned: QueueQuestionItem[] = [];
    const withActiveMod: QueueQuestionItem[] = [];
    const withoutActiveMod: QueueQuestionItem[] = [];

    for (const q of openFeedbackQuestions) {
      const id = q._id?.toString();
      if (!id) continue;
      const base = submissionToQueueItem({question: q});

      if (assignedIds.has(id)) {
        const reviewerId = reviewerByQuestion.get(id);
        assigned.push({
          ...base,
          assigneeName: (reviewerId && meta.get(reviewerId)?.name) || 'Unknown',
        });
      } else if ((q as any).autoAllocateFeedback === true) {
        // Auto-allocation ON only when explicitly true; missing/false = manual.
        waitingAuto.push(base);
      } else {
        waitingManual.push(base);
      }

      const approver = approverById.get(approverByQuestion.get(id) ?? '');
      if (isActiveModerator(approver)) withActiveMod.push(base);
      else withoutActiveMod.push(base);
    }

    // Reviewers free for feedback (no feedback held, no time-bound question).
    const freeReviewers = await this.userRepo.findAvailableFeedbackReviewers();
    const toExpertItem = (u: any): QueueExpertItem => ({
      _id: u._id.toString(),
      name:
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() ||
        u.email ||
        'Unknown',
      email: u.email,
      reputationScore: u.reputation_score,
      role: u.role,
      isSpecialTaskForce: u.special_task_force === true,
      isTrainingUser: u.isTrainingUser === true,
    });
    const availableModerators = freeReviewers
      .filter(u => u.role === 'moderator')
      .map(toExpertItem);
    const availableAuditors = freeReviewers
      .filter(u => u.role === 'auditor')
      .map(toExpertItem);
    const freeIds = new Set(freeReviewers.map(u => u._id!.toString()));

    // Respective moderators: waiting-auto questions whose approver is an active
    // moderator AND currently free (question ↔ eligible-approver pairs).
    const respectiveModerators = openFeedbackQuestions
      .filter(q => {
        const id = q._id?.toString();
        if (
          !id ||
          assignedIds.has(id) ||
          (q as any).autoAllocateFeedback !== true
        )
          return false;
        const approverId = approverByQuestion.get(id);
        const approver = approverById.get(approverId ?? '');
        return (
          isActiveModerator(approver) && !!approverId && freeIds.has(approverId)
        );
      })
      .map(q => {
        const id = q._id!.toString();
        const approverId = approverByQuestion.get(id)!;
        return {
          ...submissionToQueueItem({question: q}),
          approverId,
          approverName: meta.get(approverId)?.name ?? 'Unknown',
        };
      });

    const wrap = <T>(items: T[]) => ({count: items.length, items});
    return {
      waitingAuto: wrap(waitingAuto),
      waitingManual: wrap(waitingManual),
      assigned: wrap(assigned),
      availableModerators: wrap(availableModerators),
      respectiveModerators: wrap(respectiveModerators),
      availableAuditors: wrap(availableAuditors),
      questionsWithActiveModerator: wrap(withActiveMod),
      questionsWithoutActiveModerator: wrap(withoutActiveMod),
    };
  }

  /** Feedback-review timeline for a question: each round (reviewer + assigned/finished)
   *  plus the current auto-allocation flag and whether an open feedback exists. */
  async getFeedbackTimeline(questionId: string): Promise<{
    autoAllocateFeedback: boolean;
    hasOpenFeedback: boolean;
    reviews: {
      index: number;
      reviewerId: string;
      reviewerName: string;
      assignedAt: Date;
      finishedAt: Date | null;
      /** How many feedbacks this reviewer has already acted on (accepted/rejected). */
      completedCount: number;
    }[];
  }> {
    const [question, submission] = await Promise.all([
      this.questionRepo.getById(questionId),
      this.questionSubmissionRepo.getByQuestionId(questionId),
    ]);
    const rounds = ((submission as any)?.feedbackReviews ?? []) as any[];
    const names = await resolveExpertMeta(this.userRepo, 
      rounds.map(r => r.reviewerId?.toString()).filter(Boolean),
    );
    const feedbacks = ((question as any)?.feedbacks ?? []) as any[];
    return {
      autoAllocateFeedback: (question as any)?.autoAllocateFeedback === true,
      hasOpenFeedback:
        Array.isArray(feedbacks) && feedbacks.some(f => f?.status === 'open'),
      reviews: rounds
        // `index` is the round's position in the DB array — the change/remove APIs
        // operate by that index, so keep it even though we sort for display.
        .map((r, i) => ({
          index: i,
          reviewerId: r.reviewerId?.toString(),
          reviewerName: names.get(r.reviewerId?.toString())?.name ?? 'Unknown',
          assignedAt: r.assignedAt,
          finishedAt: r.finishedAt ?? null,
          completedCount: Array.isArray(r.closedFeedbacks)
            ? r.closedFeedbacks.length
            : 0,
        }))
        .sort(
          (a, b) =>
            new Date(a.assignedAt).getTime() - new Date(b.assignedAt).getTime(),
        ),
    };
  }

  /** All moderators/auditors eligible to be a feedback reviewer (for the manual picker). */
  async getAssignableFeedbackReviewers(): Promise<
    {_id: string; name: string; email: string; role: string}[]
  > {
    const users = await this.userRepo.findUsersByRoles([
      'moderator',
      'auditor',
    ]);
    return users.map(u => ({
      _id: u._id!.toString(),
      name:
        `${(u as any).firstName ?? ''} ${(u as any).lastName ?? ''}`.trim() ||
        u.email ||
        'Unknown',
      email: u.email,
      role: u.role,
    }));
  }

  /** Manually assign OR reassign the feedback reviewer (admin/moderator). When a round
   *  is already open it repoints that round to the new reviewer and releases the old one;
   *  otherwise it opens a fresh round. Respects the same one-at-a-time / auditor either-or
   *  rules as the cron. */
  async assignFeedbackReviewerManually(
    questionId: string,
    userId: string,
    index?: number,
  ): Promise<{success: true}> {
    await this._withTransaction(async session => {
      // Don't allow assigning a reviewer once the feedback is closed (no open
      // feedback left on the question).
      const question = await this.questionRepo.getById(questionId);
      const feedbacks = ((question as any)?.feedbacks ?? []) as any[];
      const hasOpenFeedback =
        Array.isArray(feedbacks) && feedbacks.some(f => f?.status === 'open');
      if (!hasOpenFeedback) {
        throw new BadRequestError('This feedback is already closed.');
      }

      const submission =
        await this.questionSubmissionRepo.getByQuestionId(questionId);
      const rounds = ((submission as any)?.feedbackReviews ?? []) as any[];

      // Resolve the round being changed: an explicit index (one of several rounds)
      // or the single open round when none is given.
      const targetIndex =
        typeof index === 'number' && index >= 0
          ? index
          : rounds.findIndex(r => !r.finishedAt);
      const targetRound = targetIndex >= 0 ? rounds[targetIndex] : undefined;

      if (targetRound && targetRound.finishedAt) {
        throw new BadRequestError(
          'That feedback review is already completed and cannot be reassigned.',
        );
      }
      const oldReviewerId = targetRound?.reviewerId?.toString();
      if (oldReviewerId === userId) {
        return; // already assigned to this reviewer — no-op
      }

      // Claim the new reviewer's slot first (fails if they're not free). Manual claim
      // lets an admin/moderator pick ANY active user (not restricted to mod/auditor),
      // still one feedback at a time.
      const claimed = await this.userRepo.claimFeedbackAllocationManual(
        userId,
        questionId,
        session,
      );
      if (!claimed) {
        throw new BadRequestError(
          'Selected user is not available (already holds a feedback, or is inactive/blocked).',
        );
      }

      if (targetRound) {
        // Reassign only the targeted round (by index) and release its previous reviewer.
        await this.questionSubmissionRepo.reassignFeedbackReviewerByIndex(
          questionId,
          targetIndex,
          userId,
          new Date(),
          session,
        );
        if (oldReviewerId) {
          await this.userRepo.removeFeedbacksAssigned(
            oldReviewerId,
            questionId,
            session,
          );
        }
      } else {
        // Fresh assignment: open a new round.
        const assigned =
          await this.questionSubmissionRepo.assignFeedbackReviewer(
            questionId,
            userId,
            new Date(),
            session,
          );
        if (!assigned) {
          throw new BadRequestError(
            'This question already has an open feedback review.',
          );
        }
      }
    });
    return {success: true};
  }

  /** Remove an OPEN feedback-review round by index (admin/moderator/etc). Releases the
   *  reviewer's feedback slot. Completed rounds cannot be removed. */
  async removeFeedbackReviewer(
    questionId: string,
    index: number,
  ): Promise<{success: true}> {
    await this._withTransaction(async session => {
      const submission =
        await this.questionSubmissionRepo.getByQuestionId(questionId);
      const rounds = ((submission as any)?.feedbackReviews ?? []) as any[];
      const round = rounds[index];
      if (!round) {
        throw new BadRequestError('No feedback review found at that position.');
      }
      if (round.finishedAt) {
        throw new BadRequestError(
          'A completed feedback review cannot be removed.',
        );
      }
      const removed =
        await this.questionSubmissionRepo.removeFeedbackReviewByIndex(
          questionId,
          index,
          session,
        );
      if (!removed) {
        throw new BadRequestError('Could not remove the feedback review.');
      }
      const reviewerId = round.reviewerId?.toString();
      if (reviewerId) {
        await this.userRepo.removeFeedbacksAssigned(
          reviewerId,
          questionId,
          session,
        );
      }
    });
    return {success: true};
  }

  async getFeedbacks(
    questionId: string,
    page: number = 1,
    pageSize: number = 5,
  ): Promise<FeedbackResponse> {
    // Empty result used whenever the external data-release service can't be reached
    // or isn't configured — feedbacks are supplementary, so a failure here must not
    // 500 the whole question-details view. It just shows "no feedbacks".
    const emptyResponse: FeedbackResponse = {
      data: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
    };

    const question = await this.questionRepo.getById(questionId);

    const externalFeedbacks =
      question?.feedbacks?.filter(
        f => f.source === 'DATASET' || f.source === 'WEB_APPLICATION',
      ) ?? [];

    // PAE flow
    const paeFeedbackData =
      (await this.feedbackRepo.findByQuestionId(questionId)) ?? [];

    const dataReleaseUrl = process.env.DATA_RELEASE_URL;
    const authKey = process.env.REVIEW_SYSTEM_AUTH_KEY;

    /**
     * Normalize external feedbacks to FeedbackData.
     */
    //Helpers for converting MongoDB values
    //to the extended JSON format expected by frontend.
    // The data-release service returns feedbacks in a flat shape
    // ({ id, questionId, answerId as strings, createdAt as ISO strings }) and
    // already paginates the result. Normalize each item to the extended-JSON
    // shape the frontend consumes ({ _id: { $oid }, createdAt: { $date }, … })
    // and pass the service's own pagination through unchanged.
    const asOid = (value: any): {$oid: string} => ({
      $oid:
        typeof value === 'string'
          ? value
          : (value?.$oid ??
            value?.toHexString?.() ??
            value?._id?.toHexString?.() ??
            ''),
    });

    const asDate = (value: any): {$date: string} => ({
      $date:
        typeof value === 'string'
          ? value
          : (value?.$date ?? value?.toISOString?.() ?? ''),
    });

    /**
     * PAE feedbacks
     *
     * PAE and external feedbacks come from different sources,
     * but both are converted to the common FeedbackData response.
     */
    const paeData: FeedbackData[] = paeFeedbackData.map((feedback: any) => ({
      _id: asOid(feedback._id),

      questionId: asOid(feedback.questionId ?? questionId),

      userId: {
        name: feedback.userId?.name ?? '',
        email: feedback.userId?.email ?? '',
      },

      answerId: feedback.answerId ? asOid(feedback.answerId) : null,

      type: 'PAE_VALIDATION',

      predefinedOption: feedback.predefinedOption ?? '',

      comment: feedback.comment ?? '',

      status: feedback.status,

      link: feedback.link,

      reviewNote: feedback.reviewNote,

      createdAt: asDate(feedback.createdAt),

      updatedAt: asDate(feedback.updatedAt ?? feedback.createdAt),
    }));

    /**
     * If there are no external feedbacks,
     * return PAE feedbacks only.
     */
    if (externalFeedbacks.length === 0) {
      if (paeData.length === 0) {
        return emptyResponse;
      }

      const totalCount = paeData.length;

      return {
        data: paeData,
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      };
    }

    /**
     * External service is not configured.
     * PAE feedbacks should still be returned.
     */
    if (!dataReleaseUrl || !authKey) {
      console.warn(
        '[QuestionService] getFeedbacks: data-release service not configured (DATA_RELEASE_URL / REVIEW_SYSTEM_AUTH_KEY missing) — returning empty feedbacks.',
      );

      if (paeData.length === 0) {
        return emptyResponse;
      }
      const totalCount = paeData.length;

      return {
        data: paeData,
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      };
    }

    try {
      /**
       * External feedback flow
       */
      const response = await fetch(
        `${dataReleaseUrl}/feedbacks/question/${questionId}?page=${page}&pageSize=${pageSize}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authKey}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Data release service returned status ${response.status}`,
        );
      }
      const res = (await response.json()) as {
        data?: any[];
        total?: number;
        page?: number;
        limit?: number;
        totalPages?: number;
      };

      const externalData: FeedbackData[] = (
        Array.isArray(res.data) ? res.data : []
      ).map((f: any) => ({
        _id: asOid(f.id ?? f._id),
        questionId: f.questionId ? asOid(f.questionId) : {$oid: questionId},
        userId: {
          name: f.userId?.name ?? '',
          email: f.userId?.email ?? '',
        },
        answerId: asOid(f.answerId),
        type: f.type,
        predefinedOption: f.predefinedOption ?? '',
        comment: f.comment ?? '',
        status: f.status,
        reviewNote: f.reviewNote,
        createdAt: asDate(f.createdAt),
        updatedAt: asDate(f.updatedAt),
      }));

      /**
       * Combine external + PAE feedbacks.
       */
      const data: FeedbackData[] = [...externalData, ...paeData];

      if (data.length === 0) {
        return emptyResponse;
      }
      const externalTotal =
        typeof res.total === 'number' ? res.total : externalData.length;

      const totalCount = externalTotal + paeData.length;
      console.log('final:', data);
      return {
        data,
        totalCount,
        page: typeof res.page === 'number' ? res.page : page,
        pageSize: typeof res.limit === 'number' ? res.limit : pageSize,
        totalPages:
          typeof res.totalPages === 'number'
            ? res.totalPages
            : Math.ceil(totalCount / pageSize),
      };
    } catch (error: any) {
      // Network failure (ECONNREFUSED / timeout), non-OK status, or bad JSON —
      // log and degrade to an empty list rather than 500ing the question view.
      console.error(
        '[QuestionService] getFeedbacks: Failed to call data release service:',
        error?.message ?? error,
      );

      if (paeData.length === 0) {
        return emptyResponse;
      }

      const totalCount = paeData.length;

      return {
        data: paeData,
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      };
    }
  }

  /**
   * handle Feedback Status Update for a question
   */
  async handleFeedbackStatusUpdate(
    questionId: string,
    source: 'DATASET' | 'WEB_APPLICATION' | 'PAE_Validation',
  ): Promise<{success: boolean}> {
    const matchedCount = await this.questionRepo.addOrUpdateFeedbackStatus(
      questionId,
      source,
    );

    if (matchedCount === 0) {
      throw new NotFoundError('Question not found');
    }

    return {
      success: true,
    };
  }
}
