import type {ClientSession} from 'mongodb';

/**
 * One cached TTS audio payload. Keyed by a deterministic hash of
 * (text, language, speaker, model, audio codec/sample-rate, pace, pitch, loudness)
 * so identical requests short-circuit the upstream Sarvam call.
 */
export interface ITtsAudioCacheEntry {
  hash: string;
  text: string;
  language: string;
  speaker: string;
  model: string;
  audioBase64: string;
  contentType: string;
  byteSize: number;
  hitCount: number;
  createdAt: Date;
  lastAccessedAt: Date;
  /** When this entry becomes eligible for TTL cleanup. */
  ttlAt: Date;
}

/**
 * Persistence layer for cached TTS audio. Keeping the cache in MongoDB
 * avoids re-paying for Sarvam generation on every replay and gives us a
 * free shared cache across all backend replicas.
 */
export interface ITtsCacheRepository {
  /**
   * Look up a cached audio payload by its deterministic request hash.
   * Returns `null` on cache miss.
   */
  findByHash(hash: string): Promise<ITtsAudioCacheEntry | null>;

  /**
   * Upsert a new cache entry. Used both on cache miss (insert) and to
   * refresh `lastAccessedAt` for an existing entry.
   */
  upsert(entry: ITtsAudioCacheEntry, session?: ClientSession): Promise<void>;

  /**
   * Bump the access counter + timestamp when a cached entry is served.
   * Returned so callers can log hit-rate metrics.
   */
  bumpHit(hash: string): Promise<void>;

  /**
   * Drop entries past their TTL. Designed to be called from a cron job.
   */
  purgeExpired(now?: Date): Promise<{deletedCount: number}>;
}
