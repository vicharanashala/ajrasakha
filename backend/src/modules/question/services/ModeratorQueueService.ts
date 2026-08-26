import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import {InternalServerError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {AUDIT_TRAILS_TYPES} from '#root/modules/auditTrails/types.js';
import {IAuditTrailsService} from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import {AuditAction, AuditCategory, OutComeStatus, ModeratorAuditTrail} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {NotificationService} from '#root/modules/notification/services/NotificationService.js';
import {IQuestion, IUser, QuestionStatus, TIME_BOUND_SOURCES, MANUAL_SOURCES} from '#root/shared/interfaces/models.js';
import {resolveExpertMeta} from './helpers/reportHelpers.js';

/**
 * Moderator-queue assignment cron extracted from QuestionService: assigns
 * in-review / duplicate questions and open-feedback questions to available
 * moderators (and auditors, for feedback), source-aware and training-aware.
 * QuestionService keeps a thin delegating wrapper.
 */
@injectable()
export class ModeratorQueueService {
  constructor(
    @inject(GLOBAL_TYPES.QuestionRepository) private readonly questionRepo: IQuestionRepository,
    @inject(GLOBAL_TYPES.UserRepository) private readonly userRepo: IUserRepository,
    @inject(GLOBAL_TYPES.QuestionSubmissionRepository) private readonly questionSubmissionRepo: IQuestionSubmissionRepository,
    @inject(GLOBAL_TYPES.AnswerRepository) private readonly answerRepo: IAnswerRepository,
    @inject(GLOBAL_TYPES.NotificationService) private readonly notificationService: NotificationService,
    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService) private readonly auditTrailsService: IAuditTrailsService,
  ) {}

    private isQuestionUserTrainingTypeMatch(
    user: IUser,
    question: IQuestion,
  ): boolean {
    return (
      (question.isTrainingQuestion === true) === (user.isTrainingUser === true)
    );
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // MODERATOR QUEUE CRON
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Periodic cron job — moderator queue management.
   *
   * Logic:
   *  1. Find all in-review questions that have no moderatorId assigned.
   *  2. Find available moderators — those whose assignedQuestionIds array is empty.
   *  3. For each available moderator, assign the oldest unassigned in-review question:
   *       - Set question.moderatorId = moderatorId
   *       - Append questionId to user.assignedQuestionIds
   *       - Push a moderator history entry into the submission
   *       - Notify the moderator
   *
   * De-assignment:
   *  When the moderator closes (approves) a question, AnswerService:
   *       - keeps question.moderatorId for history
   *       - pulls questionId from user.assignedQuestionIds
   *  …making the moderator available again on the next cron run once the array is empty.
   */
  async runModeratorQueueCron(): Promise<{
    assigned: number;
    availableWaiting: number;
    failedAssignments: number;
  }> {
    console.log(
      '[ModeratorQueue] Starting moderator queue assignment check...',
    );
    try {
      // Source-aware assignment: a moderator may hold ONE time-bound question and ONE
      // manual (non-time-bound) question at the same time. Availability is evaluated
      // per source group, so the two passes below are independent — a moderator free
      // for both categories can receive one of each in a single run, while a moderator
      // already holding (say) a time-bound question still receives a manual one.
      const [
        timeBoundModerators,
        manualModerators,
        timeBoundQuestions,
        manualQuestions,
      ] = await Promise.all([
        this.userRepo.findAvailableStfModeratorsForSources(TIME_BOUND_SOURCES),
        this.userRepo.findAvailableStfModeratorsForSources(MANUAL_SOURCES),
        this.questionRepo.findUnassignedInReviewQuestions(TIME_BOUND_SOURCES),
        this.questionRepo.findUnassignedInReviewQuestions(MANUAL_SOURCES),
      ]);

      // Track claimed question IDs across both passes so a question is never assigned
      // twice (the buckets are disjoint by source, but this is a cheap safety net).
      const claimedIds = new Set<string>();
      let assigned = 0;
      let availableWaiting = 0;
      let failedAssignments = 0;

      // Assign one question per available moderator within a single source group.
      // Training questions must only go to training moderators, and non-training
      // questions must only go to non-training moderators.
      const runPass = async (
        label: string,
        moderators: IUser[],
        questions: IQuestion[],
        canAssignQuestion?: (moderator: IUser, question: IQuestion) => boolean,
      ) => {
        for (const moderator of moderators) {
          const moderatorId = moderator._id!.toString();

          const nextQuestion = questions.find(
            (q: any) =>
              !claimedIds.has(q._id.toString()) &&
              (canAssignQuestion ? canAssignQuestion(moderator, q) : true),
          );
          if (!nextQuestion) {
            // Moderator is free for this category but no more questions left in it.
            availableWaiting++;
            continue;
          }

          const questionId = nextQuestion._id!.toString();
          claimedIds.add(questionId);

          try {
            // Assign question to moderator — update both documents and notify.
            await Promise.all([
              this.questionRepo.updateModeratorId(questionId, moderatorId),
              // Store the question's actual status (the cron assigns both in-review and
              // duplicate questions) and its source (used for source-aware availability).
              this.userRepo.addAssignedQuestion(
                moderatorId,
                questionId,
                ((nextQuestion as any)?.status ??
                  'in-review') as QuestionStatus,
                (nextQuestion as any)?.source,
              ),
              this.notificationService.saveTheNotifications(
                'A question has been assigned to you for moderation',
                'Moderation Assigned',
                questionId,
                moderatorId,
                'moderator_approval',
              ),
            ]);

            // Audit the system (cron) allocation so it shows in the question's audit
            // trail tagged "System Allocated".
            const moderatorName =
              `${moderator.firstName ?? ''} ${moderator.lastName ?? ''}`.trim() ||
              moderatorId;
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
                  question: (nextQuestion as any)?.question,
                  moderatorId,
                },
                changes: {after: {moderator: moderatorName}},
                outcome: {status: OutComeStatus.SUCCESS},
                createdAt: new Date(),
              } as ModeratorAuditTrail)
              .catch((auditErr: any) =>
                console.error(
                  '[ModeratorQueue] Failed to write SYSTEM_ALLOCATED audit:',
                  auditErr?.message,
                ),
              );

            console.log(
              `[ModeratorQueue] (${label}) Assigned question ${questionId} → moderator ${moderatorId}`,
            );
            assigned++;
          } catch (err: any) {
            console.error(
              `[ModeratorQueue] (${label}) Failed to assign ${questionId} → ${moderatorId}:`,
              err?.message,
            );
            claimedIds.delete(questionId);
            failedAssignments++;
          }
        }
      };

      if (!timeBoundModerators.length && !manualModerators.length) {
        console.log(
          '[ModeratorQueue] No available moderators for either category.',
        );
      }

      // ── Feedback pass ──────────────────────────────────────────────────────
      // Feedback-open questions (auto-allocation ON) are allocated in the same run.
      // A feedback counts as a TIME-BOUND item — it competes for the moderator's
      // single time-bound slot. Target = the final answer's approver when they are an
      // active, non-blocked MODERATOR; otherwise an available auditor (one holding no
      // time-bound question). The claim + submission guards enforce one-at-a-time.
      const feedbackAssignedModeratorIds = new Set<string>();
      try {
        // Open-feedback questions (auto-allocation ON). A question qualifies only when
        // it needs a (new) reviewer: no review round yet, OR its LAST round is finished.
        // Questions whose last round is still open are actively being reviewed by
        // someone — skip them (matches findOpenFeedbackReviews' last-round semantics).
        const [allFeedbackQuestions, openReviews] = await Promise.all([
          this.questionRepo.findQuestionsWithOpenFeedbacks(true),
          this.questionSubmissionRepo.findOpenFeedbackReviews(),
        ]);
        const inProgressIds = new Set(openReviews.map(o => o.questionId));
        const feedbackQuestions = allFeedbackQuestions.filter(
          q => !inProgressIds.has(q._id?.toString()),
        );
        if (feedbackQuestions.length) {
          const fbIds = feedbackQuestions
            .map(q => q._id?.toString())
            .filter((id): id is string => Boolean(id));

          // approvedBy per question, from the final answer.
          const finalAnswers =
            await this.answerRepo.getFinalAnswersByQuestionIds(fbIds);
          const approverByQuestion = new Map<string, string>();
          for (const a of finalAnswers) {
            const qid = a.questionId?.toString();
            const approver = a.approvedBy?.toString();
            if (qid && approver && !approverByQuestion.has(qid)) {
              approverByQuestion.set(qid, approver);
            }
          }

          // Load approver users to check eligibility (active + non-blocked + moderator).
          const approverIds = [...new Set(approverByQuestion.values())];
          const approverUsers = approverIds.length
            ? await this.userRepo.getUsersByIds(approverIds)
            : [];
          const approverById = new Map(
            approverUsers.map(u => [u._id!.toString(), u]),
          );

          // Auditor fallback pool — auditors free for feedback (no time-bound
          // question, no existing feedback).
          const auditorPool = (
            await this.userRepo.findAvailableFeedbackReviewers()
          )
            .filter(u => u.role === 'auditor')
            .map(u => u._id!.toString());
          const usedAssignees = new Set<string>();

          for (const q of feedbackQuestions) {
            const questionId = q._id?.toString();
            if (!questionId) continue;
            const approverId = approverByQuestion.get(questionId);
            const approver = approverId
              ? approverById.get(approverId)
              : undefined;

            // approvedBy gets it only when an active, non-blocked moderator; else auditor.
            const approverEligible =
              !!approver &&
              approver.role === 'moderator' &&
              approver.isBlocked !== true &&
              approver.status !== 'in-active' &&
              !usedAssignees.has(approverId!) &&
              !approver.feedbacksAssigned?.length;

            let targetId: string | undefined;
            let targetIsModerator = false;
            if (approverEligible) {
              targetId = approverId;
              targetIsModerator = true;
            } else {
              targetId = auditorPool.find(id => !usedAssignees.has(id));
            }
            if (!targetId) {
              availableWaiting++;
              continue;
            }

            try {
              // Atomic claim: guards feedback-empty AND no time-bound question.
              const claimed = await this.userRepo.claimFeedbackAllocation(
                targetId,
                questionId,
              );
              if (!claimed) continue;
              const roundOpened =
                await this.questionSubmissionRepo.assignFeedbackReviewer(
                  questionId,
                  targetId,
                  new Date(),
                );
              if (!roundOpened) {
                // Another reviewer already has an open round — release the claim.
                await this.userRepo.removeFeedbacksAssigned(
                  targetId,
                  questionId,
                );
                continue;
              }
              usedAssignees.add(targetId);
              if (targetIsModerator) feedbackAssignedModeratorIds.add(targetId);

              await this.notificationService.saveTheNotifications(
                'A feedback has been assigned to you for review',
                'Feedback Assigned',
                questionId,
                targetId,
                'moderator_approval',
              );

              const meta = await resolveExpertMeta(this.userRepo, [targetId]);
              const reviewerName = meta.get(targetId)?.name ?? targetId;
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
                    question: (q as any)?.question,
                    expertId: targetId,
                    operation: 'feedback',
                  },
                  changes: {after: {'feedback reviewer': reviewerName}},
                  outcome: {status: OutComeStatus.SUCCESS},
                  createdAt: new Date(),
                } as ModeratorAuditTrail)
                .catch((auditErr: any) =>
                  console.error(
                    '[ModeratorQueue] Failed to write feedback SYSTEM_ALLOCATED audit:',
                    auditErr?.message,
                  ),
                );

              assigned++;
              console.log(
                `[ModeratorQueue] (feedback) Assigned question ${questionId} → ${targetIsModerator ? 'moderator' : 'auditor'} ${targetId}`,
              );
            } catch (err: any) {
              console.error(
                `[ModeratorQueue] (feedback) Failed to assign ${questionId}:`,
                err?.message,
              );
              failedAssignments++;
            }
          }
        }
      } catch (fbErr: any) {
        console.error('[ModeratorQueue] feedback pass failed:', fbErr?.message);
      }

      // A feedback occupies the moderator's time-bound slot, so exclude moderators who
      // just took a feedback this run OR already hold one from a previous run.
      const eligibleTimeBoundModerators = timeBoundModerators.filter(
        m =>
          !feedbackAssignedModeratorIds.has(m._id!.toString()) &&
          !(m as any).feedbacksAssigned?.length,
      );

      await runPass(
        'time-bound',
        eligibleTimeBoundModerators,
        timeBoundQuestions,
        (moderator, question) =>
          this.isQuestionUserTrainingTypeMatch(moderator, question),
      );
      await runPass(
        'manual',
        manualModerators,
        manualQuestions,
        (moderator, question) =>
          this.isQuestionUserTrainingTypeMatch(moderator, question),
      );

      console.log(
        `[ModeratorQueue] Done. assigned=${assigned}, availableWaiting=${availableWaiting}, failed=${failedAssignments}`,
      );
      return {assigned, availableWaiting, failedAssignments};
    } catch (error: any) {
      console.error(
        '[ModeratorQueue] runModeratorQueueCron failed:',
        error?.message,
      );
      throw new InternalServerError(
        `Moderator queue cron failed: ${error?.message}`,
      );
    }
  }
}
