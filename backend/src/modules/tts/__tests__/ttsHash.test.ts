import 'reflect-metadata';
import {describe, it, expect} from 'vitest';
import {
  computeHash,
  estimateBase64ByteSize,
  sanitizeUpstreamError,
} from '../services/ttsHash.js';
import type {NormalizedTtsInput} from '../services/TtsService.js';

const baseInput: NormalizedTtsInput = {
  text: 'hello',
  language: 'en-IN',
  speaker: 'amelia',
  pace: 1.0,
  pitch: 0.0,
  loudness: 1.0,
  model: 'bulbul:v2',
  outputAudioCodec: 'wav',
  speechSampleRate: 22050,
};

describe('computeHash', () => {
  it('produces a deterministic 32-char hex string', () => {
    const hash = computeHash(baseInput);
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it('is stable across calls', () => {
    expect(computeHash(baseInput)).toBe(computeHash(baseInput));
  });

  it('changes when any field changes', () => {
    const cases: Array<Partial<NormalizedTtsInput>> = [
      {text: 'different'},
      {language: 'hi-IN'},
      {speaker: 'anushka'},
      {pace: 1.2},
      {pitch: 0.1},
      {loudness: 1.5},
      {model: 'bulbul:v1'},
      {outputAudioCodec: 'mp3'},
      {speechSampleRate: 16000},
    ];
    const baseline = computeHash(baseInput);
    for (const patch of cases) {
      expect(computeHash({...baseInput, ...patch})).not.toBe(baseline);
    }
  });

  it('treats field order as irrelevant (input is JSON-canonicalized)', () => {
    const a: NormalizedTtsInput = {
      ...baseInput,
      speaker: 'amelia',
      pace: 1.0,
    };
    const b: NormalizedTtsInput = {
      ...baseInput,
      pace: 1.0,
      speaker: 'amelia',
    };
    expect(computeHash(a)).toBe(computeHash(b));
  });
});

describe('estimateBase64ByteSize', () => {
  it('decodes correctly for a padded base64 string', () => {
    const b64 = Buffer.from('hello world').toString('base64'); // 11 raw bytes
    expect(estimateBase64ByteSize(b64)).toBe(11);
  });

  it('returns 0 for empty input', () => {
    expect(estimateBase64ByteSize('')).toBe(0);
  });

  it('handles a buffer that has no padding', () => {
    // 'a' = 1 byte, base64 = 'YQ==' (2 padding chars)
    expect(estimateBase64ByteSize('YQ==')).toBe(1);
  });
});

describe('sanitizeUpstreamError', () => {
  it('returns "unknown error" for null/undefined', () => {
    expect(sanitizeUpstreamError(null)).toBe('unknown error');
    expect(sanitizeUpstreamError(undefined)).toBe('unknown error');
  });

  it('uses .message for Error instances', () => {
    expect(sanitizeUpstreamError(new Error('boom'))).toBe('boom');
  });

  it('truncates very long messages to 240 chars', () => {
    const big = new Error('x'.repeat(1000));
    expect(sanitizeUpstreamError(big)).toHaveLength(240);
  });

  it('stringifies non-Error values', () => {
    expect(sanitizeUpstreamError('plain text')).toBe('plain text');
  });
});