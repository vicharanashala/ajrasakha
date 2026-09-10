import {IPopRepository} from '#root/shared/database/interfaces/IPopRepository.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {inject, injectable} from 'inversify';
import {PopMatchStatus} from '#root/shared/interfaces/models.js';
import {IPopService, PopLookupResult} from '../interfaces/IPopService.js';

@injectable()
export class PopService implements IPopService {
  constructor(
    @inject(CORE_TYPES.PopRepository)
    private readonly popRepo: IPopRepository,
  ) {}

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

    return {
      found: true,
      _id: pop._id?.toString(),
      shareable_name: pop.shareable_name,
      shareable_link: pop.shareable_link,
      num_pages: pop.num_pages,
      matchStatus,
    };
  }
}
