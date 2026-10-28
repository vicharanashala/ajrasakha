import {inject, injectable} from 'inversify';
import {ObjectId} from 'mongodb';
import {BadRequestError, HttpError, NotFoundError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  GdbCleaningAction,
  GdbCleaningStatus,
  IGdbCleaning,
  IGdbCleaningCheck,
  IGdbCleaningSource,
} from '#root/shared/interfaces/models.js';
import {
  GdbCleaningListRow,
  IGdbCleaningRepository,
} from '#root/shared/database/interfaces/IGdbCleaningRepository.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {IAnswerApprovalService} from '#root/modules/answer/interfaces/IAnswerApprovalService.js';
import type {UpdateAnswerBody} from '#root/modules/answer/classes/validators/AnswerValidator.js';
import {
  GdbCleaningItem,
  GdbCleaningListItem,
  GdbCleaningListQuery,
  GdbHistoryQuery,
  GdbHistoryResponse,
  IGdbCleaningService,
} from '../interfaces/IGdbCleaningService.js';

const DEFAULT_LIMIT = 25;
// each reviewer holds up to this many to-do answers
const MAX_OPEN = 50;
// a reviewer who does nothing for this long gets the answers they have not touched taken back
const QUIET_DAYS = 3;

// an answer can be changed while it is to do or has no flags; a decided one is closed
const isEditable = (status: GdbCleaningStatus) =>
  status === 'todo' || status === 'clean';

// two lists of sources say the same thing
const sameSources = (a: IGdbCleaningSource[], b: IGdbCleaningSource[]) => {
  const key = (s: IGdbCleaningSource) =>
    [s.source.trim(), String(s.page ?? '').trim(), (s.sourceName ?? '').trim(), s.sourceType ?? ''].join('|');
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.length === right.length && left.every((k, i) => k === right[i]);
};

// does a check count as a flag, after any change by a reviewer
const isFlagged = (check: IGdbCleaningCheck) =>
  (check.override ? check.override.result : check.result) === 'FAIL';

// who holds an answer, as the person looking at it needs to know
const holder = (
  doc: {assignedTo?: ObjectId},
  viewerId?: string,
  names?: Map<string, string>,
) => {
  const id = doc.assignedTo?.toString();
  return {
    assigned: Boolean(id),
    assignedToMe: Boolean(id) && id === viewerId,
    assignedToName: (id && names?.get(id)) || null,
  };
};

const toListItem = (
  row: GdbCleaningListRow,
  viewerId?: string,
  names?: Map<string, string>,
): GdbCleaningListItem => ({
  id: row.answerId.toString(),
  question: row.question,
  state: row.state,
  crop: row.crop,
  domain: row.domain,
  flags: row.flags ?? [],
  notEvaluated: row.notEvaluated ?? [],
  status: row.status,
  ...holder(row, viewerId, names),
});

const toItem = (
  doc: IGdbCleaning,
  viewerId?: string,
  names?: Map<string, string>,
): GdbCleaningItem => ({
  ...toListItem(doc, viewerId, names),
  questionId: doc.questionId.toString(),
  answer: doc.answer,
  sources: doc.sources ?? [],
  checks: doc.checks ?? [],
  sourcesEdited: Boolean(doc.originalSources),
  originalSources: doc.originalSources ?? [],
  pushedAt: doc.pushedAt ? new Date(doc.pushedAt).toISOString() : null,
  correctedAnswer: doc.correctedAnswer ?? null,
  comment: doc.comment ?? null,
  checkedAt: doc.checkedAt ? new Date(doc.checkedAt).toISOString() : null,
  reviewedAt: doc.reviewedAt ? new Date(doc.reviewedAt).toISOString() : null,
});

@injectable()
export class GdbCleaningService implements IGdbCleaningService {

