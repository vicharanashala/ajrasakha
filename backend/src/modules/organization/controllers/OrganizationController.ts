import 'reflect-metadata';
import {JsonController, Get, QueryParams, Authorized, Post, Put, Delete, Body, Param, CurrentUser, NotFoundError, BadRequestError} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {IOrganizationService} from '../interfaces/IOrganizationService.js';
import {
  IOrganization,
  IOrganizationBulkResult,
  IOrganizationBulkRow,
  IUser,
} from '#root/shared/interfaces/models.js';
import {IAuditTrailsService} from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import {AUDIT_TRAILS_TYPES} from '#root/modules/auditTrails/types.js';
import {
  AuditAction,
  AuditCategory,
  ModeratorAuditTrail,
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';

/** Guards a single import against an oversized payload. */
const MAX_BULK_ROWS = 5000;

@OpenAPI({
  tags: ['Organizations'],
  description: 'Lookup for the organization directory',
})
@injectable()
@JsonController('/organizations')
export class OrganizationController {
  constructor(
    @inject(CORE_TYPES.OrganizationService)
    private readonly organizationService: IOrganizationService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  /** Actor block shared by every organization audit entry. */
  private auditActor(user: IUser): ModeratorAuditTrail['actor'] {
    return {
      id: user._id.toString(),
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      avatar: user?.avatar || '',
    };
  }

  /** Audit context for an organization, matching the shape the audit page reads. */
  private orgAuditContext(id?: string, name?: string): Record<string, any> {
    const ctx: Record<string, any> = {};
    if (id !== undefined) ctx.organizationId = id;
    if (name !== undefined) ctx.organizationName = name;
    return ctx;
  }

  /** Failure outcome built from a thrown error, truncated the same way as elsewhere. */
  private failureOutcome(
    err: any,
    fallbackMessage: string,
  ): ModeratorAuditTrail['outcome'] {
    return {
      status: OutComeStatus.FAILED,
      errorCode: err?.errorCode || 'INTERNAL_ERROR',
      errorMessage: err?.message || fallbackMessage,
      errorName: err?.name || 'Error',
      errorStack:
        err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
        'No stack trace available',
    };
  }

  @OpenAPI({summary: 'Search organizations by name, optionally filtered by type'})
  @Get('/')
  @Authorized()
  async search(
    @QueryParams()
    query: {search?: string; page?: number; limit?: number; type?: IOrganization['type']},
  ): Promise<{organizations: IOrganization[], totalPages: number}> {
    const limit = Number(query.limit) || 20;
    const page = Number(query.page) || 1;
    if (query.type && !['central', 'state', 'district'].includes(query.type)) {
      throw new BadRequestError('Invalid organization type');
    }
    return await this.organizationService.search(query.search, page, limit, query.type);
  }

  @OpenAPI({summary: 'Add a new organization'})
  @Post('/')
  @Authorized(['admin', 'moderator'])
  async create(
    @Body() data: Omit<IOrganization, '_id' | 'createdAt' | 'updatedAt'>,
    @CurrentUser() user: IUser,
  ): Promise<{organization: IOrganization}> {
    if (!['central', 'state', 'district'].includes(data.type)) {
      throw new BadRequestError('Invalid organization type');
    }

    const auditBase: ModeratorAuditTrail = {
      category: AuditCategory.CROP_MANAGEMENT,
      action: AuditAction.ADD_ORGANIZATION,
      actor: this.auditActor(user),
    };

    let organization: IOrganization;
    try {
      organization = await this.organizationService.create(data);
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditBase,
        context: this.orgAuditContext(undefined, data.org_name),
        outcome: this.failureOutcome(err, 'Failed to add organization'),
      });
      throw err;
    }

    this.auditTrailsService.createAuditTrail({
      ...auditBase,
      context: this.orgAuditContext(
        organization._id?.toString(),
        organization.org_name,
      ),
      changes: {after: data},
      outcome: {status: OutComeStatus.SUCCESS},
    });
    return {organization};
  }

  @OpenAPI({
    summary: 'Find which of the given names already exist for a type',
  })
  @Post('/bulk/duplicates')
  @Authorized(['admin', 'moderator'])
  async findDuplicates(
    @Body() data: {type: IOrganization['type']; names: string[]},
  ): Promise<{organizations: Pick<IOrganization, 'org_name' | 'state'>[]}> {
    if (!['central', 'state', 'district'].includes(data?.type)) {
      throw new BadRequestError('Invalid organization type');
    }
    if (!Array.isArray(data?.names)) {
      throw new BadRequestError('No names to check');
    }
    if (data.names.length > MAX_BULK_ROWS) {
      throw new BadRequestError(
        `A single import is limited to ${MAX_BULK_ROWS} rows`,
      );
    }
    const organizations = await this.organizationService.findExisting(
      data.type,
      data.names,
    );
    return {organizations};
  }

  @OpenAPI({summary: 'Bulk import organizations from a parsed sheet'})
  @Post('/bulk')
  @Authorized(['admin', 'moderator'])
  async bulkCreate(
    @Body() data: {type: IOrganization['type']; rows: IOrganizationBulkRow[]},
    @CurrentUser() user: IUser,
  ): Promise<{
    results: IOrganizationBulkResult[];
    created: number;
    skipped: number;
    failed: number;
  }> {
    if (!['central', 'state', 'district'].includes(data?.type)) {
      throw new BadRequestError('Invalid organization type');
    }
    if (!Array.isArray(data?.rows) || data.rows.length === 0) {
      throw new BadRequestError('No rows to import');
    }
    if (data.rows.length > MAX_BULK_ROWS) {
      throw new BadRequestError(
        `A single import is limited to ${MAX_BULK_ROWS} rows`,
      );
    }
    const auditBase: ModeratorAuditTrail = {
      category: AuditCategory.CROP_MANAGEMENT,
      action: AuditAction.ORGANIZATION_BULK_CREATE,
      actor: this.auditActor(user),
      context: {organizationType: data.type, submittedRows: data.rows.length},
    };

    let summary;
    try {
      summary = await this.organizationService.bulkCreate(data.type, data.rows);
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditBase,
        outcome: this.failureOutcome(err, 'Failed to import organizations'),
      });
      throw err;
    }

    // One summary entry per import rather than one per row, so a large sheet does
    // not flood the audit collection.
    this.auditTrailsService.createAuditTrail({
      ...auditBase,
      changes: {
        after: {
          created: summary.created,
          skipped: summary.skipped,
          failed: summary.failed,
        },
      },
      outcome: {status: OutComeStatus.SUCCESS},
    });
    return summary;
  }

  @OpenAPI({summary: 'Edit an existing organization'})
  @Put('/:id')
  @Authorized(['admin', 'moderator'])
  async update(
    @Param('id') id: string,
    @Body() data: Partial<Omit<IOrganization, '_id' | 'createdAt' | 'updatedAt'>>,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean}> {
    if (!id || id === 'undefined' || id.length !== 24) {
      throw new BadRequestError(`Invalid organization ID format: ${id}`);
    }
    if (data.type && !['central', 'state', 'district'].includes(data.type)) {
      throw new BadRequestError('Invalid organization type');
    }

    const auditBase: ModeratorAuditTrail = {
      category: AuditCategory.CROP_MANAGEMENT,
      action: AuditAction.UPDATE_ORGANIZATION,
      actor: this.auditActor(user),
    };

    let previous: IOrganization | null = null;
    let success: boolean;
    try {
      previous = await this.organizationService.findById(id);
      success = await this.organizationService.update(id, data);
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditBase,
        context: this.orgAuditContext(id, previous?.org_name),
        outcome: this.failureOutcome(err, 'Failed to update organization'),
      });
      throw err;
    }

    if (!success) {
      throw new NotFoundError('Organization not found');
    }

    this.auditTrailsService.createAuditTrail({
      ...auditBase,
      context: this.orgAuditContext(id, data.org_name ?? previous?.org_name),
      changes: {
        before: previous
          ? {
              org_name: previous.org_name,
              type: previous.type,
              state: previous.state,
              district: previous.district,
              address: previous.address,
            }
          : undefined,
        after: data,
      },
      outcome: {status: OutComeStatus.SUCCESS},
    });
    return {success};
  }

  @OpenAPI({summary: 'Delete an organization'})
  @Delete('/:id')
  @Authorized(['admin', 'moderator'])
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean}> {
    if (!id || id === 'undefined' || id.length !== 24) {
      throw new BadRequestError(`Invalid organization ID format: ${id}`);
    }

    const auditBase: ModeratorAuditTrail = {
      category: AuditCategory.CROP_MANAGEMENT,
      action: AuditAction.DELETE_ORGANIZATION,
      actor: this.auditActor(user),
    };

    let previous: IOrganization | null = null;
    let success: boolean;
    try {
      previous = await this.organizationService.findById(id);
      success = await this.organizationService.delete(id);
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditBase,
        context: this.orgAuditContext(id, previous?.org_name),
        outcome: this.failureOutcome(err, 'Failed to delete organization'),
      });
      throw err;
    }

    if (!success) {
      throw new NotFoundError('Organization not found');
    }

    this.auditTrailsService.createAuditTrail({
      ...auditBase,
      context: this.orgAuditContext(id, previous?.org_name),
      changes: {
        before: previous
          ? {
              org_name: previous.org_name,
              type: previous.type,
              state: previous.state,
              district: previous.district,
              address: previous.address,
            }
          : undefined,
      },
      outcome: {status: OutComeStatus.SUCCESS},
    });
    return {success};
  }
}
