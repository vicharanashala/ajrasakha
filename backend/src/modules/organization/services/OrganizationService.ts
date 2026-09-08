import {IOrganizationRepository} from '#root/shared/database/interfaces/IOrganizationRepository.js';
import {IOrganization} from '#root/shared/interfaces/models.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {inject, injectable} from 'inversify';
import {IOrganizationService} from '../interfaces/IOrganizationService.js';

@injectable()
export class OrganizationService implements IOrganizationService {
  constructor(
    @inject(CORE_TYPES.OrganizationRepository)
    private readonly organizationRepo: IOrganizationRepository,
  ) {}

  async search(
    search?: string,
    limit?: number,
  ): Promise<{organizations: IOrganization[]}> {
    const organizations = await this.organizationRepo.search(search, limit);
    return {organizations};
  }
}
