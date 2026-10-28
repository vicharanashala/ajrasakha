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
    // keeps "the oldest free to-do answers" and "my answers" fast on a large collection
    await this.collection
      .createIndex({status: 1, assignedTo: 1, _id: 1})
      .catch(error => console.error('Could not create the assignment index:', error.message));
  }

  private static escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private static toObjectId(id: string): ObjectId {
    if (!ObjectId.isValid(id)) {
      throw new BadRequestError(`Invalid answer id "${id}"`);
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
      if (filters.assignedTo) {
        query.assignedTo = GdbCleaningRepository.toObjectId(filters.assignedTo);
      } else if (filters.unassigned) {
        query.assignedTo = {$exists: false};
      }

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
              assignedTo: 1,
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
    correctedAnswer: string,
  ): Promise<IGdbCleaning | null> {
    try {
      if (!this.collection) await this.init();
      return await this.collection.findOneAndUpdate(
        {answerId: GdbCleaningRepository.toObjectId(answerId), status: {$in: ['todo', 'clean']}},
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
    sources: IGdbCleaningSource[],
    originalSources: IGdbCleaningSource[],
    reviewerId: string,
  ): Promise<IGdbCleaning | null> {
    try {
      if (!this.collection) await this.init();
      return await this.collection.findOneAndUpdate(
        {answerId: GdbCleaningRepository.toObjectId(answerId), status: {$in: ['todo', 'clean']}},
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

  async countOpenAssigned(userId: string): Promise<number> {
    try {
      if (!this.collection) await this.init();
      return await this.collection.countDocuments({
        status: 'todo',
        assignedTo: GdbCleaningRepository.toObjectId(userId),
      });
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(`Failed to count assigned answers: ${error.message}`);
    }
  }

  async claimFree(userId: string, limit: number): Promise<number> {
    try {
      if (!this.collection) await this.init();
      const owner = GdbCleaningRepository.toObjectId(userId);
      let claimed = 0;
      // Each answer is taken only if it is still free when the update runs, so two reviewers asking
      // at the same moment never get the same one. A lost race is made up with another try.
      for (let attempt = 0; attempt < 3 && claimed < limit; attempt++) {
        const free = await this.collection
          .find({status: 'todo', assignedTo: {$exists: false}}, {projection: {_id: 1}})
          .sort({_id: 1})
          .limit(limit - claimed)
          .toArray();
        if (!free.length) break;
        const result = await this.collection.updateMany(
          {_id: {$in: free.map(doc => doc._id)}, assignedTo: {$exists: false}},
          {$set: {assignedTo: owner, assignedAt: new Date()}},
        );
        claimed += result.modifiedCount;
      }
      return claimed;
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(`Failed to assign answers: ${error.message}`);
    }
  }

  async release(answerId: string): Promise<boolean> {
    try {
      if (!this.collection) await this.init();
      const result = await this.collection.updateOne(
        {answerId: GdbCleaningRepository.toObjectId(answerId), assignedTo: {$exists: true}},
        {$unset: {assignedTo: '', assignedAt: ''}},
      );
      return result.modifiedCount > 0;
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(`Failed to release the answer: ${error.message}`);
    }
  }

  async releaseOf(userId: string, onlyUntouched: boolean): Promise<number> {
    try {
      if (!this.collection) await this.init();
      const result = await this.collection.updateMany(
        {
          status: 'todo',
          assignedTo: GdbCleaningRepository.toObjectId(userId),
          // an answer the reviewer has worked on has a history; an untouched one has none
          ...(onlyUntouched ? {'history.0': {$exists: false}} : {}),
        },
        {$unset: {assignedTo: '', assignedAt: ''}},
      );
      return result.modifiedCount;
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(`Failed to release answers: ${error.message}`);
    }
  }

  async listAssignees(): Promise<string[]> {
    try {
      if (!this.collection) await this.init();
      const ids = await this.collection.distinct('assignedTo', {
        status: 'todo',
        assignedTo: {$exists: true},
      });
      return ids.map(id => id.toString());
    } catch (error: any) {
      throw new InternalServerError(`Failed to list reviewers: ${error.message}`);
    }
  }

  async lastActivityAt(userId: string): Promise<Date | null> {
    try {
      if (!this.collection) await this.init();
      const owner = GdbCleaningRepository.toObjectId(userId);
      const [acted] = await this.collection
        .aggregate<{at: Date}>([
          {$match: {'history.userId': owner}},
          {$unwind: '$history'},
          {$match: {'history.userId': owner}},
          {$group: {_id: null, at: {$max: '$history.at'}}},
        ])
        .toArray();
      const given = await this.collection.findOne(
        {assignedTo: owner},
        {projection: {assignedAt: 1}, sort: {assignedAt: -1}},
      );
      const times = [acted?.at, given?.assignedAt].filter(Boolean) as Date[];
      return times.length ? new Date(Math.max(...times.map(t => new Date(t).getTime()))) : null;
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(`Failed to read the reviewer's activity: ${error.message}`);
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
