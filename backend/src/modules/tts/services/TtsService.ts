import {inject, injectable} from 'inversify';
import {
  HttpError,
  InternalServerError,
} from 'routing-controllers';
import {appConfig} from '#root/config/app.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {BaseService} from '#shared/classes/BaseService.js';
import {MongoDatabase} from '#shared/database/providers/mongo/MongoDatabase.js';

import {TTS_TYPES} from '../types.js';
import {
  TTS_DEFAULT_SPEAKER_EN,
  TTS_DEFAULT_SPEAKER_INDIC,
} from '../classes/validators/TtsValidators.js';
import {
  ITtsService,
  ITtsSynthesizeInput,
  ITtsSynthesizeResult,
} from '../interfaces/ITtsService.js';
import {
  ITtsAudioCacheEntry,
  ITtsCacheRepository,
} from '../interfaces/ITtsCacheRepository.js';
import {DEFAULT_TTL_DAYS} from '../repositories/TtsCacheRepository.js';
import {
  computeHash,
  estimateBase64ByteSize,
  sanitizeUpstreamError,
} from './ttsHash.js';

/** Public Sarvam TTS endpoint (bulbul v1/v2). */
const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';
const DEFAULT_MODEL = 'bulbul:v2';
const DEFAULT_CODEC = 'wav';
const DEFAULT_SAMPLE_RATE = 22050;
const MAX_TEXT_PREVIEW_CHARS = 200;

/** Map Sarvam `output_audio_codec` values to MIME types for the client.
 *  mu-law and A-law both surface as `audio/basic` (8 kHz, 1 channel). */
const CODEC_TO_MIME: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  pcm: 'audio/L16',
  mulaw: 'audio/basic',
  alaw: 'audio/basic',
  opus: 'audio/opus',
  flac: 'audio/flac',
};

/** Normalized view of a TTS request — used for both cache-keying and the upstream call. */
export interface NormalizedTtsInput {
  text: string;
  language: string;
  speaker: string;
  pace: number;
  pitch: number;
  loudness: number;
  model: string;
  outputAudioCodec: string;
  speechSampleRate: number;
}

