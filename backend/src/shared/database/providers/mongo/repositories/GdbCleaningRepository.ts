import {inject, injectable} from 'inversify';
import {Collection, Filter, ObjectId} from 'mongodb';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {
  GdbCleaningStatus,
  IGdbCleaning,
  IGdbCleaningCheck,
  IGdbCleaningHistoryEntry,
  IGdbCleaningSource,
} from '#root/shared/interfaces/models.js';
import {
  GdbCleaningListRow,
  GdbHistoryRow,
  IGdbCleaningListFilters,
  IGdbCleaningRepository,
  IGdbHistoryFilters,
} from '#root/shared/database/interfaces/IGdbCleaningRepository.js';

const STATUSES: GdbCleaningStatus[] = [
  'pending',
  'clean',
  'todo',
  'fixed',
  'dismissed',
];

@injectable()
export class GdbCleaningRepository implements IGdbCleaningRepository {
  private collection: Collection<IGdbCleaning>;

  constructor(
    @inject(GLOBAL_TYPES.gdbCleaningDatabase)
    private db: MongoDatabase,
  ) {}

  private async init(): Promise<void> {
    this.collection = await this.db.getCollection<IGdbCleaning>('gdb_cleaning');
  }

  private static escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private static toObjectId(id: string): ObjectId {
    if (!ObjectId.isValid(id)) {
      throw new BadRequestError(`Invalid id "${id}"`);
    }
    return new ObjectId(id);
  }

  async list(
    filters: IGdbCleaningListFilters,
  ): Promise<{rows: GdbCleaningListRow[]; totalCount: number}> {
    try {
      if (!this.collection) await this.init();

      const query: Filter<IGdbCleaning> = {};
      if (filters.states?.length) query.state = {$in: filters.states};
      if (filters.crops?.length) query.crop = {$in: filters.crops};
      if (filters.statuses?.length) query.status = {$in: filters.statuses};
      if (filters.flags?.length) query.flags = {$in: filters.flags};

      const search = filters.search?.trim();
      if (search) {
        const byQuestion = {
          question: {
            $regex: GdbCleaningRepository.escapeRegex(search),
            $options: 'i',
          },
        };
        query.$or = ObjectId.isValid(search) && search.length === 24
          ? [{answerId: new ObjectId(search)}, byQuestion]
          : [byQuestion];
      }

      const [rows, totalCount] = await Promise.all([
        this.collection
          .find(query, {
            projection: {
              answerId: 1,
              question: 1,
              state: 1,
              crop: 1,
              domain: 1,
              flags: 1,
              notEvaluated: 1,
              status: 1,
            },
          })
          .sort({_id: 1})
          .skip((filters.page - 1) * filters.limit)
          .limit(filters.limit)
          .toArray(),
        this.collection.countDocuments(query),
      ]);

      return {rows: rows as GdbCleaningListRow[], totalCount};
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(
        `Failed to list GDB cleaning answers: ${error.message}`,
      );
    }
  }

  async getByAnswerId(answerId: string): Promise<IGdbCleaning | null> {
    try {
      if (!this.collection) await this.init();
      return await this.collection.findOne({
        answerId: GdbCleaningRepository.toObjectId(answerId),
      });
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(
        `Failed to fetch GDB cleaning answer: ${error.message}`,
      );
    }
  }

  async countByStatus(): Promise<Record<GdbCleaningStatus, number>> {
    try {
      if (!this.collection) await this.init();
      const grouped = await this.collection
        .aggregate<{_id: GdbCleaningStatus; count: number}>([
          {$group: {_id: '$status', count: {$sum: 1}}},
        ])
        .toArray();

      const counts = Object.fromEntries(
        STATUSES.map(status => [status, 0]),
      ) as Record<GdbCleaningStatus, number>;
      for (const {_id, count} of grouped) {
        if (_id in counts) counts[_id] = count;
      }
      return counts;
    } catch (error: any) {
      throw new InternalServerError(
        `Failed to count GDB cleaning answers: ${error.message}`,
      );
    }
  }

  async getFilterOptions(): Promise<{
    states: string[];
    crops: string[];
    flags: string[];
  }> {
    try {
      if (!this.collection) await this.init();
      const [states, crops, flags] = await Promise.all([
        this.collection.distinct('state'),
        this.collection.distinct('crop'),
        this.collection.distinct('flags'),
      ]);
      const clean = (values: string[]) =>
        values.filter(Boolean).sort((a, b) => a.localeCompare(b));
      return {states: clean(states), crops: clean(crops), flags: clean(flags)};
    } catch (error: any) {
      throw new InternalServerError(
        `Failed to load GDB cleaning filters: ${error.message}`,
      );
    }
  }

  async saveCorrection(
    answerId: string,
    questionId: string,
    correctedAnswer: string,
  ): Promise<IGdbCleaning | null> {
    try {
      if (!this.collection) await this.init();
      return await this.collection.findOneAndUpdate(
        {
          answerId: GdbCleaningRepository.toObjectId(answerId),
          questionId: GdbCleaningRepository.toObjectId(questionId),
          status: {$in: ['todo', 'clean']},
        },
        {$set: {correctedAnswer}},
        {returnDocument: 'after'},
      );
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(
        `Failed to save the correction: ${error.message}`,
      );
    }
  }

