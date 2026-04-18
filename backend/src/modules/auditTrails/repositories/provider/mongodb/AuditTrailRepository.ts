import { ModeratorAuditTrail } from "#root/modules/auditTrails/interfaces/IAuditTrails.js";
import { IAuditTrailsRepository } from "#root/modules/auditTrails/interfaces/IAuditTrailsRepository.js";
import { MongoDatabase } from "#root/shared/index.js";
import { GLOBAL_TYPES } from "#root/types.js";
import { inject } from "inversify";
import { ClientSession, Collection, ObjectId } from "mongodb";

export class AuditTrailsRepository implements IAuditTrailsRepository {
    private auditTrailsCollection: Collection<ModeratorAuditTrail>
    constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) { }
  private async init() {
    this.auditTrailsCollection = await this.db.getCollection<ModeratorAuditTrail>('auditTrails');
  }

  async createAuditTrail(data: ModeratorAuditTrail, session?: ClientSession): Promise<string> {
    await this.init();
    const result = await this.auditTrailsCollection.insertOne(data, { session });
    return result.insertedId.toString();
  }

  async getAuditTrails(page: number, limit: number, startDate?: string, endDate?: string, session?: ClientSession): Promise<ModeratorAuditTrail[]> {
    await this.init();
    const skip = (page - 1) * limit;
    const query: any = {};

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    return this.auditTrailsCollection.find(query, { session }).skip(skip).limit(limit).toArray();
  }

  async getAuditTrailById(id: string, session?: ClientSession): Promise<ModeratorAuditTrail | null> {
    await this.init();
    return this.auditTrailsCollection.findOne({ _id: new ObjectId(id) }, { session });
  }
}