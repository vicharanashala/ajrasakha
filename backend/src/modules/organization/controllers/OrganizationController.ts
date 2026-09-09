import 'reflect-metadata';
import {JsonController, Get, QueryParams, Authorized, Post, Put, Delete, Body, Param, NotFoundError, BadRequestError} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {IOrganizationService} from '../interfaces/IOrganizationService.js';
import {
  IOrganization,
  IOrganizationBulkResult,
  IOrganizationBulkRow,
} from '#root/shared/interfaces/models.js';

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
  ) {}

  @OpenAPI({summary: 'Search organizations by name'})
  @Get('/')
  @Authorized()
  async search(
    @QueryParams() query: {search?: string; page?: number; limit?: number},
  ): Promise<{organizations: IOrganization[], totalPages: number}> {
    const limit = Number(query.limit) || 20;
    const page = Number(query.page) || 1;
    return await this.organizationService.search(query.search, page, limit);
  }

  @OpenAPI({summary: 'Add a new organization'})
  @Post('/')
  @Authorized(['admin', 'moderator'])
  async create(
    @Body() data: Omit<IOrganization, '_id' | 'createdAt' | 'updatedAt'>
  ): Promise<{organization: IOrganization}> {
    if (!['central', 'state', 'district'].includes(data.type)) {
      throw new BadRequestError('Invalid organization type');
    }
    const organization = await this.organizationService.create(data);
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
    return await this.organizationService.bulkCreate(data.type, data.rows);
  }

  @OpenAPI({summary: 'Edit an existing organization'})
  @Put('/:id')
  @Authorized(['admin', 'moderator'])
  async update(
    @Param('id') id: string,
    @Body() data: Partial<Omit<IOrganization, '_id' | 'createdAt' | 'updatedAt'>>
  ): Promise<{success: boolean}> {
    if (!id || id === 'undefined' || id.length !== 24) {
      throw new BadRequestError(`Invalid organization ID format: ${id}`);
    }
    if (data.type && !['central', 'state', 'district'].includes(data.type)) {
      throw new BadRequestError('Invalid organization type');
    }
    const success = await this.organizationService.update(id, data);
    if (!success) {
      throw new NotFoundError('Organization not found');
    }
    return {success};
  }

  @OpenAPI({summary: 'Delete an organization'})
  @Delete('/:id')
  @Authorized(['admin', 'moderator'])
  async delete(@Param('id') id: string): Promise<{success: boolean}> {
    if (!id || id === 'undefined' || id.length !== 24) {
      throw new BadRequestError(`Invalid organization ID format: ${id}`);
    }
    const success = await this.organizationService.delete(id);
    if (!success) {
      throw new NotFoundError('Organization not found');
    }
    return {success};
  }
}
