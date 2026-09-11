import {INewSourceRepository} from '#root/shared/database/interfaces/INewSourceRepository.js';
import {
  IMissingPopDocument,
  INewSource,
  INewSourceReviewEntry,
  INewSourceStatusChange,
} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {isValidObjectId} from '#root/utils/isValidObjectId.js';
import {BadRequestError} from 'routing-controllers';

@injectable()
export class NewSourceRepository implements INewSourceRepository {
  private NewSourceCollection: Collection<INewSource>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.NewSourceCollection = await this.db.getCollection<INewSource>('updated_sources');
  }

  async create(data: Omit<INewSource, '_id' | 'createdAt' | 'updatedAt'>): Promise<INewSource> {
    await this.init();

    const doc: INewSource = {
      ...data,
      createdAt: new Date(),
    };

    const result = await this.NewSourceCollection.insertOne(doc as any);

    return {...doc, _id: result.insertedId.toString()};
  }

  async updateById(
    id: string,
    userId: string,
    updates: Partial<Pick<INewSource, 'sources' | 'status' | 'timeTaken'>>,
  ): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing updated_sources id');
    }

    // updateById is only ever called to complete an edit (see its interface doc comment),
    // so this is also where this reviewer's own still-open reviewArray entry (closedAt:
    // null) gets marked saved, with its own timeTaken - not a hardcoded index, since a
    // record can carry more than one reviewer's entry.
    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {
        $set: {
          ...updates,
          'reviewArray.$[reviewer].isSaved': true,
          'reviewArray.$[reviewer].timeTaken': updates.timeTaken ?? null,
          updatedAt: new Date(),
        },
      },
      {
        arrayFilters: [{'reviewer.userId': userId, 'reviewer.closedAt': null}],
        returnDocument: 'after',
      },
    );

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }

  async setMissingPopDocuments(
    id: string,
    userId: string,
    missingPopDocuments: IMissingPopDocument[],
  ): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing updated_sources id');
    }

    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {
        $set: {
          'reviewArray.$[reviewer].missingPopDocuments': missingPopDocuments,
          updatedAt: new Date(),
        },
      },
      {
        arrayFilters: [
          {
            'reviewer.userId': userId,
            'reviewer.closedAt': null,
            'reviewer.role': {$ne: 'moderator'},
          },
        ],
        returnDocument: 'after',
      },
    );

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }

  async recordClose(id: string, userId: string): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing updated_sources id');
    }

    // Targets this reviewer's own still-open expert entry (closedAt: null), not a
    // hardcoded index - a record can carry several entries, including a moderator hold
    // by the same person, which this must leave alone.
    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {$set: {'reviewArray.$[reviewer].closedAt': new Date(), updatedAt: new Date()}},
      {
        arrayFilters: [
          {
            'reviewer.userId': userId,
            'reviewer.closedAt': null,
            'reviewer.role': {$ne: 'moderator'},
          },
        ],
        returnDocument: 'after',
      },
    );

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }

  async appendReviewEntry(
    id: string,
    entry: INewSourceReviewEntry,
  ): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing updated_sources id');
    }

    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {$push: {reviewArray: entry}, $set: {updatedAt: new Date()}},
      {returnDocument: 'after'},
    );

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }

  async findActiveInProgressByUser(
    userId: string,
    excludeAnswerId: string,
  ): Promise<INewSource | null> {
    await this.init();

    const result = await this.NewSourceCollection.findOne({
      status: 'in-progress',
      answerId: {$ne: excludeAnswerId},
      'reviewArray.userId': userId,
    });

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }

  async findActiveModeratorReviewByUser(
    userId: string,
    excludeAnswerId: string,
  ): Promise<INewSource | null> {
    await this.init();

    const result = await this.NewSourceCollection.findOne({
      status: 'moderator-in-review',
      answerId: {$ne: excludeAnswerId},
      reviewArray: {
        $elemMatch: {userId, role: 'moderator', closedAt: null},
      },
    });

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }

  async releaseModeratorReview(
    id: string,
    userId: string,
  ): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing updated_sources id');
    }

    // Only this moderator's own open entry is closed - an expert's entry on the same
    // record is history and stays as it was.
    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {
        $set: {
          status: 'review-completed',
          'reviewArray.$[reviewer].closedAt': new Date(),
          updatedAt: new Date(),
        },
      },
      {
        arrayFilters: [
          {'reviewer.userId': userId, 'reviewer.role': 'moderator', 'reviewer.closedAt': null},
        ],
        returnDocument: 'after',
      },
    );

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }

  async findByAnswerId(answerId: string): Promise<INewSource | null> {
    await this.init();

    const result = await this.NewSourceCollection.findOne(
      {answerId},
      {sort: {createdAt: -1}},
    );

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }

  async findById(id: string): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing updated_sources id');
    }

    const result = await this.NewSourceCollection.findOne({_id: new ObjectId(id)});

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }

  async setStatus(
    id: string,
    status: INewSource['status'],
  ): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing updated_sources id');
    }

    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {$set: {status, updatedAt: new Date()}},
      {returnDocument: 'after'},
    );

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }

  async releaseToPending(id: string): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing updated_sources id');
    }

    // Targets whichever expert entry is still open (closedAt: null) - the owning
    // reviewer's own, since only they can release their own in-progress record. A
    // moderator hold is closed by its own release, not this one.
    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {
        $set: {
          status: 'pending',
          'reviewArray.$[reviewer].closedAt': new Date(),
          updatedAt: new Date(),
        },
      },
      {
        arrayFilters: [
          {'reviewer.closedAt': null, 'reviewer.role': {$ne: 'moderator'}},
        ],
        returnDocument: 'after',
      },
    );

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }

  async changeStatusWithReason(
    id: string,
    entry: INewSourceStatusChange,
  ): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing updated_sources id');
    }

    const changedAt = new Date();

    // Acting on the record ends the moderator's hold on it - their entry is marked
    // saved and given its own timeTaken (measured from when they opened it), the same
    // as an expert's own save via updateById, rather than being left null.
    const existing = await this.NewSourceCollection.findOne({_id: new ObjectId(id)});
    const openModeratorEntry = existing?.reviewArray.find(
      reviewer => reviewer.role === 'moderator' && reviewer.closedAt === null,
    );
    const timeTaken = openModeratorEntry
      ? Math.max(
          0,
          Math.round(
            (changedAt.getTime() - new Date(openModeratorEntry.startedAt).getTime()) / 1000,
          ),
        )
      : null;

    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {
        $set: {
          status: entry.status,
          'reviewArray.$[reviewer].closedAt': changedAt,
          'reviewArray.$[reviewer].isSaved': true,
          'reviewArray.$[reviewer].timeTaken': timeTaken,
          updatedAt: changedAt,
        },
        $push: {statusChanges: entry},
      },
      {
        // Acting on the record ends the moderator's hold on it - their entry closes
        // alongside the status change rather than needing a separate release.
        arrayFilters: [{'reviewer.role': 'moderator', 'reviewer.closedAt': null}],
        returnDocument: 'after',
      },
    );

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }
}
