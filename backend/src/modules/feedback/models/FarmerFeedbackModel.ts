import { Collection, Db, ObjectId } from 'mongodb';
import { injectable, inject } from 'inversify';
import { IFarmerFeedback } from '../interfaces/IFeedback.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';

@injectable()
export class FarmerFeedbackRepository {
  private collection: Collection<IFarmerFeedback> | null = null;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly database: MongoDatabase,
  ) {}

  private async getCollection(): Promise<Collection<IFarmerFeedback>> {
    if (!this.collection) {
      this.collection = await this.database.getCollection<IFarmerFeedback>('farmer_feedbacks');
      // Create indexes for efficient analytics and re-review lookups
      await this.collection.createIndex({ gdbEntryId: 1 });
      await this.collection.createIndex({ domain: 1 });
      await this.collection.createIndex({ language: 1 });
      await this.collection.createIndex({ state: 1 });
      await this.collection.createIndex({ createdAt: -1 });
    }
    return this.collection;
  }

  async createFeedback(data: IFarmerFeedback): Promise<string> {
    const col = await this.getCollection();
    const result = await col.insertOne({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return result.insertedId.toString();
  }

  async getFeedbacksByGdbEntryId(gdbEntryId: string): Promise<IFarmerFeedback[]> {
    const col = await this.getCollection();
    return col.find({ gdbEntryId }).sort({ createdAt: -1 }).toArray();
  }

  async getAllFeedbacks(filter: Record<string, any> = {}): Promise<IFarmerFeedback[]> {
    const col = await this.getCollection();
    return col.find(filter).sort({ createdAt: -1 }).toArray();
  }
}
