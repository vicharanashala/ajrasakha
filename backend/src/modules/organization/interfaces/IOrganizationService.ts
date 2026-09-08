import {IOrganization} from '#root/shared/interfaces/models.js';

export interface IOrganizationService {
  search(search?: string, page?: number, limit?: number): Promise<{organizations: IOrganization[], totalPages: number}>;
  create(data: Omit<IOrganization, '_id'>): Promise<IOrganization>;
  update(id: string, data: Partial<IOrganization>): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
