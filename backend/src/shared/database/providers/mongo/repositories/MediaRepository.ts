import { inject, injectable } from 'inversify';
import { Collection, ObjectId } from 'mongodb';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#root/shared/index.js';
import { IMedia, MediaKind } from '#root/shared/interfaces/models.js';
import { IMediaRepository } from '#root/shared/database/interfaces/IMediaRepository.js';

@injectable()
export class MediaRepository implements IMediaRepository {
  private collection: Collection<IMedia>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init(): Promise<void> {
    if (!this.collection) {
      this.collection = await this.db.getCollection<IMedia>('media');
      await this.collection.createIndex({ kind: 1, order: 1 });
    }
  }

  async list(kind?: MediaKind): Promise<IMedia[]> {
    await this.init();
    const filter = kind ? { kind } : {};
    const docs = await this.collection
      .find(filter)
      .sort({ order: 1, createdAt: -1 })
      .toArray();
    // Stringify _id so the frontend gets a usable id.
    return docs.map(d => ({ ...d, _id: d._id?.toString() }));
  }

  async getById(id: string): Promise<IMedia | null> {
    await this.init();
    if (!ObjectId.isValid(id)) return null;
    const doc = await this.collection.findOne({ _id: new ObjectId(id) } as any);
    return doc ? { ...doc, _id: doc._id?.toString() } : null;
  }

  async create(media: Omit<IMedia, '_id'>): Promise<IMedia> {
    await this.init();
    const doc = { ...media, createdAt: media.createdAt ?? new Date() };
    const res = await this.collection.insertOne(doc as any);
    return { ...doc, _id: res.insertedId.toString() };
  }

  async delete(id: string): Promise<boolean> {
    await this.init();
    if (!ObjectId.isValid(id)) return false;
    const res = await this.collection.deleteOne({ _id: new ObjectId(id) } as any);
    return res.deletedCount === 1;
  }

  async nextOrder(kind: MediaKind): Promise<number> {
    await this.init();
    const last = await this.collection
      .find({ kind })
      .sort({ order: -1 })
      .limit(1)
      .toArray();
    return last.length ? (last[0].order ?? 0) + 1 : 0;
  }
}
