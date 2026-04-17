import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {inject, injectable} from 'inversify';
import {ModeratorAuditTrail} from '../interfaces/IAuditTrails.js';
import {IAuditTrailsService} from '../interfaces/IAuditTrailsService.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {AUDIT_TRAILS_TYPES} from '../types.js';
import {IAuditTrailsRepository} from '../interfaces/IAuditTrailsRepository.js';
import { ObjectId } from 'mongodb';

@injectable()
export class AuditTrailsService
  extends BaseService
  implements IAuditTrailsService
{
  constructor(
    @inject(AUDIT_TRAILS_TYPES.AuditTrailsRepository)
    private readonly auditTrailsRepository: IAuditTrailsRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }
  async createAuditTrail(paload: ModeratorAuditTrail): Promise<string> {
    // Implement the logic to create an audit trail
    return await this.auditTrailsRepository.createAuditTrail(this.normalizeAudit(paload));
  }

  async getAuditTrails(): Promise<ModeratorAuditTrail[]> {
    // Implement the logic to get all audit trails
    return this.auditTrailsRepository.getAuditTrails();
  }

  async getAuditTrailById(id: string): Promise<ModeratorAuditTrail | null> {
    // Implement the logic to get an audit trail by ID
    return this.auditTrailsRepository.getAuditTrailById(id);
  }

  private normalizeAudit(audit: any) {
    return {
      ...audit,
      actor: {
        ...audit.actor,
        id: new ObjectId(String(audit.actor.id)),
      },
      context: {
        ...audit.context,
        questionId: audit.context?.questionId
          ? new ObjectId(String(audit.context.questionId))
          : undefined,
      },
      changes: {
        ...audit.changes,
        after: {
          ...audit.changes?.after,
          context: ObjectId.isValid(audit.changes?.after?.contextId)
            ? new ObjectId(String(audit.changes.after.contextId))
            : audit.changes?.after?.contextId,
        },
      },
    };
  }
}
