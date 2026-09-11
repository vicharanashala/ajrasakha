import {IPopRepository} from '#root/shared/database/interfaces/IPopRepository.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {inject, injectable} from 'inversify';
import {BadRequestError, NotFoundError} from 'routing-controllers';
import {IPop, PopMatchStatus, PopRequiredField} from '#root/shared/interfaces/models.js';
import {IPopService, PopLookupResult} from '../interfaces/IPopService.js';

const REQUIRED_FIELDS: PopRequiredField[] = [
  'year_of_release',
  'live_source_link',
  'shareable_name',
];

const isMissing = (value: unknown) => value === null || value === undefined || value === '';

@injectable()
export class PopService implements IPopService {
  constructor(
    @inject(CORE_TYPES.PopRepository)
    private readonly popRepo: IPopRepository,
  ) {}

  private toLookupResult(pop: IPop, matchStatus: PopMatchStatus): PopLookupResult {
    const missingFields = REQUIRED_FIELDS.filter(field => isMissing(pop[field]));

    return {
      found: true,
      _id: pop._id?.toString(),
      shareable_name: pop.shareable_name,
      shareable_link: pop.shareable_link,
      year_of_release: pop.year_of_release,
      live_source_link: pop.live_source_link,
      missingFields,
      matchStatus,
    };
  }

  async lookupBySource(source: string): Promise<PopLookupResult> {
    const pop = await this.popRepo.findByShareableLink(source);

    if (!pop) {
      return {found: false, matchStatus: 'notFound'};
    }

    // The repository's $or query matches either the document's own shareable_link or
    // one of its duplicate_links[].shareable_link — comparing against the document's own
    // field tells us which path matched.
    const matchStatus: PopMatchStatus =
      pop.shareable_link === source ? 'topLevelMatch' : 'duplicateMatch';

    return this.toLookupResult(pop, matchStatus);
  }

  async updateMissingFields(
    id: string,
    fields: Partial<Record<PopRequiredField, string | number>>,
  ): Promise<PopLookupResult> {
    const updates: Partial<IPop> = {};
    for (const field of REQUIRED_FIELDS) {
      const value = fields[field];
      if (value !== undefined && value !== null && value !== '') {
        updates[field] = value as never;
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestError('At least one field value is required');
    }

    const updated = await this.popRepo.updateFields(id, updates);
    if (!updated) {
      throw new NotFoundError(`pop_unique_documents record not found with id ${id}`);
    }

    return this.toLookupResult(updated, 'topLevelMatch');
  }

  async findById(id: string): Promise<IPop | null> {
    if (!id) return null;
    return await this.popRepo.findById(id);
  }
}
