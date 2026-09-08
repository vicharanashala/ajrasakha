import {INewSourceRepository} from '#root/shared/database/interfaces/INewSourceRepository.js';
import {INewSource} from '#root/shared/interfaces/models.js';
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
    updates: Partial<Pick<INewSource, 'sources' | 'status' | 'timeTaken' | 'sourceReferenceStatus'>>,
  ): Promise<INewSource | null> {
    await this.init();

    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing new_sources id');
    }

    const result = await this.NewSourceCollection.findOneAndUpdate(
      {_id: new ObjectId(id)},
      {$set: {...updates, updatedAt: new Date()}},
      {returnDocument: 'after'},
    );

    if (!result) return null;

    return {...result, _id: result._id?.toString()} as INewSource;
  }
}