@injectable()
export class TtsService extends BaseService implements ITtsService {
  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
    @inject(TTS_TYPES.TtsCacheRepository)
    private readonly cache: ITtsCacheRepository,
  ) {
    super(mongoDatabase);
  }

  async synthesize(input: ITtsSynthesizeInput): Promise<ITtsSynthesizeResult> {
    const normalized = this.normalizeInput(input);
    const hash = computeHash(normalized);

    // 1. Cache hit? Return immediately.
    // Best-effort cache lookup: if Mongo is unreachable we still want the request
    // to succeed, so fall through to the upstream Sarvam call.
    let cached: Awaited<ReturnType<typeof this.cache.findByHash>> = null;
    try {
      cached = await this.cache.findByHash(hash);
    } catch (cacheErr) {
      console.warn('[TTS] cache lookup failed, proceeding without cache:', cacheErr);
    }
    if (cached) {
      // Bump hit counter async — never block the user response on it.
      void this.cache.bumpHit(hash).catch(err => {
        console.warn('[TTS] failed to bump cache hit', err);
      });
      return {
        audioBase64: cached.audioBase64,
        contentType: cached.contentType,
        byteSize: cached.byteSize,
        cached: true,
        hash,
      };
    }

    // 2. Cache miss — call Sarvam.
    const apiKey = appConfig.sarvamAPI;
    if (!apiKey) {
      throw new HttpError(
        503,
        'SARVAM_API_KEY is not configured on the server.',
      );
    }

    let upstream: {audioBase64: string; contentType: string};
    try {
      upstream = await this.callSarvam(apiKey, normalized);
    } catch (error: any) {
      throw new HttpError(
        502,
        `Sarvam TTS upstream failed: ${sanitizeUpstreamError(error)}`,
      );
    }

    const byteSize = estimateBase64ByteSize(upstream.audioBase64);
    const now = new Date();
    const ttlAt = new Date(
      now.getTime() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const entry: ITtsAudioCacheEntry = {
      hash,
      text: normalized.text.slice(0, MAX_TEXT_PREVIEW_CHARS),
      language: normalized.language,
      speaker: normalized.speaker,
      model: normalized.model,
      audioBase64: upstream.audioBase64,
      contentType: upstream.contentType,
      byteSize,
      hitCount: 0,
      createdAt: now,
      lastAccessedAt: now,
      ttlAt,
    };

    // 3. Best-effort cache write — never fail the user request here.
    try {
      await this.cache.upsert(entry);
    } catch (error: any) {
      console.warn('[TTS] cache upsert failed', error);
    }

    return {
      audioBase64: upstream.audioBase64,
      contentType: upstream.contentType,
      byteSize,
      cached: false,
      hash,
    };
  }

  async peekCache(hash: string): Promise<ITtsAudioCacheEntry | null> {
    return this.cache.findByHash(hash);
  }

  /** Fill in defaults, normalize text, pick a sensible speaker for the language. */
  normalizeInput(input: ITtsSynthesizeInput): NormalizedTtsInput {
    const isEnglish = input.language === 'en-IN';
    return {
      text: input.text.trim(),
      language: input.language,
      speaker:
        input.speaker ??
        (isEnglish ? TTS_DEFAULT_SPEAKER_EN : TTS_DEFAULT_SPEAKER_INDIC),
      pace: input.pace ?? 1.0,
      pitch: input.pitch ?? 0.0,
      loudness: input.loudness ?? 1.0,
      model: input.model ?? DEFAULT_MODEL,
      outputAudioCodec: input.outputAudioCodec ?? DEFAULT_CODEC,
      speechSampleRate: input.speechSampleRate ?? DEFAULT_SAMPLE_RATE,
    };
  }

  /** HTTPS call to Sarvam.
   *  Sarvam's bulbul:v2 REST endpoint always returns a JSON envelope of the
   *  shape `{"request_id":"…","audios":["<base64-wav|mp3|…>"]}` — one
   *  base64-encoded audio chunk per synthesised sentence. We unwrap it.
   *  Raw-bytes fallback is kept for any future endpoint that streams audio
   *  directly (e.g. v3 or a future `Accept: audio/wav` mode). */
  private async callSarvam(
    apiKey: string,
    input: NormalizedTtsInput,
  ): Promise<{audioBase64: string; contentType: string}> {
    const body: Record<string, unknown> = {
      text: input.text,
      target_language_code: input.language,
      speaker: input.speaker,
      model: input.model,
      pace: input.pace,
      pitch: input.pitch,
      loudness: input.loudness,
      output_audio_codec: input.outputAudioCodec,
      speech_sample_rate: input.speechSampleRate,
    };

    const response = await fetch(SARVAM_TTS_URL, {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new InternalServerError(
        `Sarvam TTS ${response.status} ${response.statusText}: ${errText.slice(
          0,
          300,
        )}`,
      );
    }

    const rawContentType = response.headers.get('content-type') ?? '';
    const declaredType = rawContentType.split(';')[0].trim().toLowerCase();
    const codec = (input.outputAudioCodec || DEFAULT_CODEC).toLowerCase();
    const mimeFromCodec = CODEC_TO_MIME[codec] ?? `audio/${codec}`;

    // Primary path — Sarvam JSON envelope.
    if (
      declaredType.startsWith('application/json') ||
      declaredType.endsWith('+json')
    ) {
      const envelope = (await response.json()) as {
        audios?: string[];
        request_id?: string;
      };
      const firstAudio = envelope?.audios?.[0];
      if (!firstAudio) {
        throw new InternalServerError(
          `Sarvam returned JSON without an 'audios' array: ${JSON.stringify(
            envelope,
          ).slice(0, 200)}`,
        );
      }
      return {
        audioBase64: firstAudio,
        contentType: mimeFromCodec,
      };
    }

    // Fallback — raw audio bytes (defensive; not currently exercised by v2).
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new InternalServerError('Sarvam returned an empty audio body.');
    }
    return {
      audioBase64: buffer.toString('base64'),
      contentType: declaredType || mimeFromCodec,
    };
  }
}