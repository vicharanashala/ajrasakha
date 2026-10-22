import {
  IOrganization,
  IOrganizationBulkResult,
  IOrganizationBulkRow,
} from '#root/shared/interfaces/models.js';

export interface IOrganizationService {
  search(
    search?: string,
    page?: number,
    limit?: number,
    type?: IOrganization['type'],
  ): Promise<{organizations: IOrganization[], totalPages: number}>;
  findById(id: string): Promise<IOrganization | null>;
  create(data: Omit<IOrganization, '_id'>): Promise<IOrganization>;
  /** Names already in the directory for this type, used to flag duplicates
   *  before an import is committed. */
  findExisting(
    type: IOrganization['type'],
    names: string[],
  ): Promise<Pick<IOrganization, 'org_name' | 'state'>[]>;
  bulkCreate(
    type: IOrganization['type'],
    rows: IOrganizationBulkRow[],
  ): Promise<{results: IOrganizationBulkResult[]; created: number; skipped: number; failed: number}>;
  update(id: string, data: Partial<IOrganization>): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
