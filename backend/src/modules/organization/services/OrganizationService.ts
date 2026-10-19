import {IOrganizationRepository} from '#root/shared/database/interfaces/IOrganizationRepository.js';
import {
  IOrganization,
  IOrganizationBulkResult,
  IOrganizationBulkRow,
} from '#root/shared/interfaces/models.js';
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
    type?: IOrganization['type'],
  ): Promise<{organizations: IOrganization[], totalPages: number}> {
    return this.organizationRepo.search(search, page, limit, type);
  }

  async findById(id: string): Promise<IOrganization | null> {
    return this.organizationRepo.findById(id);
  }

  async create(data: Omit<IOrganization, '_id'>): Promise<IOrganization> {
    return this.organizationRepo.create(data);
  }

  async findExisting(
    type: IOrganization['type'],
    names: string[],
  ): Promise<Pick<IOrganization, 'org_name' | 'state'>[]> {
    const trimmed = [...new Set(names.map(n => (n ?? '').trim()).filter(Boolean))];
    const existing = await this.organizationRepo.findByNames(type, trimmed);
    return existing.map(org => ({org_name: org.org_name, state: org.state}));
  }

  // Imports a sheet of organizations under a single type. Rows missing a required
  // field fail, rows duplicated inside the file or already present in the database
  // are skipped, and everything else is inserted in one write. Results keep the
  // original row order so the uploader can map them back to the sheet.
  async bulkCreate(
    type: IOrganization['type'],
    rows: IOrganizationBulkRow[],
  ): Promise<{
    results: IOrganizationBulkResult[];
    created: number;
    skipped: number;
    failed: number;
  }> {
    const results: IOrganizationBulkResult[] = new Array(rows.length);
    const pending: {index: number; doc: Omit<IOrganization, '_id'>}[] = [];
    const seenInFile = new Set<string>();

    const dedupeKey = (name: string, state: string) =>
      `${name.trim().toLowerCase()}|${state.trim().toLowerCase()}`;

    rows.forEach((row, index) => {
      const orgName = (row.org_name ?? '').trim();
      const state = (row.state ?? '').trim();

      if (!orgName) {
        results[index] = {
          name: orgName || `Row ${index + 2}`,
          status: 'failed',
          reason: 'Name is required',
        };
        return;
      }
      if (!state) {
        results[index] = {
          name: orgName,
          status: 'failed',
          reason: 'State is required',
        };
        return;
      }

      const key = dedupeKey(orgName, state);
      if (seenInFile.has(key)) {
        results[index] = {
          name: orgName,
          status: 'skipped',
          reason: 'Duplicate row in the uploaded file',
        };
        return;
      }
      seenInFile.add(key);

      pending.push({
        index,
        doc: {
          org_name: orgName,
          type,
          state,
          district: (row.district ?? '').trim() || undefined,
          address: (row.address ?? '').trim() || undefined,
        },
      });
    });

    const existing = await this.organizationRepo.findByNames(
      type,
      pending.map(p => p.doc.org_name),
    );
    const existingKeys = new Set(
      existing.map(org => dedupeKey(org.org_name, org.state ?? '')),
    );

    const toInsert = pending.filter(p => {
      const key = dedupeKey(p.doc.org_name, p.doc.state);
      if (!existingKeys.has(key)) return true;
      results[p.index] = {
        name: p.doc.org_name,
        status: 'skipped',
        reason: 'An organization with this name, type and state already exists',
      };
      return false;
    });

    if (toInsert.length) {
      try {
        await this.organizationRepo.insertMany(toInsert.map(p => p.doc));
        toInsert.forEach(p => {
          results[p.index] = {
            name: p.doc.org_name,
            status: 'created',
            reason: '',
          };
        });
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'Failed to insert row';
        toInsert.forEach(p => {
          results[p.index] = {
            name: p.doc.org_name,
            status: 'failed',
            reason,
          };
        });
      }
    }

    const count = (status: IOrganizationBulkResult['status']) =>
      results.filter(r => r.status === status).length;

    return {
      results,
      created: count('created'),
      skipped: count('skipped'),
      failed: count('failed'),
    };
  }

  async update(id: string, data: Partial<IOrganization>): Promise<boolean> {
    return this.organizationRepo.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    return this.organizationRepo.delete(id);
  }
}
