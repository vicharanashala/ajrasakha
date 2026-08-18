import {inject} from 'inversify';
import {Collection, ClientSession} from 'mongodb';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {
  ITtsAudioCacheEntry,
  ITtsCacheRepository,
} from '../interfaces/ITtsCacheRepository.js';

const COLLECTION_NAME = 'tts_audio_cache';
const DEFAULT_TTL_DAYS = 30;

/**
 * Mongo-backed cache for synthesized TTS audio.
 *
 * Index strategy:
 *  - `hash` is a unique index; it is the cache key.
 *  - `ttlAt` is a TTL-style index for opportunistic cleanup by Mongo
 *    (in addition to the explicit `purgeExpired` sweep).
 */
export class TtsCacheRepository implements ITtsCacheRepository {
  private collection!: Collection<ITtsAudioCacheEntry>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly db: MongoDatabase,
  ) {}

  /** Lazy initialization so the Mongo client is connected before use. */
  private async init(): Promise<Collection<ITtsAudioCacheEntry>> {
    if (!this.collection) {
      this.collection = await this.db.getCollection<ITtsAudioCacheEntry>(
        COLLECTION_NAME,
      );
      await this.ensureIndexes();
    }
    return this.collection;
  }

  private async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({hash: 1}, {unique: true});
    await this.collection.createIndex(
      {ttlAt: 1},
      {expireAfterSeconds: 0},
    );
  }

  async findByHash(hash: string): Promise<ITtsAudioCacheEntry | null> {
    const coll = await this.init();
    return coll.findOne({hash});
  }

  async upsert(
    entry: ITtsAudioCacheEntry,
    _session?: ClientSession,
  ): Promise<void> {
    const coll = await this.init();
    await coll.updateOne(
      {hash: entry.hash},
      {$set: entry},
      {upsert: true},
    );
  }

  async bumpHit(hash: string): Promise<void> {
    const coll = await this.init();
    await coll.updateOne(
      {hash},
      {
        $inc: {hitCount: 1},
        $set: {lastAccessedAt: new Date()},
      },
    );
  }

  async purgeExpired(now: Date = new Date()): Promise<{deletedCount: number}> {
    const coll = await this.init();
    const result = await coll.deleteMany({ttlAt: {$lt: now}});
    return {deletedCount: result.deletedCount ?? 0};
  }
}

export {DEFAULT_TTL_DAYS};
