import {IPopRepository} from '#root/shared/database/interfaces/IPopRepository.js';
import {IPop, IPopQueueItemSummary} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {isValidObjectId} from '#root/utils/isValidObjectId.js';
import {inject, injectable} from 'inversify';
import {Collection, ObjectId} from 'mongodb';
import {BadRequestError} from 'routing-controllers';
import {MongoDatabase} from '../MongoDatabase.js';

@injectable()
export class PopRepository implements IPopRepository {
  private PopCollection: Collection<IPop>;
  private PopQueueCollection: Collection<IPopQueueItemSummary>;

  constructor(
    @inject(GLOBAL_TYPES.popDatabase)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.PopCollection = await this.db.getCollection<IPop>('pop_unique_documents');
    this.PopQueueCollection = await this.db.getCollection<IPopQueueItemSummary>('pop_upload_queue_items');
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

  async findById(id: string): Promise<IPop | null> {
    await this.init();
    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing pop_unique_documents id');
    }
    return this.PopCollection.findOne({_id: new ObjectId(id) as any});
  }

  async updateFields(id: string, fields: Partial<IPop>): Promise<IPop | null> {
    await this.init();
    if (!id || !isValidObjectId(id)) {
      throw new BadRequestError('Invalid or missing pop_unique_documents id');
    }
    const result = await this.PopCollection.findOneAndUpdate(
      {_id: new ObjectId(id) as any},
      {$set: fields},
      {returnDocument: 'after'},
    );
    return result ?? null;
  }

  async findQueuedBySha256(sha256: string): Promise<IPopQueueItemSummary | null> {
    await this.init();
    return this.PopQueueCollection.findOne({sha256});
  }

  async findCatalogueBySha256(sha256: string): Promise<IPop | null> {
    await this.init();
    return this.PopCollection.findOne({
      $or: [{sha256}, {merged_sha256s: sha256}],
    });
  }
}
