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
    page?: number,
    limit?: number,
  ): Promise<{organizations: IOrganization[], totalPages: number}> {
    return this.organizationRepo.search(search, page, limit);
  }

  async create(data: Omit<IOrganization, '_id'>): Promise<IOrganization> {
    return this.organizationRepo.create(data);
  }

  async update(id: string, data: Partial<IOrganization>): Promise<boolean> {
    return this.organizationRepo.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    return this.organizationRepo.delete(id);
  }
}
