import { inject, injectable } from 'inversify';
import { Collection } from 'mongodb';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#root/shared/index.js';
import { IDashboardBlock, IDashboardContent } from '#root/shared/interfaces/models.js';
import { IDashboardContentRepository } from '#root/shared/database/interfaces/IDashboardContentRepository.js';

const SINGLETON_KEY = 'public_dashboard';

@injectable()
export class DashboardContentRepository implements IDashboardContentRepository {
  private collection: Collection<IDashboardContent>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init(): Promise<void> {
    if (!this.collection) {
      this.collection = await this.db.getCollection<IDashboardContent>('dashboard_content');
      await this.collection.createIndex({ key: 1 }, { unique: true });
    }
  }

  async get(): Promise<IDashboardContent | null> {
    await this.init();
    return this.collection.findOne({ key: SINGLETON_KEY });
  }

  async save(blocks: IDashboardBlock[], updatedBy: string | null): Promise<IDashboardContent> {
    await this.init();
    const now = new Date();
    await this.collection.updateOne(
      { key: SINGLETON_KEY },
      { $set: { blocks, updatedAt: now, updatedBy }, $setOnInsert: { key: SINGLETON_KEY } },
      { upsert: true },
    );
    const saved = await this.collection.findOne({ key: SINGLETON_KEY });
    return saved!;
  }
}
