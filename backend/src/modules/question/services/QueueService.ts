import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import {ObjectId} from 'mongodb';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  QuestionSource,
  TIME_BOUND_SOURCES,
  MANUAL_SOURCES,
} from '#root/shared/interfaces/models.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {
  QueueDetailsResponse,
  QueueQuestionItem,
  QueueExpertItem,
  QueueSectionName,
  QueueSectionResult,
  RawQueueQuestionRow,
} from '../interfaces/IQuestionService.js';
import {resolveExpertMeta} from './helpers/reportHelpers.js';
import {queueCropName, submissionToQueueItem} from './helpers/queueItem.js';
import {GATE_KEEPER_STATUSES, AUDITOR_STATUSES} from './helpers/roleStatuses.js';

/**
 * Moderator/admin "Queue Details" rendering extracted from QuestionService:
 * the per-section paginated reader (getQueueSection) and the aggregate
 * (getQueueDetails), plus their private mapping helpers. Touches no allocation
 * state. QuestionService keeps thin delegating wrappers for both.
 */
@injectable()
export class QueueService {
  constructor(
    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,
  ) {}

  private deriveCurrentExpertId(
    queue: (ObjectId | string)[] = [],
    history: {updatedBy?: ObjectId | string; status?: string}[] = [],
  ): string | null {
    if (!queue?.length) return null;
    if (!history?.length) return queue[0]?.toString() ?? null;
    const last = history[history.length - 1];
    if (last?.status === 'in-review') return last.updatedBy?.toString() ?? null;
    return queue[history.length]?.toString() ?? null;
  }

  /** Queue member still holding pending work — identical rule to
   *  getTimeBoundActiveCountPerExpert's `isPending`. Returns null when every
   *  assigned expert has finished their step (author answered, awaiting reviewer). */
  private derivePendingAssigneeId(
    queue: (ObjectId | string)[] = [],
    history: {answer?: unknown; status?: string}[] = [],
  ): string | null {
    if (!queue?.length) return null;
    for (let i = 0; i < queue.length; i++) {
      const ch = history?.[i];
      const pending =
        i === 0 ? !ch || !ch.answer : !ch || ch.status === 'in-review';
      if (pending) return queue[i]?.toString() ?? null;
    }
    return null;
  }

  private queueCropName(crop: unknown): string | undefined {
    return queueCropName(crop);
  }

  private rawToQueueItem(row: RawQueueQuestionRow): QueueQuestionItem {
    return {
      _id: row._id?.toString(),
      question: row.question ?? '',
      status: row.status ?? '',
      source: row.source ?? '',
      isTrainingQuestion: row.isTrainingQuestion === true,
      priority: row.priority,
      createdAt: row.createdAt,
      state: row.state,
      district: row.district,
      crop: this.queueCropName(row.crop),
    };
  }

  /** Build the full queue as "Name (Level)" entries — Author for position 0,
   *  then Reviewer 1, Reviewer 2, … — resolving names from a pre-fetched map. */
  private buildQueueExpertNames(
    queue: any[] | undefined,
    names: Map<string, string>,
  ): string[] {
    return (queue ?? []).map((q, i) => {
      const id = q?.toString();
      const name = (id && names.get(id)) || 'Unknown';
      const level = i === 0 ? 'Author' : `Reviewer ${i}`;
      return `${name} (${level})`;
    });
  }


  private expertMetaToNames(
    meta: Map<string, {name: string; isTrainingUser: boolean}>,
  ): Map<string, string> {
    return new Map(
      Array.from(meta.entries()).map(([id, value]) => [id, value.name]),
    );
  }

  /** Effective moderator-queue wait time for a question: feedback questions use
   *  `recentFeedback` (when the feedback arrived), everything else uses `createdAt`.
   *  Used to interleave in-review + feedback questions in "Waiting for Moderator". */
  private effectiveQueueTime(q: any): number {
    const ts = q?.recentFeedback ?? q?.createdAt;
    const ms = ts ? new Date(ts).getTime() : 0;
    return Number.isNaN(ms) ? 0 : ms;
  }

