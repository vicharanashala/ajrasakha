import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';

// Mock the config so we don't depend on process.env at test time.
vi.mock('#root/config/app.js', () => ({
  appConfig: {
    sarvamAPI: 'test-sarvam-key',
  },
}));

// MongoDatabase stub: BaseService requires it but we never call into it here.
const mockMongoDatabase = {} as any;

import {appConfig} from '#root/config/app.js';
import {TtsService} from '../services/TtsService.js';
import type {
  ITtsAudioCacheEntry,
  ITtsCacheRepository,
} from '../interfaces/ITtsCacheRepository.js';

function makeCacheRepo(): ITtsCacheRepository & {
  findByHash: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  bumpHit: ReturnType<typeof vi.fn>;
  purgeExpired: ReturnType<typeof vi.fn>;
} {
  return {
    findByHash: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
    bumpHit: vi.fn().mockResolvedValue(undefined),
    purgeExpired: vi.fn().mockResolvedValue({deletedCount: 0}),
  };
}

function makeFakeWavBase64(): string {
  return Buffer.from('RIFF\x00\x00\x00\x00WAVEfmt ', 'binary').toString(
    'base64',
  );
}

function bufferToArrayBufferResponse(
  buffer: Buffer,
  contentType = 'audio/wav',
) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({'content-type': contentType}),
    arrayBuffer: () =>
      Promise.resolve(
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ),
      ),
  };
}

describe('TtsService.synthesize', () => {
  let cache: ReturnType<typeof makeCacheRepo>;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let service: TtsService;

  beforeEach(() => {
    cache = makeCacheRepo();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    service = new TtsService(mockMongoDatabase, cache);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns cached audio without hitting Sarvam on cache hit', async () => {
    const cachedEntry: ITtsAudioCacheEntry = {
      hash: 'cached-hash',
      text: 'hello',
      language: 'en-IN',
      speaker: 'amelia',
      model: 'bulbul:v2',
      audioBase64: makeFakeWavBase64(),
      contentType: 'audio/wav',
      byteSize: 16,
      hitCount: 3,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      ttlAt: new Date(Date.now() + 1000 * 60 * 60),
    };
    cache.findByHash.mockResolvedValueOnce(cachedEntry);

    const result = await service.synthesize({
      text: 'hello',
      language: 'en-IN',
    });

    expect(result.cached).toBe(true);
    expect(result.audioBase64).toBe(cachedEntry.audioBase64);
    expect(result.contentType).toBe('audio/wav');
    expect(result.byteSize).toBe(cachedEntry.byteSize);
    expect(fetchSpy).not.toHaveBeenCalled();
    // bumpHit is fired async; give it a tick to flush.
    await new Promise(r => setTimeout(r, 5));
    expect(cache.bumpHit).toHaveBeenCalledWith(result.hash);
  });

  it('calls Sarvam and caches the result on cache miss', async () => {
    const wavBuffer = Buffer.from('FAKE_WAV_BYTES');
    fetchSpy.mockResolvedValueOnce(bufferToArrayBufferResponse(wavBuffer));

    const result = await service.synthesize({
      text: 'namaste',
      language: 'hi-IN',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.sarvam.ai/text-to-speech');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['api-subscription-key']).toBe('test-sarvam-key');
    const payload = JSON.parse(init.body);
    expect(payload.text).toBe('namaste');
    expect(payload.target_language_code).toBe('hi-IN');
    expect(payload.speaker).toBe('anushka'); // default for Indic languages
    expect(payload.model).toBe('bulbul:v2');
    expect(payload.output_audio_codec).toBe('wav');

    expect(result.cached).toBe(false);
    expect(result.audioBase64).toBe(wavBuffer.toString('base64'));
    expect(result.contentType).toBe('audio/wav');

    expect(cache.upsert).toHaveBeenCalledTimes(1);
    const cachedArg = cache.upsert.mock.calls[0][0];
    expect(cachedArg.hash).toBe(result.hash);
    expect(cachedArg.language).toBe('hi-IN');
    expect(cachedArg.speaker).toBe('anushka');
    expect(cachedArg.audioBase64).toBe(wavBuffer.toString('base64'));
  });
});