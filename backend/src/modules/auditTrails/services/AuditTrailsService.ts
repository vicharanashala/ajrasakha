import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {inject, injectable} from 'inversify';
import {ModeratorAuditTrail} from '../interfaces/IAuditTrails.js';
import {IAuditTrailsService} from '../interfaces/IAuditTrailsService.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {AUDIT_TRAILS_TYPES} from '../types.js';
import {IAuditTrailsRepository} from '../interfaces/IAuditTrailsRepository.js';
import {ObjectId} from 'mongodb';

@injectable()
export class AuditTrailsService
  extends BaseService
  implements IAuditTrailsService
{
  private readonly env: string;

  constructor(
    @inject(AUDIT_TRAILS_TYPES.AuditTrailsRepository)
    private readonly auditTrailsRepository: IAuditTrailsRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);

    this.env = process.env.NODE_ENV || 'development';
  }
  async createAuditTrail(paload: ModeratorAuditTrail): Promise<string> {
    if(this.env !== 'production') {
      return;
    }
    // Implement the logic to create an audit trail
    return await this.auditTrailsRepository.createAuditTrail(
      this.normalizeAuditToObjectId(paload),
    );
  }

  async getAuditTrails(
    page: number,
    limit: number,
    startDate?: string,
    endDate?: string,
    category?: string | null,
    action?: string | null,
    order?: "asc" | "desc",
    outComeStatus?: string,
  ): Promise<{data: ModeratorAuditTrail[]; totalDocuments: number}> {
    // Implement the logic to get all audit trails
    const auditTrails = await this.auditTrailsRepository.getAuditTrails(
      page,
      limit,
      startDate,
      endDate,
      category,
      action,
      order,
      outComeStatus,
    );
    return {
      data: auditTrails.data.map(audit => this.normalizeAudit(audit)),
      totalDocuments: auditTrails.totalDocuments,
    };
  }

  async getAuditTrailById(id: string): Promise<ModeratorAuditTrail | null> {
    // Implement the logic to get an audit trail by ID
    return this.auditTrailsRepository.getAuditTrailById(id);
  }

  private normalizeAuditToObjectId(audit: any) {
    return {
      ...audit,
      actor: {
        ...audit.actor,
        id: ObjectId.isValid(audit.actor?.id)
          ? new ObjectId(String(audit.actor.id))
          : audit.actor.id,
      },
      context: {
        ...audit.context,
        ...(audit.context?.questionId && {
          questionId: this.toObjectIdArray(audit.context.questionId),
        }),
        ...(audit.context?.answerId && {
          answerId: ObjectId.isValid(audit.context.answerId)
            ? new ObjectId(String(audit.context.answerId))
            : audit.context.answerId,
        }),
        ...(audit.context?.userId && {
          userId: ObjectId.isValid(audit.context.userId)
            ? new ObjectId(String(audit.context.userId))
            : audit.context.userId,
        }),
        ...(audit.context?.requestId && {
          requestId: ObjectId.isValid(audit.context.requestId)
            ? new ObjectId(String(audit.context.requestId))
            : audit.context.requestId,
        }),
        ...(audit.context?.cropId && {
          cropId: ObjectId.isValid(audit.context.cropId)
            ? new ObjectId(String(audit.context.cropId))
            : audit.context.cropId,
        }),
      },
      createdAt: new Date(),
      changes: {
        before: {
          ...audit.changes?.before,
          ...(audit?.changes?.before?.experts && {
            experts: this.toObjectIdArray(audit.changes?.before?.experts),
          }),
        },
        after: {
          ...audit.changes?.after,
          ...(audit?.changes?.after?.experts && {
            experts: this.toObjectIdArray(audit.changes?.after?.experts),
          }),
        },
      },
    };
  }

  private toObjectIdArray(value: any) {
    if (!value) return undefined;
    if (Array.isArray(value)) {
      return value
        .map(v => (ObjectId.isValid(v) ? new ObjectId(String(v)) : null))
        .filter(Boolean);
    }
    return ObjectId.isValid(value) ? [new ObjectId(String(value))] : undefined;
  }

  private normalizeAudit(audit: any) {
    return {
      ...audit,
      actor: {
        ...audit.actor,
        id: audit.actor?.id ? String(audit.actor.id) : audit.actor?.id,
      },
      context: {
        ...audit.context,

        ...(audit.context?.questionId && {
          questionId: this.toStringIdArray(audit.context.questionId),
        }),

        ...(audit.context?.answerId && {
          answerId: String(audit.context.answerId),
        }),

        ...(audit.context?.userId && {
          userId: String(audit.context.userId),
        }),

        ...(audit.context?.requestId && {
          requestId: String(audit.context.requestId),
        }),

        ...(audit.context?.cropId && {
          cropId: String(audit.context.cropId),
        }),
      },

      createdAt: audit.createdAt || new Date(),

      changes: {
        before: {
          ...audit.changes?.before,

          ...(audit?.changes?.before?.experts && {
            experts: this.toStringIdArray(audit.changes.before.experts),
          }),
        },

        after: {
          ...audit.changes?.after,

          ...(audit?.changes?.after?.experts && {
            experts: this.toStringIdArray(audit.changes.after.experts),
          }),
        },
      },
    };
  }

  private toStringIdArray(value: any) {
    if (!value) return undefined;

    if (Array.isArray(value)) {
      return value.map(v => String(v));
    }

    return [String(value)];
  }

  async getAuditTrailsByModeratorId(
    moderatorId: string,
    page: number,
    limit: number,
    startDate?: string,
    endDate?: string,
    category?: string | null,
    action?: string | null,
    order?: "asc" | "desc",
    outComeStatus?: string,
  ): Promise<{data: ModeratorAuditTrail[]; totalDocuments: number}> {
    // Implement the logic to get audit trails by moderator ID
    const auditTrails =
      await this.auditTrailsRepository.getAuditTrailsByModeratorId(
        moderatorId,
        page,
        limit,
        startDate,
        endDate,
        category,
        action,
        order,
        outComeStatus,
      );
    return {
      data: auditTrails.data.map(audit => this.normalizeAudit(audit)),
      totalDocuments: auditTrails.totalDocuments,
    };
  }
}
