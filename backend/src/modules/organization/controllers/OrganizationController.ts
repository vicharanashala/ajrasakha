import 'reflect-metadata';
import {JsonController, Get, QueryParams, Authorized, Post, Put, Delete, Body, Param, NotFoundError, BadRequestError} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {IOrganizationService} from '../interfaces/IOrganizationService.js';
import {IOrganization} from '#root/shared/interfaces/models.js';

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
    const organization = await this.organizationService.create(data);
    return {organization};
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