  constructor(
    @inject(GLOBAL_TYPES.GdbCleaningRepository)
    private readonly repository: IGdbCleaningRepository,

    // the golden answers, and the app's own flow for editing a final answer
    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepository: IAnswerRepository,

    @inject(GLOBAL_TYPES.AnswerApprovalService)
    private readonly approvalService: IAnswerApprovalService,

    // reviewers' names, for the history of everyone
    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepository: IUserRepository,
  ) {}

  // A reviewer's action goes in the answer's history. The action itself is already saved,
  // so a failure here is logged and never undoes or blocks it.
  private async record(
    answerId: string,
    userId: string | undefined,
    action: GdbCleaningAction,
    details?: Record<string, unknown>,
  ): Promise<void> {
    if (!userId) return;
    try {
      await this.repository.addHistory(answerId, {
        userId: new ObjectId(userId),
        action,
        at: new Date(),
        details,
      });
    } catch (error) {
      console.error(`Could not record "${action}" for answer ${answerId}:`, error);
    }
  }

  // two dates, or none
  private static period(from?: string, to?: string) {
    if (!from && !to) return {};
    if (!from || !to) throw new BadRequestError('Give both the start and the end date');
    const start = new Date(from);
    const end = new Date(to);
    if (start > end) throw new BadRequestError('The start date is after the end date');
    return {from: start, to: end};
  }

  // names of the reviewers who hold these answers
  private async holderNames(rows: {assignedTo?: ObjectId}[]) {
    const ids = [...new Set(rows.map(r => r.assignedTo?.toString()).filter(Boolean))] as string[];
    const users = ids.length
      ? await this.userRepository.getUsersByIds(ids, undefined, {firstName: 1, lastName: 1})
      : [];
    return new Map(
      users.map(u => [String(u._id), [u.firstName, u.lastName].filter(Boolean).join(' ')]),
    );
  }

  // An answer given to one reviewer can be changed by that reviewer only. One nobody holds is open to all.
  private async assertHolder(doc: IGdbCleaning, reviewerId: string): Promise<void> {
    const owner = doc.assignedTo?.toString();
    if (!owner || owner === reviewerId) return;
    const name = (await this.holderNames([doc])).get(owner);
    throw new HttpError(
      403,
      `This answer is assigned to ${name || 'another reviewer'}. Ask for it to be released first`,
    );
  }

  // When a reviewer finishes an answer they held, they get another to keep their 50.
  // The answer is already saved, so a failure here is only logged: the hourly job fills it later.
  private async refillAfter(doc: IGdbCleaning, reviewerId: string): Promise<void> {
    if (doc.assignedTo?.toString() !== reviewerId) return;
    try {
      await this.refill(reviewerId);
    } catch (error) {
      console.error(`Could not give reviewer ${reviewerId} the next answers:`, error);
    }
  }

  async refill(userId: string) {
    const open = await this.repository.countOpenAssigned(userId);
    if (open >= MAX_OPEN) return {open, claimed: 0};
    const claimed = await this.repository.claimFree(userId, MAX_OPEN - open);
    return {open: open + claimed, claimed};
  }

  async release(answerId: string, byUserId: string) {
    const doc = await this.repository.getByAnswerId(answerId);
    if (!doc) throw new NotFoundError(`Answer "${answerId}" not found`);
    if (doc.assignedTo && (await this.repository.release(answerId))) {
      await this.record(answerId, byUserId, 'released', {from: doc.assignedTo.toString()});
    }
    return toItem((await this.repository.getByAnswerId(answerId)) ?? doc, byUserId);
  }

  async releaseAll(userId: string) {
    return {released: await this.repository.releaseOf(userId, false)};
  }

