import {IOrganization} from '#root/shared/interfaces/models.js';

export interface IOrganizationRepository {
  /**
   * Searches the `organization` collection by org_name (case-insensitive).
   */
  search(search?: string, page?: number, limit?: number): Promise<{organizations: IOrganization[], totalPages: number}>;
  findById(id: string): Promise<IOrganization | null>;
  create(data: Omit<IOrganization, '_id'>): Promise<IOrganization>;
  /** Returns the organizations of `type` whose name matches any of `names`
   *  (case-insensitive), used to detect duplicates before a bulk insert. */
  findByNames(type: IOrganization['type'], names: string[]): Promise<IOrganization[]>;
  insertMany(data: Omit<IOrganization, '_id'>[]): Promise<number>;
  update(id: string, data: Partial<IOrganization>): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
