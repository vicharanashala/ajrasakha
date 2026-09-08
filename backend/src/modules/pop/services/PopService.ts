import {IPopRepository} from '#root/shared/database/interfaces/IPopRepository.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {inject, injectable} from 'inversify';
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
      return {found: false};
    }

    return {
      found: true,
      shareable_name: pop.shareable_name,
      shareable_link: pop.shareable_link,
    };
  }
}
