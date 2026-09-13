import {createHash} from 'crypto';
import type {NormalizedTtsInput} from './TtsService.js';

/** 128 bits is more than enough for a request-level cache key. */
export const CACHE_HASH_LENGTH = 32;

/** Approximate decoded byte size from a base64 string (4 chars → 3 bytes). */
export function estimateBase64ByteSize(base64: string): number {
  const padding = (base64.match(/=+$/)?.[0].length) ?? 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Deterministic 128-bit cache key from the normalized request. */
export function computeHash(input: NormalizedTtsInput): string {
  // Order matters: must be stable across versions and runtimes.
  const canonical = JSON.stringify({
    text: input.text,
    language: input.language,
    speaker: input.speaker,
    pace: input.pace,
    pitch: input.pitch,
    loudness: input.loudness,
    model: input.model,
    outputAudioCodec: input.outputAudioCodec,
    speechSampleRate: input.speechSampleRate,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(
    0,
    CACHE_HASH_LENGTH,
  );
}

/** Trim verbose upstream error text to keep 502 responses readable. */
export function sanitizeUpstreamError(error: unknown): string {
  if (!error) return 'unknown error';
  if (error instanceof Error) return error.message.slice(0, 240);
  return String(error).slice(0, 240);
}