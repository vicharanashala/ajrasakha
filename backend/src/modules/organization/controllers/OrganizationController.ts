import 'reflect-metadata';
import {JsonController, Get, QueryParams, Authorized} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {IOrganizationService} from '../interfaces/IOrganizationService.js';
import {IOrganization} from '#root/shared/interfaces/models.js';

@OpenAPI({
  tags: ['Organizations'],
  description: 'Lookup for the organization directory (used by the Edit Source organization dropdown)',
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
    @QueryParams() query: {search?: string; limit?: number},
  ): Promise<{organizations: IOrganization[]}> {
    const limit = Number(query.limit) || 20;
    return await this.organizationService.search(query.search, limit);
  }
}
