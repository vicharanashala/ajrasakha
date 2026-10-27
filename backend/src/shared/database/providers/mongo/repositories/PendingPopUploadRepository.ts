import {Readable} from 'stream';
import {inject, injectable} from 'inversify';
import {Collection, GridFSBucket, ObjectId} from 'mongodb';
import {GLOBAL_TYPES} from '#root/types.js';
import {IPendingPopUploadRepository} from '#root/shared/database/interfaces/IPendingPopUploadRepository.js';
import {IPendingPopUpload} from '#root/shared/interfaces/models.js';
import {MongoDatabase} from '../MongoDatabase.js';

const BUCKET_NAME = 'pending_pop_uploads';

@injectable()
export class PendingPopUploadRepository implements IPendingPopUploadRepository {
  private collection: Collection<IPendingPopUpload>;
  private bucket: GridFSBucket;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    if (this.collection && this.bucket) return;
    this.collection = await this.db.getCollection<IPendingPopUpload>('pending_pop_uploads');
    const rawDb = await this.db.init();
    this.bucket = new GridFSBucket(rawDb, {bucketName: BUCKET_NAME});
  }

  async create(
    doc: Omit<IPendingPopUpload, '_id' | 'gridfsFileId' | 'status' | 'attempts' | 'createdAt' | 'updatedAt'>,
    buffer: Buffer,
  ): Promise<IPendingPopUpload> {
    await this.init();

    const gridfsFileId: ObjectId = await new Promise((resolve, reject) => {
      const uploadStream = this.bucket.openUploadStream(doc.filename, {
        contentType: doc.mimetype,
      });
      uploadStream.once('error', reject);
      uploadStream.once('finish', () => resolve(uploadStream.id as ObjectId));
      Readable.from(buffer).pipe(uploadStream);
    });

    const now = new Date();
    const fullDoc: IPendingPopUpload = {
      ...doc,
      gridfsFileId,
      status: 'received',
      attempts: 0,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.collection.insertOne(fullDoc as any);
    return {...fullDoc, _id: result.insertedId};
  }

  async findByUploader(uploaderId: string): Promise<IPendingPopUpload[]> {
    await this.init();
    return this.collection.find({uploaderId}).sort({createdAt: -1}).toArray();
  }

  async findByUploaderAndSha256(uploaderId: string, sha256: string): Promise<IPendingPopUpload | null> {
    await this.init();
    return this.collection.findOne({uploaderId, sha256});
  }

  async claimNext(): Promise<IPendingPopUpload | null> {
    await this.init();
    const result = await this.collection.findOneAndUpdate(
      {status: 'received'},
      {$set: {status: 'processing', updatedAt: new Date()}},
      {sort: {createdAt: 1}, returnDocument: 'after'},
    );
    return result ?? null;
  }

  async readFile(gridfsFileId: IPendingPopUpload['gridfsFileId']): Promise<Readable> {
    await this.init();
    return this.bucket.openDownloadStream(gridfsFileId as ObjectId);
  }

  async markSucceeded(id: string): Promise<void> {
    await this.init();
    await this.collection.updateOne(
      {_id: new ObjectId(id) as any},
      {$set: {status: 'succeeded', error: null, updatedAt: new Date()}},
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.init();
    await this.collection.updateOne(
      {_id: new ObjectId(id) as any},
      {$set: {status: 'failed', error, updatedAt: new Date()}},
    );
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.init();
    await this.collection.updateOne(
      {_id: new ObjectId(id) as any},
      {$inc: {attempts: 1}, $set: {updatedAt: new Date()}},
    );
  }

  async deleteFile(gridfsFileId: IPendingPopUpload['gridfsFileId']): Promise<void> {
    await this.init();
    try {
      await this.bucket.delete(gridfsFileId as ObjectId);
    } catch (err) {
      // Already gone (e.g. a retry of a cleanup that partially ran) — not worth failing over.
      console.error('[PendingPopUploadRepository] Failed to delete GridFS file', gridfsFileId, err);
    }
  }

  async resetStuckProcessing(): Promise<void> {
    await this.init();
    await this.collection.updateMany(
      {status: 'processing'},
      {$set: {status: 'received', updatedAt: new Date()}},
    );
  }
}
