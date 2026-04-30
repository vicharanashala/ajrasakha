import {Collection, Document, Filter, ObjectId, FindOptions, ClientSession} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {injectable, unmanaged} from 'inversify';

@injectable()
export abstract class BaseRepository<T extends Document> {
  protected collection: Collection<T>;

  constructor(
    protected readonly db: MongoDatabase,
    @unmanaged() protected readonly collectionName: string,
  ) {}

  protected async init(): Promise<void> {
    if (!this.collection) {
      this.collection = await this.db.getCollection<T>(this.collectionName);
    }
  }

  async findById(id: string | ObjectId, options?: FindOptions | ClientSession): Promise<T | null> {
    await this.init();
    const filter = {_id: new ObjectId(id)} as unknown as Filter<T>;
    const findOptions = (options instanceof ClientSession) ? { session: options } : options;
    return this.collection.findOne(filter, findOptions as any) as any;
  }

  async findOne(filter: Filter<T>, options?: FindOptions | ClientSession): Promise<T | null> {
    await this.init();
    const findOptions = (options instanceof ClientSession) ? { session: options } : options;
    return this.collection.findOne(filter, findOptions as any) as any;
  }

  async findMany(filter: Filter<T>, options?: FindOptions | ClientSession): Promise<T[]> {
    await this.init();
    const findOptions = (options instanceof ClientSession) ? { session: options } : options;
    return this.collection.find(filter, findOptions as any).toArray() as any;
  }

  async aggregate<U = any>(pipeline: Document[]): Promise<U[]> {
    await this.init();
    return this.collection.aggregate<U>(pipeline).toArray();
  }
}
