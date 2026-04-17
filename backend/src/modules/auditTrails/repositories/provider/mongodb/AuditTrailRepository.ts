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

  async getAuditTrails(session?: ClientSession): Promise<ModeratorAuditTrail[]> {
    await this.init();
    return this.auditTrailsCollection.find({}, { session }).toArray();
  }

  async getAuditTrailById(id: string, session?: ClientSession): Promise<ModeratorAuditTrail | null> {
    await this.init();
    return this.auditTrailsCollection.findOne({ _id: new ObjectId(id) }, { session });
  }
}