  async runAssignmentCron() {
    const assignees = await this.repository.listAssignees();
    if (!assignees.length) return {released: 0, toppedUp: 0};
    const users = await this.userRepository.getUsersByIds(assignees, undefined, {role: 1, isBlocked: 1});
    const quietBefore = Date.now() - QUIET_DAYS * 24 * 60 * 60 * 1000;
    let released = 0;
    let toppedUp = 0;
    for (const id of assignees) {
      try {
        const user = users.find(u => String(u._id) === id);
        // a reviewer who is gone, blocked or no longer an admin gives everything back
        if (!user || user.isBlocked === true || (user.role as string) !== 'admin') {
          released += await this.repository.releaseOf(id, false);
          continue;
        }
        const last = await this.repository.lastActivityAt(id);
        if (!last || last.getTime() < quietBefore) {
          released += await this.repository.releaseOf(id, true);
        } else {
          toppedUp += (await this.refill(id)).claimed;
        }
      } catch (error) {
        // one reviewer's problem does not stop the others
        console.error(`Assignment job failed for reviewer ${id}:`, error);
      }
    }
    return {released, toppedUp};
  }

  async list(query: GdbCleaningListQuery, viewerId?: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const {rows, totalCount} = await this.repository.list({
      search: query.search,
      states: query.states,
      crops: query.crops,
      flags: query.flags,
      statuses: query.statuses,
      assignedTo: query.assignee === 'me' ? viewerId : undefined,
      unassigned: query.assignee === 'unassigned',
      page,
      limit,
    });
    const names = await this.holderNames(rows);
    return {
      items: rows.map(row => toListItem(row, viewerId, names)),
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      page,
      limit,
    };
  }

  async summary(range?: {from?: string; to?: string}) {
    const counts = await this.repository.countByStatus();
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const {from, to} = GdbCleaningService.period(range?.from, range?.to);
    const decided = await this.repository.countInRange(from, to);
    // to do, no flags and the total are as of now; fixed, dismissed and pushed follow the dates
    return {
      ...counts,
      fixed: decided.fixed,
      dismissed: decided.dismissed,
      pushed: decided.pushed,
      total,
      ranged: Boolean(from && to),
    };
  }

