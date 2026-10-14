import type {ITtsAudioCacheEntry} from './ITtsCacheRepository.js';

export interface ITtsService {
  /**
   * Generate (or retrieve from cache) TTS audio for the given request.
   *
   * Throws `ServiceUnavailableError` if the Sarvam API key is not
   * configured, and `BadGatewayError` when the upstream Sarvam call fails.
   */
  synthesize(input: ITtsSynthesizeInput): Promise<ITtsSynthesizeResult>;

  /**
   * Read-only lookup so tests / health-checks can verify a cache hit
   * without going through the upstream API.
   */
  peekCache(hash: string): Promise<ITtsAudioCacheEntry | null>;
}

export interface ITtsSynthesizeInput {
  text: string;
  language: string;
  speaker?: string;
  pace?: number;
  pitch?: number;
  loudness?: number;
  model?: string;
  outputAudioCodec?: string;
  speechSampleRate?: number;
  /**
   * Logical requester id (typically the requesting user). Stored on the
   * cache entry for traceability but never used as part of the cache key.
   */
  requestedBy?: string;
}

export interface ITtsSynthesizeResult {
  audioBase64: string;
  contentType: string;
  byteSize: number;
  cached: boolean;
  hash: string;
}
