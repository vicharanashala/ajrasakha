import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';

// Mock the config so we don't depend on process.env at test time.
vi.mock('#root/config/app.js', () => ({
  appConfig: {
    sarvamAPI: 'test-sarvam-key',
  },
}));

const mockMongoDatabase = {} as any;

import {appConfig} from '#root/config/app.js';
import {TtsService} from '../services/TtsService.js';
import type {ITtsCacheRepository} from '../interfaces/ITtsCacheRepository.js';

function makeCacheRepo() {
  return {
    findByHash: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
    bumpHit: vi.fn().mockResolvedValue(undefined),
    purgeExpired: vi.fn().mockResolvedValue({deletedCount: 0}),
  } as unknown as ITtsCacheRepository & {
    findByHash: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    bumpHit: ReturnType<typeof vi.fn>;
  };
}

function bufferToArrayBufferResponse(buffer: Buffer) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({'content-type': 'audio/wav'}),
    arrayBuffer: () =>
      Promise.resolve(
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ),
      ),
  };
}

describe('TtsService.synthesize — error paths', () => {
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
    // Reset the mocked config so a test that toggles sarvamAPI off doesn't
    // leak into the next test.
    (appConfig as any).sarvamAPI = 'test-sarvam-key';
  });

  it('rejects with SARVAM_API_KEY-missing error when key is not configured', async () => {
    (appConfig as any).sarvamAPI = undefined;

    await expect(
      service.synthesize({text: 'x', language: 'en-IN'}),
    ).rejects.toMatchObject({
      message: expect.stringContaining('SARVAM_API_KEY'),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cache.upsert).not.toHaveBeenCalled();
  });

  it('rejects with upstream-failure error when Sarvam returns non-2xx', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () => Promise.resolve('rate limited'),
    });

    await expect(
      service.synthesize({text: 'x', language: 'en-IN'}),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Sarvam TTS upstream failed'),
    });
    expect(cache.upsert).not.toHaveBeenCalled();
  });

  it('still serves the user when cache write fails after a successful upstream call', async () => {
    const wavBuffer = Buffer.from('OK');
    fetchSpy.mockResolvedValueOnce(bufferToArrayBufferResponse(wavBuffer));
    cache.upsert.mockRejectedValueOnce(new Error('mongo down'));

    const result = await service.synthesize({
      text: 'boom',
      language: 'en-IN',
    });

    expect(result.cached).toBe(false);
    expect(result.audioBase64).toBe(wavBuffer.toString('base64'));
  });

  it('normalizeInput fills sensible defaults and trims text', () => {
    const out = service.normalizeInput({
      text: '  hello  ',
      language: 'en-IN',
      pace: undefined,
      pitch: undefined,
      loudness: undefined,
      speaker: undefined,
      model: undefined,
      outputAudioCodec: undefined,
      speechSampleRate: undefined,
    });
    expect(out.text).toBe('hello');
    expect(out.speaker).toBe('amelia');
    expect(out.pace).toBe(1.0);
    expect(out.pitch).toBe(0.0);
    expect(out.loudness).toBe(1.0);
    expect(out.model).toBe('bulbul:v2');
    expect(out.outputAudioCodec).toBe('wav');
    expect(out.speechSampleRate).toBe(22050);
  });

  it('normalizeInput picks a non-English default speaker for Indic languages', () => {
    const out = service.normalizeInput({text: 'नमस्ते', language: 'hi-IN'});
    expect(out.speaker).toBe('anushka');
  });
});