import {INewSourceRepository} from '#root/shared/database/interfaces/INewSourceRepository.js';
import {INewSource} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {Collection} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';

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

  async create(data: Omit<INewSource, '_id' | 'createdAt'>): Promise<INewSource> {
    await this.init();

    const doc: INewSource = {
      ...data,
      createdAt: new Date(),
    };

    const result = await this.NewSourceCollection.insertOne(doc as any);

    return {...doc, _id: result.insertedId};
  }
}
