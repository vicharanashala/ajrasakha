import { inject, injectable } from 'inversify';
import { Collection, ObjectId } from 'mongodb';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#root/shared/index.js';
import { IDashboardContent, IMedia, MediaKind } from '#root/shared/interfaces/models.js';
import { IMediaRepository } from '#root/shared/database/interfaces/IMediaRepository.js';

const SINGLETON_KEY = 'public_dashboard';

/**
 * Media is stored INSIDE the dashboard_content singleton (IDashboardContent.media) rather
 * than a separate `media` collection, so the public dashboard retrieves images/videos with
 * the rest of its content. Metadata is tiny (URLs, titles), so the singleton stays well
 * under Mongo's 16 MB document cap. The GCS objects themselves live in the media bucket.
 */
@injectable()
export class MediaRepository implements IMediaRepository {
  private collection: Collection<IDashboardContent>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init(): Promise<void> {
    if (!this.collection) {
      this.collection =
        await this.db.getCollection<IDashboardContent>('dashboard_content');
      await this.collection.createIndex({ key: 1 }, { unique: true });
    }
  }

  private async allMedia(): Promise<IMedia[]> {
    const doc = await this.collection.findOne({ key: SINGLETON_KEY });
    return doc?.media ?? [];
  }

  private serialise(m: IMedia): IMedia {
    return { ...m, _id: m._id?.toString() };
  }

  async list(kind?: MediaKind): Promise<IMedia[]> {
    await this.init();
    const media = await this.allMedia();
    return media
      .filter(m => !kind || m.kind === kind)
      .sort(
        (a, b) =>
          (a.order ?? 0) - (b.order ?? 0) ||
          (b.createdAt?.valueOf() ?? 0) - (a.createdAt?.valueOf() ?? 0),
      )
      .map(m => this.serialise(m));
  }

  async getById(id: string): Promise<IMedia | null> {
    await this.init();
    const media = await this.allMedia();
    const found = media.find(m => m._id?.toString() === id);
    return found ? this.serialise(found) : null;
  }

  async create(media: Omit<IMedia, '_id'>): Promise<IMedia> {
    await this.init();
    const doc: IMedia = {
      ...media,
      _id: new ObjectId(),
      createdAt: media.createdAt ?? new Date(),
    };
    // Upsert the singleton so the very first upload works even before any content is saved.
    await this.collection.updateOne(
      { key: SINGLETON_KEY },
      {
        $push: { media: doc },
        $setOnInsert: { key: SINGLETON_KEY, blocks: [], stats: [] },
      } as any,
      { upsert: true },
    );
    return this.serialise(doc);
  }

  async delete(id: string): Promise<boolean> {
    await this.init();
    if (!ObjectId.isValid(id)) return false;
    const res = await this.collection.updateOne(
      { key: SINGLETON_KEY },
      { $pull: { media: { _id: new ObjectId(id) } } } as any,
    );
    return res.modifiedCount === 1;
  }

  async nextOrder(kind: MediaKind): Promise<number> {
    await this.init();
    const media = await this.allMedia();
    const orders = media.filter(m => m.kind === kind).map(m => m.order ?? 0);
    return orders.length ? Math.max(...orders) + 1 : 0;
  }
}