  async saveChecks(
    answerId: string,
    checks: IGdbCleaningCheck[],
    flags: string[],
    status: 'todo' | 'clean',
  ): Promise<IGdbCleaning | null> {
    try {
      if (!this.collection) await this.init();
      return await this.collection.findOneAndUpdate(
        {answerId: GdbCleaningRepository.toObjectId(answerId), status: {$in: ['todo', 'clean']}},
        {$set: {checks, flags, status}},
        {returnDocument: 'after'},
      );
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(
        `Failed to save the flags: ${error.message}`,
      );
    }
  }

  async saveSources(
    answerId: string,
    questionId: string,
    sources: IGdbCleaningSource[],
    originalSources: IGdbCleaningSource[],
    reviewerId: string,
  ): Promise<IGdbCleaning | null> {
    try {
      if (!this.collection) await this.init();
      return await this.collection.findOneAndUpdate(
        {
          answerId: GdbCleaningRepository.toObjectId(answerId),
          questionId: GdbCleaningRepository.toObjectId(questionId),
          status: {$in: ['todo', 'clean']},
        },
        {
          $set: {
            sources,
            originalSources,
            sourcesEditedBy: new ObjectId(reviewerId),
            sourcesEditedAt: new Date(),
          },
        },
        {returnDocument: 'after'},
      );
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(
        `Failed to save the sources: ${error.message}`,
      );
    }
  }

  async addHistory(
    answerId: string,
    entry: IGdbCleaningHistoryEntry,
  ): Promise<void> {
    try {
      if (!this.collection) await this.init();
      await this.collection.updateOne(
        {answerId: GdbCleaningRepository.toObjectId(answerId)},
        {$push: {history: entry}},
      );
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(
        `Failed to record the history: ${error.message}`,
      );
    }
  }

  async listHistory(filters: IGdbHistoryFilters): Promise<{
    rows: GdbHistoryRow[];
    totalCount: number;
    answers: number;
  }> {
    try {
      if (!this.collection) await this.init();
      const match: Record<string, unknown> = {};
      if (filters.userId) {
        match['history.userId'] = GdbCleaningRepository.toObjectId(filters.userId);
      }
      if (filters.from && filters.to) {
        match['history.at'] = {$gte: filters.from, $lte: filters.to};
      }
      const [result] = await this.collection
        .aggregate<{
          rows: GdbHistoryRow[];
          total: {n: number}[];
          answers: {n: number}[];
        }>([
          {$match: {'history.0': {$exists: true}}},
          {$unwind: '$history'},
          {$match: match},
          {$sort: {'history.at': -1}},
          {
            $facet: {
              rows: [
                {$skip: (filters.page - 1) * filters.limit},
                {$limit: filters.limit},
                {
                  $project: {
                    _id: 0,
                    answerId: 1,
                    question: 1,
                    userId: '$history.userId',
                    action: '$history.action',
                    at: '$history.at',
                    details: '$history.details',
                  },
                },
              ],
              total: [{$count: 'n'}],
              answers: [{$group: {_id: '$answerId'}}, {$count: 'n'}],
            },
          },
        ])
        .toArray();
      return {
        rows: result?.rows ?? [],
        totalCount: result?.total[0]?.n ?? 0,
        answers: result?.answers[0]?.n ?? 0,
      };
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(
        `Failed to load the history: ${error.message}`,
      );
    }
  }

  async countInRange(
    from?: Date,
    to?: Date,
  ): Promise<{fixed: number; dismissed: number; pushed: number}> {
    try {
      if (!this.collection) await this.init();
      const decidedIn = from && to ? {reviewedAt: {$gte: from, $lte: to}} : {};
      const [fixed, dismissed, pushed] = await Promise.all([
        this.collection.countDocuments({status: 'fixed', ...decidedIn}),
        this.collection.countDocuments({status: 'dismissed', ...decidedIn}),
        this.collection.countDocuments(
          from && to
            ? {pushedAt: {$gte: from, $lte: to}}
            : {pushedAt: {$ne: null}},
        ),
      ]);
      return {fixed, dismissed, pushed};
    } catch (error: any) {
      throw new InternalServerError(
        `Failed to count by date: ${error.message}`,
      );
    }
  }

  async markPushed(
    answerId: string,
    reviewerId: string,
  ): Promise<IGdbCleaning | null> {
    try {
      if (!this.collection) await this.init();
      return await this.collection.findOneAndUpdate(
        {
          answerId: GdbCleaningRepository.toObjectId(answerId),
          status: 'fixed',
        },
        {$set: {pushedAt: new Date(), pushedBy: new ObjectId(reviewerId)}},
        {returnDocument: 'after'},
      );
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(
        `Failed to record the push: ${error.message}`,
      );
    }
  }

  async decide(
    answerId: string,
    decision: {
      status: 'fixed' | 'dismissed';
      correctedAnswer?: string;
      comment: string | null;
      reviewerId: string;
    },
  ): Promise<IGdbCleaning | null> {
    try {
      if (!this.collection) await this.init();
      const changes: Partial<IGdbCleaning> = {
        status: decision.status,
        comment: decision.comment,
        reviewedBy: new ObjectId(decision.reviewerId),
        reviewedAt: new Date(),
      };
      if (decision.correctedAnswer !== undefined) {
        changes.correctedAnswer = decision.correctedAnswer;
      }
      // the status in the filter means a decided answer is never changed again
      return await this.collection.findOneAndUpdate(
        {answerId: GdbCleaningRepository.toObjectId(answerId), status: {$in: ['todo', 'clean']}},
        {$set: changes},
        {returnDocument: 'after'},
      );
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(
        `Failed to save the decision: ${error.message}`,
      );
    }
  }
}
