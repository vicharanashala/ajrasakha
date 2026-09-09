import {INewSourceRepository} from '#root/shared/database/interfaces/INewSourceRepository.js';
import {INewSource, INewSourceStatusChange} from '#root/shared/interfaces/models.js';
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
    this.NewSourceCollection = await this.db.getCollection<INewSource>('new_sources');
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
    updates: Partial<Pick<INewSource, 'sources' | 'status' | 'timeTaken'>>,
  ): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing new_sources id');
    }

    // updateById is only ever called to complete an edit (see its interface doc comment),
    // so this is also where the user's reviewArray entry gets marked as saved. Same
    // index-0 assumption as recordClose — see the comment there.
    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {$set: {...updates, 'reviewArray.0.isSaved': true, updatedAt: new Date()}},
      {returnDocument: 'after'},
    );

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }

  async recordClose(id: string): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing new_sources id');
    }

    // reviewArray always has exactly one entry today — startNewSource always creates a
    // fresh document per edit session rather than reusing/appending to an existing one —
    // so index 0 is always the entry to stamp. Revisit if that ever changes.
    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {$set: {'reviewArray.0.closedAt': new Date(), updatedAt: new Date()}},
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

  async releaseToPending(id: string): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing new_sources id');
    }

    // Same index-0 assumption as recordClose - see the comment there.
    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {$set: {status: 'pending', 'reviewArray.0.closedAt': new Date(), updatedAt: new Date()}},
      {returnDocument: 'after'},
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
      throw new BadRequestError('Invalid or missing new_sources id');
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
