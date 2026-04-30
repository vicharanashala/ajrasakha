import {Collection, Document, Filter, ObjectId, FindOptions} from 'mongodb';
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

  async findById(id: string | ObjectId, projection?: Document): Promise<T | null> {
    await this.init();
    const filter = {_id: new ObjectId(id)} as unknown as Filter<T>;
    return this.collection.findOne(filter, {projection}) as Promise<T | null>;
  }

  async findOne(filter: Filter<T>, projection?: Document): Promise<T | null> {
    await this.init();
    return this.collection.findOne(filter, {projection}) as Promise<T | null>;
  }

  async findMany(filter: Filter<T>, projection?: Document, options?: FindOptions): Promise<T[]> {
    await this.init();
    return this.collection.find(filter, {...options, projection}).toArray();
  }

  async aggregate<U = any>(pipeline: Document[]): Promise<U[]> {
    await this.init();
    return this.collection.aggregate<U>(pipeline).toArray();
  }
}
