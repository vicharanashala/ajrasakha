import {inject, injectable} from 'inversify';
import {Collection, Filter, ObjectId} from 'mongodb';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {
  GdbCleaningStatus,
  IGdbCleaning,
} from '#root/shared/interfaces/models.js';
import {
  GdbCleaningListRow,
  IGdbCleaningListFilters,
  IGdbCleaningRepository,
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
    correctedAnswer: string,
  ): Promise<IGdbCleaning | null> {
    try {
      if (!this.collection) await this.init();
      return await this.collection.findOneAndUpdate(
        {answerId: GdbCleaningRepository.toObjectId(answerId), status: 'todo'},
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
        {answerId: GdbCleaningRepository.toObjectId(answerId), status: 'todo'},
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
