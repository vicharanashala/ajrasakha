import {IPopRepository} from '#root/shared/database/interfaces/IPopRepository.js';
import {IPop} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {Collection} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';

@injectable()
export class PopRepository implements IPopRepository {
  private PopCollection: Collection<IPop>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.PopCollection = await this.db.getCollection<IPop>('pop');
  }

  async findByShareableLink(shareableLink: string): Promise<IPop | null> {
    await this.init();

    // Match either the document's own shareable_link, or a shareable_link recorded
    // against one of its duplicate_links entries. Either way the caller gets back this
    // (original) document's own shareable_link/shareable_name, never the duplicate's.
    return this.PopCollection.findOne({
      $or: [
        {shareable_link: shareableLink},
        {'duplicate_links.shareable_link': shareableLink},
      ],
    });
  }
}
