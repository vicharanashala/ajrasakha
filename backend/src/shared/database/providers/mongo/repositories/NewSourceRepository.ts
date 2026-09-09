import {INewSourceRepository} from '#root/shared/database/interfaces/INewSourceRepository.js';
import {
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

  async recordClose(id: string, userId: string): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing updated_sources id');
    }

    // Targets this reviewer's own still-open entry (closedAt: null), not a hardcoded
    // index - a record can carry more than one reviewer's entry.
    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {$set: {'reviewArray.$[reviewer].closedAt': new Date(), updatedAt: new Date()}},
      {
        arrayFilters: [{'reviewer.userId': userId, 'reviewer.closedAt': null}],
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

  async releaseToPending(id: string): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing updated_sources id');
    }

    // Targets whichever reviewArray entry is still open (closedAt: null) - the owning
    // reviewer's own, since only they can release their own in-progress record.
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
        arrayFilters: [{'reviewer.closedAt': null}],
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

    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {
        $set: {status: entry.status, updatedAt: new Date()},
        $push: {statusChanges: entry},
      },
      {returnDocument: 'after'},
    );

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }
}
