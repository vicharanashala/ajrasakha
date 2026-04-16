import { ModeratorAuditTrail } from "#root/modules/moderator_audit_trails/interfaces/IAuditTrails.js";
import { IAuditTrailsRepository } from "#root/modules/moderator_audit_trails/interfaces/IAuditTrailsRepository.js";
import { MongoDatabase } from "#root/shared/index.js";
import { GLOBAL_TYPES } from "#root/types.js";
import { inject } from "inversify";
import { ClientSession, Collection } from "mongodb";

class AuditTrailsRepository implements IAuditTrailsRepository {
    private auditTrailsCollection: Collection<ModeratorAuditTrail>
    constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) { }
  private async init() {
    this.auditTrailsCollection = await this.db.getCollection<ModeratorAuditTrail>('moderatorAuditTrails');
  }

  async createAuditTrail(data: ModeratorAuditTrail, session?: ClientSession): Promise<string> {
    await this.init();
    const result = await this.auditTrailsCollection.insertOne(data, { session });
    return result.insertedId.toString();
  }
}

export {AuditTrailsRepository}