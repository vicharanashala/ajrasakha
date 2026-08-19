import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {BadRequestError} from 'routing-controllers';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {AUDIT_TRAILS_TYPES} from '#root/modules/auditTrails/types.js';
import {IAuditTrailsService} from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import {AuditAction, AuditCategory, OutComeStatus, ModeratorAuditTrail} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {NotificationService} from '#root/modules/notification/services/NotificationService.js';
import {IUser, QuestionStatus, UserRole} from '#root/shared/interfaces/models.js';
import {GATE_KEEPER_STATUSES, AUDITOR_STATUSES} from './helpers/roleStatuses.js';

/**
 * Moderator / gate-keeper / auditor assignment management extracted from
 * QuestionService. QuestionService keeps thin delegating wrappers for the public
 * methods (freeRoleAssigneeOnStatusChange is still called from updateQuestion).
 */
@injectable()
export class RoleAssigneeService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.QuestionRepository) private readonly questionRepo: IQuestionRepository,
    @inject(GLOBAL_TYPES.UserRepository) private readonly userRepo: IUserRepository,
    @inject(GLOBAL_TYPES.NotificationService) private readonly notificationService: NotificationService,
    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService) private readonly auditTrailsService: IAuditTrailsService,
    @inject(GLOBAL_TYPES.Database) mongoDatabase: MongoDatabase,
  ) { super(mongoDatabase); }

  /**
   * Manually (re)assign the moderator for a question.
   * - Sets moderatorId and stamps moderatorAssignedAt to now on the question (handled in the repo).
   * - Keeps the user docs consistent with the cron: pulls this question from the previous
   *   moderator's assignedQuestionIds array and appends it to the new moderator's array.
   *   A moderator stays "busy" (not picked by the cron) as long as their array is non-empty,
   *   so manual allocation can stack multiple questions onto one moderator.
   */
  async changeQuestionModerator(
    questionId: string,
    moderatorId: string,
  ): Promise<void> {
    // Read the currently assigned moderator (if any) so we can free them.
    const question = await this.questionRepo.getById(questionId);
    const previousModeratorId = (question as any)?.moderatorId?.toString();

    // Point the question at the new moderator (also stamps moderatorAssignedAt = now).
    await this.questionRepo.updateModeratorId(questionId, moderatorId);

    // Pull this question from the previous moderator and append it to the new one,
    // carrying the question's current status so free/busy stays accurate. Guard against
    // a malformed previous moderatorId so a bad value can't throw a BSONError.
    if (
      previousModeratorId &&
      ObjectId.isValid(previousModeratorId) &&
      previousModeratorId !== moderatorId
    ) {
      await this.userRepo.removeAssignedQuestion(
        previousModeratorId,
        questionId,
      );
    }
    await this.userRepo.addAssignedQuestion(
      moderatorId,
      questionId,
      ((question as any)?.status ?? 'in-review') as QuestionStatus,
      (question as any)?.source,
    );
  }

  /**
   * Remove the moderator currently assigned to a question.
   * - Pulls this question from the assigned moderator's assignedQuestionIds array, so the
   *   cron's "is this moderator free?" check (array empty) stays accurate.
   * - Nulls moderatorId and moderatorAssignedAt on the question (handled in the repo).
   */
  async removeQuestionModerator(questionId: string): Promise<void> {
    const question = await this.questionRepo.getById(questionId);
    const previousModeratorId = (question as any)?.moderatorId?.toString();

    // Null out moderatorId and moderatorAssignedAt on the question.
    await this.questionRepo.updateModeratorId(questionId, null);

    // Pull this question from the previously assigned moderator's array. Guard against
    // a malformed previous moderatorId so a bad value can't throw a BSONError.
    if (previousModeratorId && ObjectId.isValid(previousModeratorId)) {
      await this.userRepo.removeAssignedQuestion(
        previousModeratorId,
        questionId,
      );
    }
  }

  /** Field mapping for the gate-keeper / auditor role assignee on a question. */
  private roleAssigneeFields(role: 'gate_keeper' | 'auditor'): {
    assigneeField: 'gateKeeperId' | 'auditorId';
    assignedAtField: 'gateKeeperAssignedAt' | 'auditorAssignedAt';
    finishedAtField: 'gateKeeperFinishedAt' | 'auditorFinishedAt';
  } {
    return role === 'gate_keeper'
      ? {
          assigneeField: 'gateKeeperId',
          assignedAtField: 'gateKeeperAssignedAt',
          finishedAtField: 'gateKeeperFinishedAt',
        }
      : {
          assigneeField: 'auditorId',
          assignedAtField: 'auditorAssignedAt',
          finishedAtField: 'auditorFinishedAt',
        };
  }

  /**
   * Once a gate keeper / auditor has submitted their response (finishedAt is set) their
   * assignment is settled — reassigning or removing it would orphan work that has already
   * been recorded against them. Callers must re-open the question first.
   */
  private assertRoleNotFinished(
    question: unknown,
    role: 'gate_keeper' | 'auditor',
  ): void {
    const {finishedAtField} = this.roleAssigneeFields(role);
    if ((question as any)?.[finishedAtField]) {
      const noun = role === 'gate_keeper' ? 'gate keeper' : 'auditor';
      throw new BadRequestError(
        `This question's ${noun} has already submitted their response, so the ${noun} can no longer be changed.`,
      );
    }
  }

  /** Dashboard for the logged-in gate keeper / auditor: assigned + submitted counts
   *  plus their paginated question list. "Submitted" = they finished it (finishedAt set).
   *  Supports optional date range filtering by assigned date, completed date, or both. */
  async getRoleAssigneeDashboard(
    userId: string,
    role: 'gate_keeper' | 'auditor',
    page: number,
    limit: number,
    search?: string,
    startDate?: Date,
    endDate?: Date,
    dateFilterType?: 'assigned' | 'completed' | 'both',
  ) {
    const {assigneeField, assignedAtField} = this.roleAssigneeFields(role);
    const finishedField =
      role === 'gate_keeper' ? 'gateKeeperFinishedAt' : 'auditorFinishedAt';
    const result = await this.questionRepo.getRoleAssigneeDashboard(
      userId,
      assigneeField,
      finishedField,
      assignedAtField,
      page,
      limit,
      search,
      startDate,
      endDate,
      dateFilterType,
    );

    // Auditors also review FEEDBACK questions (held in their feedbacksAssigned), so
    // surface those in the dashboard too. Gate keepers never receive feedback.
    // An auditor holds at most one feedback at a time, so appending to the first
    // page and bumping the totals keeps pagination effectively correct.
    if (role === 'auditor') {
      try {
        const user = await this.userRepo.findById(userId);
        const fbAssigned = ((user as any)?.feedbacksAssigned ?? []) as any[];
        if (fbAssigned.length) {
          const fbIds = fbAssigned.map(id =>
            typeof id === 'string' ? new ObjectId(id) : id,
          );
          let fbQuestions = await this.questionRepo.findByIds(fbIds);
          if (search && search.trim()) {
            const s = search.trim().toLowerCase();
            fbQuestions = fbQuestions.filter(q =>
              ((q as any).question ?? '').toLowerCase().includes(s),
            );
          }
          const existing = new Set(
            (result.questions ?? []).map((q: any) => q._id?.toString()),
          );
          const fbToAppend = fbQuestions
            .filter(q => !existing.has(q._id?.toString()))
            .map(q => ({...(q as any), isFeedbackQuestion: true}));
          return {
            ...result,
            assignedCount: result.assignedCount + fbToAppend.length,
            totalCount: result.totalCount + fbToAppend.length,
            questions:
              page === 1
                ? [...fbToAppend, ...result.questions]
                : result.questions,
          };
        }
      } catch (err) {
        console.error(
          '[RoleDashboard] Failed to append auditor feedback questions:',
          err,
        );
      }
    }

    return result;
  }

  /** Manually (re)assign the gate keeper / auditor for a question — mirrors
   *  changeQuestionModerator: pulls the question from the previous assignee's
   *  assignedQuestionIds and appends it to the new assignee's. */
  async changeQuestionRoleAssignee(
    questionId: string,
    role: 'gate_keeper' | 'auditor',
    userId: string,
    actorName?: string,
  ): Promise<void> {
    const {assigneeField, assignedAtField} = this.roleAssigneeFields(role);
    const question = await this.questionRepo.getById(questionId);
    this.assertRoleNotFinished(question, role);
    const previousId = (question as any)?.[assigneeField]?.toString();
    const noun = role === 'gate_keeper' ? 'gate keeper' : 'auditor';

    await this.questionRepo.setRoleAssignee(
      questionId,
      assigneeField,
      assignedAtField,
      userId,
    );

    if (previousId && ObjectId.isValid(previousId) && previousId !== userId) {
      await this.userRepo.removeAssignedQuestion(previousId, questionId);

      // Notify the replaced user that their allocation was taken away, naming who did it.
      try {
        const by = actorName ? ` by ${actorName}` : '';
        await this.notificationService.saveTheNotifications(
          `This question's ${noun} allocation has been removed${by}.`,
          'Allocation Removed',
          questionId,
          previousId,
          'moderator_approval',
        );
      } catch (err: any) {
        console.error(
          `[RoleAssignee] Failed to send reassignment-removal notification for ${questionId} → ${previousId}:`,
          err?.message,
        );
      }
    }
    await this.userRepo.addAssignedQuestion(
      userId,
      questionId,
      ((question as any)?.status ?? 'open') as QuestionStatus,
      (question as any)?.source,
    );

    // Notify the newly-assigned user, mirroring the auto-allocation cron so a manual
    // assignment by a moderator/admin triggers the same "Question Assigned" alert.
    try {
      await this.notificationService.saveTheNotifications(
        role === 'gate_keeper'
          ? 'A question has been assigned to you for review'
          : 'A question has been assigned to you for audit',
        'Question Assigned',
        questionId,
        userId,
        'moderator_approval',
      );
    } catch (err: any) {
      console.error(
        `[RoleAssignee] Failed to send assignment notification for ${questionId} → ${userId}:`,
        err?.message,
      );
    }
  }

  /** Remove the gate keeper / auditor currently assigned to a question. When an actor
   *  name is supplied (manual removal by a moderator/admin), the removed user is notified
   *  that their allocation was taken away and by whom. */
  async removeQuestionRoleAssignee(
    questionId: string,
    role: 'gate_keeper' | 'auditor',
    actorName?: string,
  ): Promise<void> {
    const {assigneeField, assignedAtField} = this.roleAssigneeFields(role);
    const question = await this.questionRepo.getById(questionId);
    this.assertRoleNotFinished(question, role);
    const previousId = (question as any)?.[assigneeField]?.toString();

    await this.questionRepo.setRoleAssignee(
      questionId,
      assigneeField,
      assignedAtField,
      null,
    );

    if (previousId && ObjectId.isValid(previousId)) {
      await this.userRepo.removeAssignedQuestion(previousId, questionId);

      // Notify the user who lost the assignment, naming who removed it.
      try {
        const by = actorName ? ` by ${actorName}` : '';
        await this.notificationService.saveTheNotifications(
          `This question's ${role === 'gate_keeper' ? 'gate keeper' : 'auditor'} allocation has been removed${by}.`,
          'Allocation Removed',
          questionId,
          previousId,
          'moderator_approval',
        );
      } catch (err: any) {
        console.error(
          `[RoleAssignee] Failed to send removal notification for ${questionId} → ${previousId}:`,
          err?.message,
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GATE KEEPER / AUDITOR QUEUE CRON
  // ─────────────────────────────────────────────────────────────────────────────


  /**
   * Gate-keeper / auditor single-allocation cron. One question per user at a time:
   *   - dynamic / duplicate / queue_duplicate  → a free gate keeper
   *   - auditor_review                          → a free auditor
   * The assignee is recorded on the question (gateKeeperId / auditorId) and on the
   * user (assignedQuestionIds). They're freed when they act on the question — see
   * freeRoleAssigneeOnStatusChange.
   */
  async runGateKeeperAuditorQueueCron(): Promise<{
    gateKeeperAssigned: number;
    auditorAssigned: number;
  }> {
    // Self-heal first: free any gate keeper / auditor still holding a question whose status
    // has left their scope (e.g. pushed to auditor) but whose post-commit release was
    // missed. Without this, that user stays "busy" forever and never gets new work.
    await this.reconcileRoleAssignees({
      label: 'GateKeeper',
      assigneeField: 'gateKeeperId',
      finishedAtField: 'gateKeeperFinishedAt',
      statuses: GATE_KEEPER_STATUSES,
    });
    await this.reconcileRoleAssignees({
      label: 'Auditor',
      assigneeField: 'auditorId',
      finishedAtField: 'auditorFinishedAt',
      statuses: AUDITOR_STATUSES,
    });

    const gateKeeperAssigned = await this.assignRoleQueue({
      label: 'GateKeeper',
      role: 'gate_keeper',
      statuses: GATE_KEEPER_STATUSES,
      assigneeField: 'gateKeeperId',
      assignedAtField: 'gateKeeperAssignedAt',
      autoAllocateField: 'autoAllocateGateKeeper',
      notificationTitle: 'Question Assigned',
      notificationMessage: 'A question has been assigned to you for review',
    });
    const auditorAssigned = await this.assignRoleQueue({
      label: 'Auditor',
      role: 'auditor',
      statuses: AUDITOR_STATUSES,
      assigneeField: 'auditorId',
      assignedAtField: 'auditorAssignedAt',
      autoAllocateField: 'autoAllocateAuditor',
      notificationTitle: 'Question Assigned',
      notificationMessage: 'A question has been assigned to you for audit',
    });
    return {gateKeeperAssigned, auditorAssigned};
  }

  /** Frees role assignees (gate keeper / auditor) still holding a question that has left
   *  their status scope but was never marked finished — the durable backstop for a missed
   *  post-commit release (see freeRoleAssigneeOnStatusChange). Best-effort per question. */
  private async reconcileRoleAssignees(cfg: {
    label: string;
    assigneeField: 'gateKeeperId' | 'auditorId';
    finishedAtField: 'gateKeeperFinishedAt' | 'auditorFinishedAt';
    statuses: QuestionStatus[];
  }): Promise<number> {
    try {
      const leaked = await this.questionRepo.findLeakedRoleAssignments(
        cfg.assigneeField,
        cfg.finishedAtField,
        cfg.statuses,
      );
      let freed = 0;
      for (const q of leaked) {
        const questionId = q._id!.toString();
        const userId = (q as any)[cfg.assigneeField]?.toString();
        try {
          if (userId) {
            await this.userRepo.removeAssignedQuestion(userId, questionId);
          }
          await this.questionRepo.markRoleFinished(
            questionId,
            cfg.finishedAtField,
            new Date(),
          );
          freed++;
        } catch (err: any) {
          console.error(
            `[${cfg.label}] Failed to reconcile leaked assignment ${questionId}:`,
            err?.message,
          );
        }
      }
      if (freed) {
        console.log(`[${cfg.label}] Reconciled ${freed} leaked assignment(s).`);
      }
      return freed;
    } catch (err: any) {
      console.error(
        `[${cfg.label}] Failed to reconcile leaked assignments:`,
        err?.message,
      );
      return 0;
    }
  }

  /** Assigns one unassigned question (in the given statuses) to each free user of a
   *  role, updating both the question and the user's assigned list. Best-effort. */
  private async assignRoleQueue(cfg: {
    label: string;
    role: UserRole;
    statuses: QuestionStatus[];
    assigneeField: 'gateKeeperId' | 'auditorId';
    assignedAtField: 'gateKeeperAssignedAt' | 'auditorAssignedAt';
    autoAllocateField: 'autoAllocateGateKeeper' | 'autoAllocateAuditor';
    notificationTitle: string;
    notificationMessage: string;
  }): Promise<number> {
    try {
      const [users, questions] = await Promise.all([
        this.userRepo.findAvailableUsersByRole(cfg.role),
        this.questionRepo.findUnassignedQuestionsForRole(
          cfg.statuses,
          cfg.assigneeField,
          cfg.autoAllocateField,
        ),
      ]);
      if (!users.length || !questions.length) return 0;

      let assigned = 0;
      const claimed = new Set<string>();
      for (const user of users) {
        const userId = user._id!.toString();
        const next = questions.find(q => !claimed.has(q._id!.toString()));
        if (!next) break; // no more questions this run
        const questionId = next._id!.toString();
        claimed.add(questionId);
        try {
          // Run the three writes in one transaction so a failure in any of them
          // rolls back the whole assignment (no half-assigned question / user).
          await this._withTransaction(async (session: ClientSession) => {
            await this.questionRepo.setRoleAssignee(
              questionId,
              cfg.assigneeField,
              cfg.assignedAtField,
              userId,
              session,
            );
            const added = await this.userRepo.addAssignedQuestion(
              userId,
              questionId,
              next.status,
              next.source,
              session,
            );
            // For auditors, addAssignedQuestion refuses (returns false) if the user
            // picked up a feedback-review in the race between the availability query
            // and this write. Throw to abort the transaction (rolls back setRoleAssignee)
            // so we never leave the question assigned to an auditor who holds both.
            if (!added) {
              throw new Error('ASSIGNEE_NO_LONGER_FREE');
            }
            await this.notificationService.saveTheNotifications(
              cfg.notificationMessage,
              cfg.notificationTitle,
              questionId,
              userId,
              'moderator_approval',
              session,
            );
          });
          console.log(
            `[${cfg.label}] Assigned question ${questionId} → ${cfg.role} ${userId}`,
          );
          assigned++;

          // Audit the system (cron) allocation so it shows in the question's audit
          // trail — mirrors the moderator / time-bound crons' SYSTEM_ALLOCATED entries.
          const assigneeName =
            `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
            user.email ||
            userId;
          const roleLabel =
            cfg.role === 'gate_keeper'
              ? 'gate keeper'
              : cfg.role === 'auditor'
                ? 'auditor'
                : cfg.role;
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
                question: (next as any)?.question,
                expertId: userId,
                role: cfg.role,
              },
              changes: { after: { [roleLabel]: assigneeName } },
              outcome: { status: OutComeStatus.SUCCESS },
              createdAt: new Date(),
            } as ModeratorAuditTrail)
            .catch((auditErr: any) =>
              console.error(
                `[${cfg.label}] Failed to write SYSTEM_ALLOCATED audit:`,
                auditErr?.message,
              ),
            );
        } catch (err: any) {
          claimed.delete(questionId);
          console.error(
            `[${cfg.label}] Failed to assign ${questionId} → ${userId}:`,
            err?.message,
          );
        }
      }
      console.log(`[${cfg.label}] Done. assigned=${assigned}`);
      return assigned;
    } catch (error: any) {
      console.error(`[${cfg.label}] queue cron failed:`, error?.message);
      return 0;
    }
  }

  /**
   * Free the gate keeper / auditor assigned to a question once its status moves out
   * of that role's handling statuses (i.e. they've acted on it — pass / allocate
   * experts / push to auditor for a gate keeper; push to GDB / notify user for an
   * auditor). Clears the assignee field on the question and removes it from the
   * user's assigned list so the cron can hand them another. Best-effort; never throws.
   */
  /**
   * The exact time a role (gate keeper / auditor) finished with a question — taken from the
   * audit trail (the createdAt of the latest action logged by an actor of that role) rather
   * than fabricated with new Date().
   *
   * When called inside the update transaction (session present), the audit entry for the
   * current action hasn't been written yet AND an older same-role entry could mislead — so
   * there we use the action instant (now), which is exact. Post-commit / reconciliation
   * (no session) reads the real historical time from the audit trail.
   */
  private async resolveRoleFinishTime(
    questionId: string,
    role: 'gate_keeper' | 'auditor',
    session?: ClientSession,
  ): Promise<Date> {
    if (session) return new Date();
    try {
      const {data} = await this.auditTrailsService.getAuditTrailsByQuestionId(
        questionId,
        1,
        25,
        null,
        'desc',
      );
      const entry = data.find(
        a => (a as any)?.actor?.role === role && (a as any)?.createdAt,
      );
      if (entry?.createdAt) return new Date(entry.createdAt as any);
    } catch (err: any) {
      console.error(
        `[RoleAssignee] audit-time lookup failed for ${questionId} (${role}):`,
        err?.message,
      );
    }
    return new Date();
  }

  async freeRoleAssigneeOnStatusChange(
    questionId: string,
    newStatus?: QuestionStatus,
    session?: ClientSession,
  ): Promise<void> {
    // When a session is supplied, the caller wants this to run inside their transaction —
    // let failures propagate so the status change and the release roll back together.
    // Without a session it stays best-effort (post-commit / other callers) and never throws.
    const run = async () => {
      const question = await this.questionRepo.getById(questionId, session);
      if (!question) return;
      // Fall back to the question's current status when the caller doesn't pass one —
      // e.g. after an answer approval/close.
      const status = newStatus ?? question.status;

      // When the question leaves the role's handling statuses, the assignee has acted:
      // free the user (assignedQuestionIds) and stamp finishedAt — but keep the assignee
      // id on the question for history/timeline. Guarded by finishedAt so a later status
      // change doesn't overwrite the original finish time.
      const gkId = (question as any).gateKeeperId?.toString();
      if (gkId && !GATE_KEEPER_STATUSES.includes(status)) {
        await this.userRepo.removeAssignedQuestion(gkId, questionId, session);
        if (!(question as any).gateKeeperFinishedAt) {
          await this.questionRepo.markRoleFinished(
            questionId,
            'gateKeeperFinishedAt',
            await this.resolveRoleFinishTime(
              questionId,
              'gate_keeper',
              session,
            ),
            session,
          );
        }
      }

      const audId = (question as any).auditorId?.toString();
      if (audId && !AUDITOR_STATUSES.includes(status)) {
        await this.userRepo.removeAssignedQuestion(audId, questionId, session);
        if (!(question as any).auditorFinishedAt) {
          await this.questionRepo.markRoleFinished(
            questionId,
            'auditorFinishedAt',
            await this.resolveRoleFinishTime(questionId, 'auditor', session),
            session,
          );
        }
      }
    };

    if (session) {
      await run();
      return;
    }

    try {
      await run();
    } catch (err: any) {
      console.error(
        `[RoleAssignee] Failed to free assignee for ${questionId}:`,
        err?.message,
      );
    }
  }
}
