import {IOrganization} from '#root/shared/interfaces/models.js';

export interface IOrganizationRepository {
  /**
   * Searches the `organization` collection by org_name (case-insensitive).
   */
  search(search?: string, page?: number, limit?: number): Promise<{organizations: IOrganization[], totalPages: number}>;
  create(data: Omit<IOrganization, '_id'>): Promise<IOrganization>;
  update(id: string, data: Partial<IOrganization>): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