  async history(query: GdbHistoryQuery, userId: string): Promise<GdbHistoryResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const {from, to} = GdbCleaningService.period(query.from, query.to);
    const {rows, totalCount, answers} = await this.repository.listHistory({
      userId: query.scope === 'all' ? undefined : userId,
      from,
      to,
      page,
      limit,
    });
    const ids = [...new Set(rows.map(row => row.userId.toString()))];
    const users = ids.length
      ? await this.userRepository.getUsersByIds(ids, undefined, {firstName: 1, lastName: 1})
      : [];
    const nameOf = (id: string) => {
      const user = users.find(u => String(u._id) === id);
      return user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : null;
    };
    return {
      entries: rows.map(row => ({
        answerId: row.answerId.toString(),
        question: row.question,
        action: row.action,
        at: new Date(row.at).toISOString(),
        userId: row.userId.toString(),
        userName: nameOf(row.userId.toString()),
        details: row.details ?? null,
      })),
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      page,
      limit,
      answersHandled: answers,
    };
  }

  filterOptions() {
    return this.repository.getFilterOptions();
  }

  async get(answerId: string, viewerId?: string): Promise<GdbCleaningItem> {
    const doc = await this.repository.getByAnswerId(answerId);
    if (!doc) throw new NotFoundError(`Answer "${answerId}" not found`);
    return toItem(doc, viewerId, await this.holderNames([doc]));
  }

  async saveCorrection(
    answerId: string,
    correctedAnswer: string,
    reviewerId?: string,
  ): Promise<GdbCleaningItem> {
    const text = correctedAnswer.trim();
    if (!text) throw new BadRequestError('The correction cannot be empty');
    const current = await this.repository.getByAnswerId(answerId);
    if (!current) throw new NotFoundError(`Answer "${answerId}" not found`);
    if (reviewerId) await this.assertHolder(current, reviewerId);
    const updated = await this.repository.saveCorrection(answerId, text);
    const item = toItem(updated ?? (await this.explainRefusal(answerId)), reviewerId);
    await this.record(answerId, reviewerId, 'correction_saved');
    return item;
  }

  async editFlag(
    answerId: string,
    edit: {parameter: string; result: 'PASS' | 'FAIL'; comment: string},
    reviewerId: string,
  ): Promise<GdbCleaningItem> {
    const comment = edit.comment.trim();
    if (!comment) throw new BadRequestError('A comment is required');
    const current = await this.repository.getByAnswerId(answerId);
    if (!current) throw new NotFoundError(`Answer "${answerId}" not found`);
    await this.assertHolder(current, reviewerId);
    if (!isEditable(current.status)) return toItem(await this.explainRefusal(answerId));
    const target = (current.checks ?? []).find(c => c.parameter === edit.parameter);
    if (!target) {
      throw new BadRequestError(`There is no check called "${edit.parameter}"`);
    }
    const systemFlagged = target.result === 'FAIL';
    const wantsFlagged = edit.result === 'FAIL';
    const checks = current.checks.map(check => {
      if (check.parameter !== edit.parameter) return check;
      // the same as what the system found is no change at all, so it clears an earlier one
      if (systemFlagged === wantsFlagged) {
        const {override: _cleared, ...rest} = check;
        return rest;
      }
      return {
        ...check,
        override: {
          result: edit.result,
          comment,
          by: reviewerId,
          at: new Date(),
        },
      };
    });
    const flags = checks.filter(isFlagged).map(c => c.parameter);
    // the row follows its flags: any flag left means "to do", none means "no flags"
    const stillOpen = flags.length > 0 || (current.notEvaluated ?? []).length > 0;
    const updated = await this.repository.saveChecks(
      answerId,
      checks,
      flags,
      stillOpen ? 'todo' : 'clean',
    );
    const item = toItem(updated ?? (await this.explainRefusal(answerId)), reviewerId);
    await this.record(answerId, reviewerId, 'flag_changed', {
      parameter: edit.parameter,
      result: edit.result,
      comment,
    });
    return item;
  }

  async editSources(
    answerId: string,
    sources: IGdbCleaningSource[],
    reviewerId: string,
  ): Promise<GdbCleaningItem> {
    const current = await this.repository.getByAnswerId(answerId);
    if (!current) throw new NotFoundError(`Answer "${answerId}" not found`);
    await this.assertHolder(current, reviewerId);
    if (!isEditable(current.status)) return toItem(await this.explainRefusal(answerId));
    const clean = sources.map(source => ({
      sourceName: source.sourceName.trim(),
      source: source.source.trim(),
      page: source.page.trim(),
      ...(source.sourceType ? {sourceType: source.sourceType} : {}),
    }));
    // the first edit keeps the pipeline's sources, later edits keep those
    const original = current.originalSources ?? current.sources ?? [];
    const updated = await this.repository.saveSources(
      answerId,
      clean,
      original,
      reviewerId,
    );
    const item = toItem(updated ?? (await this.explainRefusal(answerId)), reviewerId);
    await this.record(answerId, reviewerId, 'sources_edited', {count: clean.length});
    return item;
  }

  async pushToGdb(
    answerId: string,
    reviewerId: string,
  ): Promise<GdbCleaningItem> {
    const row = await this.repository.getByAnswerId(answerId);
    if (!row) throw new NotFoundError(`Answer "${answerId}" not found`);
    if (row.status !== 'fixed' || !row.correctedAnswer?.trim()) {
      throw new HttpError(409, 'Only an accepted correction can be pushed');
    }
    const golden = await this.answerRepository.getById(answerId);
    if (!golden) {
      throw new NotFoundError('The golden answer was not found');
    }
    if (!golden.isFinalAnswer) {
      throw new BadRequestError('Only the final answer of a question can be replaced');
    }
    // the golden answer must still be the text that was checked, or the correction that was pushed
    // from here before: anything else was edited by someone else in between, so stop
    const goldenText = (golden.answer ?? '').trim();
    const correction = row.correctedAnswer.trim();
    if (goldenText !== row.answer.trim() && goldenText !== correction) {
      throw new HttpError(
        409,
        'The golden answer was edited after it was checked. Review it again before pushing',
      );
    }
    // the sources of the row, as the expert left them. A source whose link is unchanged keeps the type it had
    const goldenSources = golden.sources ?? [];
    const sources = (row.sources ?? []).map(source => {
      const before = goldenSources.find(g => g.source === source.source);
      const sourceType = source.sourceType ?? before?.sourceType;
      return {
        ...(sourceType ? {sourceType} : {}),
        sourceName: source.sourceName,
        source: source.source,
        page: source.page,
      };
    });
    const sourcesChanged = !sameSources(
      sources as IGdbCleaningSource[],
      goldenSources.map(g => ({
        source: g.source,
        sourceName: g.sourceName ?? '',
        page: String(g.page ?? ''),
        sourceType: g.sourceType,
      })),
    );
    if (goldenText === correction && !sourcesChanged) {
      throw new HttpError(409, 'The golden answer already matches this row: nothing to push');
    }
    // the app's own edit flow: it updates the answer, its embedding and the question's text and
    // embedding together, and refuses a question without a normalised crop and location
    await this.approvalService.approveAnswer(reviewerId, {
      answerId,
      questionId: row.questionId.toString(),
      answer: correction,
      sources: sources.length ? sources : goldenSources,
    } as UpdateAnswerBody);
    const updated = await this.repository.markPushed(answerId, reviewerId);
    await this.record(answerId, reviewerId, 'pushed');
    return toItem(updated ?? row, reviewerId);
  }

  async decide(
    answerId: string,
    decision: {
      action: 'accept' | 'dismiss';
      correctedAnswer?: string;
      comment?: string;
    },
    reviewerId: string,
  ): Promise<GdbCleaningItem> {
    const comment = decision.comment?.trim() || null;

    if (decision.action === 'dismiss') {
      const open = await this.repository.getByAnswerId(answerId);
      if (open) await this.assertHolder(open, reviewerId);
      if (open && open.status === 'clean') {
        throw new BadRequestError('This answer has no flags to dismiss');
      }
      const updated = await this.repository.decide(answerId, {
        status: 'dismissed',
        comment,
        reviewerId,
      });
      const item = toItem(updated ?? (await this.explainRefusal(answerId)), reviewerId);
      await this.record(answerId, reviewerId, 'dismissed', {comment});
      if (open) await this.refillAfter(open, reviewerId);
      return item;
    }

    // accepting needs a correction: the one in the request, or the one saved earlier
    const current = await this.repository.getByAnswerId(answerId);
    if (!current) throw new NotFoundError(`Answer "${answerId}" not found`);
    await this.assertHolder(current, reviewerId);
    const correctedAnswer =
      decision.correctedAnswer?.trim() || current.correctedAnswer?.trim();
    if (!correctedAnswer) {
      throw new BadRequestError('There is no correction to accept');
    }
    const updated = await this.repository.decide(answerId, {
      status: 'fixed',
      correctedAnswer,
      comment,
      reviewerId,
    });
    const item = toItem(updated ?? (await this.explainRefusal(answerId)), reviewerId);
    await this.record(answerId, reviewerId, 'accepted', {comment});
    await this.refillAfter(current, reviewerId);
    return item;
  }

  // The update only goes through for an answer that is still "todo".
  // Tell the caller whether the answer is missing or already decided.
  private async explainRefusal(answerId: string): Promise<never> {
    const doc = await this.repository.getByAnswerId(answerId);
    if (!doc) throw new NotFoundError(`Answer "${answerId}" not found`);
    const status: GdbCleaningStatus = doc.status;
    throw new HttpError(
      409,
      status === 'fixed' || status === 'dismissed'
        ? `This answer has already been ${status}`
        : `This answer cannot be changed while its status is "${status}"`,
    );
  }
}
