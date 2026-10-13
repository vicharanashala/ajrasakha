import {inject, injectable} from 'inversify';
import {BadRequestError, HttpError, NotFoundError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  GdbCleaningStatus,
  IGdbCleaning,
} from '#root/shared/interfaces/models.js';
import {
  GdbCleaningListRow,
  IGdbCleaningRepository,
} from '#root/shared/database/interfaces/IGdbCleaningRepository.js';
import {
  GdbCleaningItem,
  GdbCleaningListItem,
  GdbCleaningListQuery,
  IGdbCleaningService,
} from '../interfaces/IGdbCleaningService.js';

const DEFAULT_LIMIT = 25;

const toListItem = (row: GdbCleaningListRow): GdbCleaningListItem => ({
  id: row.answerId.toString(),
  question: row.question,
  state: row.state,
  crop: row.crop,
  domain: row.domain,
  flags: row.flags ?? [],
  notEvaluated: row.notEvaluated ?? [],
  status: row.status,
});

const toItem = (doc: IGdbCleaning): GdbCleaningItem => ({
  ...toListItem(doc),
  questionId: doc.questionId.toString(),
  answer: doc.answer,
  sources: doc.sources ?? [],
  checks: doc.checks ?? [],
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
  ) {}

  async list(query: GdbCleaningListQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const {rows, totalCount} = await this.repository.list({
      search: query.search,
      states: query.states,
      crops: query.crops,
      flags: query.flags,
      statuses: query.statuses,
      page,
      limit,
    });
    return {
      items: rows.map(toListItem),
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      page,
      limit,
    };
  }

  async summary() {
    const counts = await this.repository.countByStatus();
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return {...counts, total};
  }

  filterOptions() {
    return this.repository.getFilterOptions();
  }

  async get(answerId: string): Promise<GdbCleaningItem> {
    const doc = await this.repository.getByAnswerId(answerId);
    if (!doc) throw new NotFoundError(`Answer "${answerId}" not found`);
    return toItem(doc);
  }

  async saveCorrection(
    answerId: string,
    correctedAnswer: string,
  ): Promise<GdbCleaningItem> {
    const text = correctedAnswer.trim();
    if (!text) throw new BadRequestError('The correction cannot be empty');
    const updated = await this.repository.saveCorrection(answerId, text);
    return toItem(updated ?? (await this.explainRefusal(answerId)));
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
      const updated = await this.repository.decide(answerId, {
        status: 'dismissed',
        comment,
        reviewerId,
      });
      return toItem(updated ?? (await this.explainRefusal(answerId)));
    }

    // accepting needs a correction: the one in the request, or the one saved earlier
    const current = await this.repository.getByAnswerId(answerId);
    if (!current) throw new NotFoundError(`Answer "${answerId}" not found`);
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
    return toItem(updated ?? (await this.explainRefusal(answerId)));
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