  /** Waiting feedback questions (closed + open feedback) that don't yet have a
   *  reviewer — shown in the moderator queue's TIME-BOUND "Waiting for Moderator"
   *  section, irrespective of the question's source (feedback counts as time-bound).
   *  Includes both auto-allocate and manual ones (all are awaiting a reviewer).
   *  Filtered by training-user, matching the in-review query's behaviour. */
  private async getWaitingFeedbackQuestions(
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<any[]> {
    const [feedbackQs, openReviews] = await Promise.all([
      this.questionRepo.findQuestionsWithOpenFeedbacks(false),
      this.questionSubmissionRepo.findOpenFeedbackReviews(),
    ]);
    const assignedIds = new Set(openReviews.map(o => o.questionId));
    return (feedbackQs as any[]).filter(q => {
      if (assignedIds.has(q._id?.toString())) return false;
      if (isAdmin !== true && isTrainingUser !== undefined) {
        return isTrainingUser
          ? q.isTrainingQuestion === true
          : q.isTrainingQuestion !== true;
      }
      return true;
    });
  }

  /** Server-side paginated single Queue-Details section: exact total `count`
   *  plus only the requested page of `items` (default 50). Touches no allocation
   *  state and reuses the same queries the reallocation cron relies on. */
  async getQueueSection(
    section: QueueSectionName,
    page = 1,
    limit = 50,
    startTime?: Date,
    endTime?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<QueueSectionResult> {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 50), 200);
    const skip = (safePage - 1) * safeLimit;

    // Manual expert sections (suffix "Manual") reuse the time-bound section logic but
    // scoped to MANUAL_SOURCES (AGRI_EXPERT/OUTREACH) with the not-yet-PAE-reviewed
    // filter, mirroring the manual single-allocation cron. Moderator ...Manual sections
    // have their own dedicated cases and are NOT remapped here.
    const EXPERT_SECTIONS = new Set([
      'received',
      'autoAllocateOff',
      'autoAllocateOpen',
      'autoAllocateDelayed',
      'allocated',
      'waiting',
      'freeExperts',
      'stuck',
      'needsReviewer',
      'openedIdle',
      'totalWork',
    ]);
    let baseSection: string = section;
    let expertSources: QuestionSource[] = TIME_BOUND_SOURCES;
    let requirePaeNotDone = false;
    if (section.endsWith('Manual')) {
      const stripped = section.slice(0, -'Manual'.length);
      if (EXPERT_SECTIONS.has(stripped)) {
        baseSection = stripped;
        expertSources = MANUAL_SOURCES;
        requirePaeNotDone = true;
      }
    }

    switch (baseSection as QueueSectionName) {
      case 'received':
      case 'autoAllocateOff':
      case 'autoAllocateOpen':
      case 'autoAllocateDelayed': {
        // Use baseSection (suffix-stripped) so the ...Manual variants map to the same
        // kind as their base section — otherwise 'autoAllocateDelayedManual' etc. fall
        // through to 'autoOff' and wrongly include open questions.
        const kind =
          baseSection === 'received'
            ? 'received'
            : baseSection === 'autoAllocateOpen'
              ? 'autoAllocateOpen'
              : baseSection === 'autoAllocateDelayed'
                ? 'autoAllocateDelayed'
                : 'autoOff';
        const {count, items} = await this.questionRepo.getQueueQuestionSection(
          kind,
          skip,
          safeLimit,
          startTime,
          endTime,
          expertSources,
          requirePaeNotDone,
          isTrainingUser,
          isAdmin,
        );
        return {count, items: items.map(r => this.rawToQueueItem(r))};
      }

      case 'allocated': {
        const {count, items} = await this.questionRepo.getQueueQuestionSection(
          'allocated',
          skip,
          safeLimit,
          startTime,
          endTime,
          expertSources,
          requirePaeNotDone,
          isTrainingUser,
          isAdmin,
        );
        const byQuestion = new Map<string, string | null>();
        const ids: string[] = [];
        for (const r of items) {
          const id = this.derivePendingAssigneeId(r.queue, r.history as any);
          byQuestion.set(r._id?.toString() ?? '', id);
          if (id) ids.push(id);
          for (const q of r.queue ?? []) ids.push(q?.toString());
        }
        const experts = await resolveExpertMeta(this.userRepo, ids);
        const names = this.expertMetaToNames(experts);
        return {
          count,
          items: items.map(r => {
            const id = byQuestion.get(r._id?.toString() ?? '');
            // Allocated: show plain names (no Author/Reviewer level) and a single
            // status for the current person — 'completed' if no one is pending,
            // otherwise 'waiting' for that person's response.
            return {
              ...this.rawToQueueItem(r),
              expertName: id ? (names.get(id) ?? 'Unknown') : undefined,
              isTrainingUser: id
                ? experts.get(id)?.isTrainingUser === true
                : undefined,
              queueExpertNames: (r.queue ?? []).map(
                q => names.get(q?.toString()) ?? 'Unknown',
              ),
              lastPersonStatus: id ? 'waiting' : 'completed',
            };
          }),
        };
      }

      case 'waiting': {
        // Same method (and therefore the same number) the cron logs as
        // "Never-allocated". No date filter / no DB-side limit — paginate the
        // full list in memory so the count always matches the console.
        const subs =
          (await this.questionSubmissionRepo.findUnallocatedTimeBoundQuestions(
            expertSources,
            requirePaeNotDone,
            isTrainingUser,
            isAdmin,
          )) as any[];
        const pageSubs = subs.slice(skip, skip + safeLimit);
        return {
          count: subs.length,
          items: pageSubs.map(s => submissionToQueueItem(s)),
        };
      }

      case 'freeExperts': {
        const [allExperts, busyMap] = await Promise.all([
          this.userRepo.findExpertsByReputationScore({} as any),
          this.questionSubmissionRepo.getTimeBoundActiveCountPerExpert(
            expertSources,
          ),
        ]);
        // Free = experts with no active time-bound allocation. busyMap is the
        // authoritative "currently holding pending work" set the cron uses.
        const free = (allExperts as any[]).filter(
          e =>
            !busyMap.has(e._id.toString()) &&
            (isAdmin ||
              (isTrainingUser
                ? e.isTrainingUser === true
                : e.isTrainingUser !== true)),
        );
        const items: QueueExpertItem[] = free
          .slice(skip, skip + safeLimit)
          .map(e => ({
            _id: e._id.toString(),
            name:
              `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() ||
              e.email ||
              'Unknown',
            email: e.email,
            reputationScore: e.reputation_score,
            role: e.role,
            isSpecialTaskForce: e.special_task_force === true,
            isTrainingUser: e.isTrainingUser === true,
          }));
        return {count: free.length, items};
      }

      case 'stuck': {
        // Same method (and therefore the same number) the cron logs as "Stuck".
        // No date filter so the count always matches the console.
        const stuckSubs =
          (await this.questionSubmissionRepo.findTimeBoundQuestionsForReallocation(
            expertSources,
            requirePaeNotDone,
            isTrainingUser,
            isAdmin,
          )) as any[];
        const count = stuckSubs.length;
        const pageSubs = stuckSubs.slice(skip, skip + safeLimit);
        const byQuestion = new Map<string, string | null>();
        const ids: string[] = [];
        for (const sub of pageSubs) {
          const id = this.deriveCurrentExpertId(sub.queue, sub.history);
          const qId = (sub.question?._id ?? sub.questionId)?.toString() ?? '';
          byQuestion.set(qId, id);
          if (id) ids.push(id);
          for (const q of sub.queue ?? []) ids.push(q?.toString());
        }
        const experts = await resolveExpertMeta(this.userRepo, ids);
        const names = this.expertMetaToNames(experts);
        const now = Date.now();
        const items: QueueQuestionItem[] = pageSubs.map(sub => {
          const item = submissionToQueueItem(sub);
          const id = byQuestion.get(item._id ?? '');
          const allocatedAt = sub.currentExpertAllocatedAt ?? null;
          return {
            ...item,
            expertName: id ? (names.get(id) ?? 'Unknown') : undefined,
            isTrainingUser: id
              ? experts.get(id)?.isTrainingUser === true
              : undefined,
            queueExpertNames: this.buildQueueExpertNames(sub.queue, names),
            allocatedAt,
            minutesSinceAllocated: allocatedAt
              ? Math.floor((now - new Date(allocatedAt).getTime()) / 60000)
              : undefined,
          };
        });
        return {count, items};
      }

      case 'openedIdle': {
        // Opened by the current expert > 45 min ago but still no answer. No date
        // filter, mirroring the other time-bound sections.
        const subs =
          (await this.questionSubmissionRepo.findOpenedButIdleTimeBoundQuestions(
            expertSources,
          )) as any[];
        const count = subs.length;
        const pageSubs = subs.slice(skip, skip + safeLimit);
        const byQuestion = new Map<string, string | null>();
        const ids: string[] = [];
        for (const sub of pageSubs) {
          const id = this.deriveCurrentExpertId(sub.queue, sub.history);
          const qId = (sub.question?._id ?? sub.questionId)?.toString() ?? '';
          byQuestion.set(qId, id);
          if (id) ids.push(id);
          for (const q of sub.queue ?? []) ids.push(q?.toString());
        }
        const experts = await resolveExpertMeta(this.userRepo, ids);
        const names = this.expertMetaToNames(experts);
        const now = Date.now();
        const items: QueueQuestionItem[] = pageSubs.map(sub => {
          const item = submissionToQueueItem(sub);
          const id = byQuestion.get(item._id ?? '');
          const openedAt = sub.currentExpertOpenedAt ?? null;
          return {
            ...item,
            expertName: id ? (names.get(id) ?? 'Unknown') : undefined,
            isTrainingUser: id
              ? experts.get(id)?.isTrainingUser === true
              : undefined,
            queueExpertNames: this.buildQueueExpertNames(sub.queue, names),
            openedAt,
            minutesSinceOpened: openedAt
              ? Math.floor((now - new Date(openedAt).getTime()) / 60000)
              : undefined,
          };
        });
        return {count, items};
      }

      case 'needsReviewer': {
        // Same method (and therefore the same number) the cron logs as
        // "NeedReviewer": answered/reviewed questions still awaiting the next
        // reviewer. No date filter so the count always matches the console.
        const subs =
          (await this.questionSubmissionRepo.findAnsweredQuestionsNeedingReviewer(
            expertSources,
            requirePaeNotDone,
            isTrainingUser,
            isAdmin,
          )) as any[];
        const count = subs.length;
        const pageSubs = subs.slice(skip, skip + safeLimit);
        // Show every expert who completed a step on the question, in turn order (each
        // history entry's `updatedBy`), rather than only the last completer.
        const byQuestion = new Map<string, string[]>();
        const ids: string[] = [];
        for (const sub of pageSubs) {
          const completedIds = (sub.history ?? [])
            .map((h: any) => h?.updatedBy?.toString())
            .filter((id: string | undefined): id is string => Boolean(id));
          const qId = (sub.question?._id ?? sub.questionId)?.toString() ?? '';
          byQuestion.set(qId, completedIds);
          ids.push(...completedIds);
          for (const q of sub.queue ?? []) ids.push(q?.toString());
        }
        const experts = await resolveExpertMeta(this.userRepo, ids);
        const names = this.expertMetaToNames(experts);
        const items: QueueQuestionItem[] = pageSubs.map(sub => {
          const item = submissionToQueueItem(sub);
          const completedIds = byQuestion.get(item._id ?? '') ?? [];
          const completedExpertNames = completedIds.map(
            id => names.get(id) ?? 'Unknown',
          );
          return {
            ...item,
            completedExpertNames,
            queueExpertNames: this.buildQueueExpertNames(sub.queue, names),
            // Keep expertName as the most recent completer for backward compatibility.
            expertName: completedExpertNames[completedExpertNames.length - 1],
            isTrainingUser:
              completedIds.length > 0
                ? experts.get(completedIds[completedIds.length - 1])
                    ?.isTrainingUser === true
                : undefined,
          };
        });
        return {count, items};
      }

      case 'totalWork': {
        // Everything the time-bound cron acts on: stuck + unallocated + needsReviewer,
        // mirroring reallocateTimeBoundQuestions' `totalWork`. The date range is ignored
        // (same as the cron) so this includes ALL such questions. Each item is tagged
        // with its workType so the UI can show which bucket it came from.
        const [stuckSubs, unallocatedSubs, reviewerSubs] = await Promise.all([
          this.questionSubmissionRepo.findTimeBoundQuestionsForReallocation(
            expertSources,
            requirePaeNotDone,
            isTrainingUser,
            isAdmin,
          ),
          this.questionSubmissionRepo.findUnallocatedTimeBoundQuestions(
            expertSources,
            requirePaeNotDone,
            isTrainingUser,
            isAdmin,
          ),
          this.questionSubmissionRepo.findAnsweredQuestionsNeedingReviewer(
            expertSources,
            requirePaeNotDone,
            isTrainingUser,
            isAdmin,
          ),
        ]);

        type Tagged = {
          sub: any;
          workType: 'stuck' | 'unallocated' | 'needsReviewer';
        };
        const tagged: Tagged[] = [
          ...(stuckSubs as any[]).map(sub => ({
            sub,
            workType: 'stuck' as const,
          })),
          ...(unallocatedSubs as any[]).map(sub => ({
            sub,
            workType: 'unallocated' as const,
          })),
          ...(reviewerSubs as any[]).map(sub => ({
            sub,
            workType: 'needsReviewer' as const,
          })),
        ];

        // Dedupe by questionId (the three states are mutually exclusive, but be safe).
        const byId = new Map<string, Tagged>();
        for (const t of tagged) {
          const qid = (t.sub.questionId ?? t.sub._id)?.toString();
          if (qid && !byId.has(qid)) byId.set(qid, t);
        }

        const all = Array.from(byId.values()).sort((a, b) => {
          const at = new Date(
            a.sub.question?.createdAt ?? a.sub.createdAt ?? 0,
          ).getTime();
          const bt = new Date(
            b.sub.question?.createdAt ?? b.sub.createdAt ?? 0,
          ).getTime();
          return bt - at;
        });

        const count = all.length;
        const pageSubs = all.slice(skip, skip + safeLimit);
        const items: QueueQuestionItem[] = pageSubs.map(t => ({
          ...submissionToQueueItem(t.sub),
          workType: t.workType,
        }));
        return {count, items};
      }

      case 'moderatorWaiting': {
        // In-review/duplicate questions with no moderator yet, PLUS waiting feedback
        // questions (closed + open feedback, no reviewer) — both need the moderator queue.
        const [inReviewQs, waitingFeedback] = await Promise.all([
          this.questionRepo.findUnassignedInReviewQuestions(
            [],
            isTrainingUser,
            isAdmin,
          ),
          this.getWaitingFeedbackQuestions(isTrainingUser, isAdmin),
        ]);
        // Order the merged queue by effective wait time: in-review by createdAt,
        // feedback by recentFeedback (falls back to createdAt).
        const qs = [...(inReviewQs as any[]), ...waitingFeedback].sort(
          (a, b) => this.effectiveQueueTime(a) - this.effectiveQueueTime(b),
        );
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        // Map a full question doc through the submission mapper (wraps it as `.question`).
        return {
          count,
          items: pageQs.map(q => submissionToQueueItem({question: q})),
        };
      }

      case 'moderatorAllocated': {
        // Questions currently assigned to a moderator (moderatorId set). Re-routed
        // questions always carry a moderatorId, so they appear here too. Each item
        // is tagged with the assigned moderator's name.
        const qs = (await this.questionRepo.findModeratorAssignedQuestions(
          [],
          isTrainingUser,
          isAdmin,
        )) as any[];
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        const ids = pageQs
          .map(q => q.moderatorId?.toString())
          .filter(Boolean) as string[];
        const moderators = await resolveExpertMeta(this.userRepo, ids);
        const items: QueueQuestionItem[] = pageQs.map(q => ({
          ...submissionToQueueItem({question: q}),
          moderatorName: q.moderatorId
            ? (moderators.get(q.moderatorId.toString())?.name ?? 'Unknown')
            : undefined,
          isTrainingUser: q.moderatorId
            ? moderators.get(q.moderatorId.toString())?.isTrainingUser === true
            : undefined,
        }));
        return {count, items};
      }

      case 'availableModerators': {
        // Same method (and therefore the same pool) the moderator-queue cron assigns
        // from: STF moderators with no question currently assigned.
        const mods =
          (await this.userRepo.findAvailableStfModerators()) as any[];
        const items: QueueExpertItem[] = mods
          .slice(skip, skip + safeLimit)
          .map(m => ({
            _id: m._id.toString(),
            name:
              `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() ||
              m.email ||
              'Unknown',
            email: m.email,
            reputationScore: m.reputation_score,
            role: m.role,
            isSpecialTaskForce: m.special_task_force === true,
            isTrainingUser: m.isTrainingUser === true,
          }));
        return {count: mods.length, items};
      }

      // ── Source-split moderator-queue sections (time-bound vs manual) ──
      // Same data as the three sections above, scoped to one source group so the UI
      // can show the moderator queue split into Time-bound / Manual.
      case 'moderatorWaitingTimeBound':
      case 'moderatorWaitingManual': {
        const isTimeBound = section === 'moderatorWaitingTimeBound';
        const sources = isTimeBound ? TIME_BOUND_SOURCES : MANUAL_SOURCES;
        const inReviewQs =
          (await this.questionRepo.findUnassignedInReviewQuestions(
            sources,
            isTrainingUser,
            isAdmin,
          )) as any[];
        // Feedback questions go in the TIME-BOUND column irrespective of source
        // (feedback counts as time-bound); the Manual column shows in-review only.
        const waitingFeedback = isTimeBound
          ? await this.getWaitingFeedbackQuestions(isTrainingUser, isAdmin)
          : [];
        // Order the merged queue by effective wait time: in-review by createdAt,
        // feedback by recentFeedback (falls back to createdAt).
        const qs = [...inReviewQs, ...waitingFeedback].sort(
          (a, b) => this.effectiveQueueTime(a) - this.effectiveQueueTime(b),
        );
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        return {
          count,
          items: pageQs.map(q => submissionToQueueItem({question: q})),
        };
      }

      case 'moderatorAllocatedTimeBound':
      case 'moderatorAllocatedManual': {
        const sources =
          section === 'moderatorAllocatedTimeBound'
            ? TIME_BOUND_SOURCES
            : MANUAL_SOURCES;
        const qs = (await this.questionRepo.findModeratorAssignedQuestions(
          sources,
          isTrainingUser,
          isAdmin,
        )) as any[];
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        const ids = pageQs
          .map(q => q.moderatorId?.toString())
          .filter(Boolean) as string[];
        const moderators = await resolveExpertMeta(this.userRepo, ids);
        const items: QueueQuestionItem[] = pageQs.map(q => ({
          ...submissionToQueueItem({question: q}),
          moderatorName: q.moderatorId
            ? (moderators.get(q.moderatorId.toString())?.name ?? 'Unknown')
            : undefined,
          isTrainingUser: q.moderatorId
            ? moderators.get(q.moderatorId.toString())?.isTrainingUser === true
            : undefined,
        }));
        return {count, items};
      }

      case 'availableModeratorsTimeBound':
      case 'availableModeratorsManual': {
        const isTimeBound = section === 'availableModeratorsTimeBound';
        const sources = isTimeBound ? TIME_BOUND_SOURCES : MANUAL_SOURCES;
        const modsRaw =
          (await this.userRepo.findAvailableStfModeratorsForSources(
            sources,
            isTrainingUser,
            isAdmin,
          )) as any[];
        // Feedback counts as a time-bound item, so a moderator holding a feedback is
        // NOT free for the time-bound queue (they're still free for the manual one).
        const mods = isTimeBound
          ? modsRaw.filter(m => !m.feedbacksAssigned?.length)
          : modsRaw;
        const items: QueueExpertItem[] = mods
          .slice(skip, skip + safeLimit)
          .map(m => ({
            _id: m._id.toString(),
            name:
              `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() ||
              m.email ||
              'Unknown',
            email: m.email,
            reputationScore: m.reputation_score,
            role: m.role,
            isSpecialTaskForce: m.special_task_force === true,
            isTrainingUser: m.isTrainingUser === true,
          }));
        return {count: mods.length, items};
      }

      // ── Gate keeper / auditor role queues (mirror the moderator queue sections) ──
      case 'gateKeeperWaiting':
      case 'auditorWaiting': {
        const isGK = section === 'gateKeeperWaiting';
        const qs = await this.questionRepo.findUnassignedQuestionsForRole(
          isGK
            ? GATE_KEEPER_STATUSES
            : AUDITOR_STATUSES,
          isGK ? 'gateKeeperId' : 'auditorId',
          isGK ? 'autoAllocateGateKeeper' : 'autoAllocateAuditor',
        );
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        return {
          count,
          items: pageQs.map(q => submissionToQueueItem({question: q})),
        };
      }

      case 'gateKeeperAllocated':
      case 'auditorAllocated': {
        const isGK = section === 'gateKeeperAllocated';
        const assigneeField = isGK ? 'gateKeeperId' : 'auditorId';
        const qs = await this.questionRepo.findQuestionsAssignedToRole(
          assigneeField,
          isGK
            ? GATE_KEEPER_STATUSES
            : AUDITOR_STATUSES,
        );
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        const ids = pageQs
          .map(q => (q as any)[assigneeField]?.toString())
          .filter(Boolean) as string[];
        const assignees = await resolveExpertMeta(this.userRepo, ids);
        const items: QueueQuestionItem[] = pageQs.map(q => {
          const id = (q as any)[assigneeField]?.toString();
          return {
            ...submissionToQueueItem({question: q}),
            assigneeName: id
              ? (assignees.get(id)?.name ?? 'Unknown')
              : undefined,
            isTrainingUser: id
              ? assignees.get(id)?.isTrainingUser === true
              : undefined,
          };
        });
        return {count, items};
      }

      case 'availableGateKeepers':
      case 'availableAuditors': {
        const role =
          section === 'availableGateKeepers' ? 'gate_keeper' : 'auditor';
        const users = (await this.userRepo.findAvailableUsersByRole(
          role,
        )) as any[];
        const items: QueueExpertItem[] = users
          .slice(skip, skip + safeLimit)
          .map(u => ({
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
          }));
        return {count: users.length, items};
      }

      // ── Feedback-review queue ──
      case 'feedbackAllocated': {
        // One row per open feedback-review round (reviewer + question).
        const open =
          await this.questionSubmissionRepo.findOpenFeedbackReviews();
        const count = open.length;
        const page = open.slice(skip, skip + safeLimit);
        const questions = await this.questionRepo.findByIds(
          page
            .map(o => o.questionId)
            .filter(Boolean)
            .map(id => new ObjectId(id)),
        );
        const qById = new Map(questions.map(q => [q._id?.toString(), q]));
        const reviewers = await resolveExpertMeta(this.userRepo, 
          page.map(o => o.reviewerId).filter(Boolean),
        );
        const items: QueueQuestionItem[] = page.map(o => ({
          ...submissionToQueueItem({question: qById.get(o.questionId)}),
          assigneeName: reviewers.get(o.reviewerId)?.name ?? 'Unknown',
          isTrainingUser: reviewers.get(o.reviewerId)?.isTrainingUser === true,
        }));
        return {count, items};
      }

      case 'feedbackWaiting': {
        // Questions with an open feedback minus the ones already assigned a reviewer.
        const [openQs, openReviews] = await Promise.all([
          this.questionRepo.findQuestionsWithOpenFeedbacks(),
          this.questionSubmissionRepo.findOpenFeedbackReviews(),
        ]);
        const allocatedIds = new Set(openReviews.map(o => o.questionId));
        const waitingQs = openQs.filter(
          q => !allocatedIds.has(q._id?.toString()),
        );
        const count = waitingQs.length;
        const pageQs = waitingQs.slice(skip, skip + safeLimit);
        return {
          count,
          items: pageQs.map(q => submissionToQueueItem({question: q})),
        };
      }

      case 'availableFeedbackReviewers': {
        const users =
          (await this.userRepo.findAvailableFeedbackReviewers()) as any[];
        const items: QueueExpertItem[] = users
          .slice(skip, skip + safeLimit)
          .map(u => ({
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
          }));
        return {count: users.length, items};
      }

      default:
        return {count: 0, items: []};
    }
  }

  /** Moderator/admin "Queue Details" — counts for all sections plus the first
   *  page (50) of each. Subsequent pages are fetched via getQueueSection.
   *  Touches no allocation state. The time-bound sections (waiting, stuck,
   *  needsReviewer) ignore the date range so their counts match the cron logs. */
  async getQueueDetails(
    startTime?: Date,
    endTime?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<QueueDetailsResponse> {
    const PAGE = 1;
    const LIMIT = 50;
    // Run each section independently so one failing section logs which one broke and
    // returns an empty result, rather than 500ing the whole queue-details endpoint.
    const safe = async (
      section: QueueSectionName,
    ): Promise<QueueSectionResult> => {
      try {
        return await this.getQueueSection(
          section,
          PAGE,
          LIMIT,
          startTime,
          endTime,
          isTrainingUser,
          isAdmin,
        );
      } catch (err: any) {
        console.error(
          `[getQueueDetails] section '${section}' failed:`,
          err?.message,
          err?.stack?.split('\n')?.slice(0, 4)?.join('\n'),
        );
        return {count: 0, items: []};
      }
    };
    const [
      received,
      autoAllocateOff,
      autoAllocateOpen,
      autoAllocateDelayed,
      allocated,
      waiting,
      freeExperts,
      stuck,
      needsReviewer,
      totalWork,
      openedIdle,
      moderatorWaiting,
      moderatorAllocated,
      availableModerators,
      moderatorWaitingTimeBound,
      moderatorWaitingManual,
      moderatorAllocatedTimeBound,
      moderatorAllocatedManual,
      availableModeratorsTimeBound,
      availableModeratorsManual,
      gateKeeperWaiting,
      gateKeeperAllocated,
      availableGateKeepers,
      auditorWaiting,
      auditorAllocated,
      availableAuditors,
      feedbackWaiting,
      feedbackAllocated,
      availableFeedbackReviewers,
      receivedStatusCounts,
      // Manual expert-queue sections (AGRI_EXPERT/OUTREACH single-allocation)
      receivedManual,
      autoAllocateOffManual,
      autoAllocateOpenManual,
      autoAllocateDelayedManual,
      allocatedManual,
      waitingManual,
      freeExpertsManual,
      stuckManual,
      needsReviewerManual,
      openedIdleManual,
      receivedStatusCountsManual,
    ] = await Promise.all([
      safe('received'),
      safe('autoAllocateOff'),
      safe('autoAllocateOpen'),
      safe('autoAllocateDelayed'),
      safe('allocated'),
      safe('waiting'),
      safe('freeExperts'),
      safe('stuck'),
      safe('needsReviewer'),
      safe('totalWork'),
      safe('openedIdle'),
      safe('moderatorWaiting'),
      safe('moderatorAllocated'),
      safe('availableModerators'),
      safe('moderatorWaitingTimeBound'),
      safe('moderatorWaitingManual'),
      safe('moderatorAllocatedTimeBound'),
      safe('moderatorAllocatedManual'),
      safe('availableModeratorsTimeBound'),
      safe('availableModeratorsManual'),
      safe('gateKeeperWaiting'),
      safe('gateKeeperAllocated'),
      safe('availableGateKeepers'),
      safe('auditorWaiting'),
      safe('auditorAllocated'),
      safe('availableAuditors'),
      safe('feedbackWaiting'),
      safe('feedbackAllocated'),
      safe('availableFeedbackReviewers'),
      // Separate aggregation — not a paginatable section, so call directly
      this.questionRepo
        .getReceivedStatusCounts(startTime, endTime)
        .catch((err: any) => {
          console.error(
            '[getQueueDetails] receivedStatusCounts failed:',
            err?.message,
          );
          return [] as {status: string; count: number}[];
        }),
      safe('receivedManual'),
      safe('autoAllocateOffManual'),
      safe('autoAllocateOpenManual'),
      safe('autoAllocateDelayedManual'),
      safe('allocatedManual'),
      safe('waitingManual'),
      safe('freeExpertsManual'),
      safe('stuckManual'),
      safe('needsReviewerManual'),
      safe('openedIdleManual'),
      this.questionRepo
        .getReceivedStatusCounts(startTime, endTime, MANUAL_SOURCES)
        .catch((err: any) => {
          console.error(
            '[getQueueDetails] receivedStatusCountsManual failed:',
            err?.message,
          );
          return [] as {status: string; count: number}[];
        }),
    ]);

    return {
      received: received as QueueDetailsResponse['received'],
      receivedStatusCounts:
        receivedStatusCounts as QueueDetailsResponse['receivedStatusCounts'],
      autoAllocateOff:
        autoAllocateOff as QueueDetailsResponse['autoAllocateOff'],
      autoAllocateOpen:
        autoAllocateOpen as QueueDetailsResponse['autoAllocateOpen'],
      autoAllocateDelayed:
        autoAllocateDelayed as QueueDetailsResponse['autoAllocateDelayed'],
      allocated: allocated as QueueDetailsResponse['allocated'],
      waiting: waiting as QueueDetailsResponse['waiting'],
      freeExperts: freeExperts as QueueDetailsResponse['freeExperts'],
      stuck: stuck as QueueDetailsResponse['stuck'],
      needsReviewer: needsReviewer as QueueDetailsResponse['needsReviewer'],
      totalWork: totalWork as QueueDetailsResponse['totalWork'],
      openedIdle: openedIdle as QueueDetailsResponse['openedIdle'],
      moderatorWaiting:
        moderatorWaiting as QueueDetailsResponse['moderatorWaiting'],
      moderatorAllocated:
        moderatorAllocated as QueueDetailsResponse['moderatorAllocated'],
      availableModerators:
        availableModerators as QueueDetailsResponse['availableModerators'],
      moderatorWaitingTimeBound:
        moderatorWaitingTimeBound as QueueDetailsResponse['moderatorWaitingTimeBound'],
      moderatorWaitingManual:
        moderatorWaitingManual as QueueDetailsResponse['moderatorWaitingManual'],
      moderatorAllocatedTimeBound:
        moderatorAllocatedTimeBound as QueueDetailsResponse['moderatorAllocatedTimeBound'],
      moderatorAllocatedManual:
        moderatorAllocatedManual as QueueDetailsResponse['moderatorAllocatedManual'],
      availableModeratorsTimeBound:
        availableModeratorsTimeBound as QueueDetailsResponse['availableModeratorsTimeBound'],
      availableModeratorsManual:
        availableModeratorsManual as QueueDetailsResponse['availableModeratorsManual'],

      // ── Gate keeper / auditor role queues ──
      gateKeeperWaiting:
        gateKeeperWaiting as QueueDetailsResponse['gateKeeperWaiting'],
      gateKeeperAllocated:
        gateKeeperAllocated as QueueDetailsResponse['gateKeeperAllocated'],
      availableGateKeepers:
        availableGateKeepers as QueueDetailsResponse['availableGateKeepers'],
      auditorWaiting: auditorWaiting as QueueDetailsResponse['auditorWaiting'],
      auditorAllocated:
        auditorAllocated as QueueDetailsResponse['auditorAllocated'],
      availableAuditors:
        availableAuditors as QueueDetailsResponse['availableAuditors'],
      // ── Feedback-review queue ──
      feedbackWaiting:
        feedbackWaiting as QueueDetailsResponse['feedbackWaiting'],
      feedbackAllocated:
        feedbackAllocated as QueueDetailsResponse['feedbackAllocated'],
      availableFeedbackReviewers:
        availableFeedbackReviewers as QueueDetailsResponse['availableFeedbackReviewers'],
      // ── Manual expert-queue sections ──
      receivedManual: receivedManual as QueueDetailsResponse['receivedManual'],
      receivedStatusCountsManual:
        receivedStatusCountsManual as QueueDetailsResponse['receivedStatusCountsManual'],
      autoAllocateOffManual:
        autoAllocateOffManual as QueueDetailsResponse['autoAllocateOffManual'],
      autoAllocateOpenManual:
        autoAllocateOpenManual as QueueDetailsResponse['autoAllocateOpenManual'],
      autoAllocateDelayedManual:
        autoAllocateDelayedManual as QueueDetailsResponse['autoAllocateDelayedManual'],
      allocatedManual:
        allocatedManual as QueueDetailsResponse['allocatedManual'],
      waitingManual: waitingManual as QueueDetailsResponse['waitingManual'],
      freeExpertsManual:
        freeExpertsManual as QueueDetailsResponse['freeExpertsManual'],
      stuckManual: stuckManual as QueueDetailsResponse['stuckManual'],
      needsReviewerManual:
        needsReviewerManual as QueueDetailsResponse['needsReviewerManual'],
      openedIdleManual:
        openedIdleManual as QueueDetailsResponse['openedIdleManual'],
    };
  }
}
