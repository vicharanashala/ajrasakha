import {Expose} from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';

/**
 * Languages supported by the Sarvam `bulbul` TTS models.
 * Keep this list in sync with https://docs.sarvam.ai/.
 */
export const TTS_SUPPORTED_LANGUAGES = [
  'en-IN', // English (India)
  'hi-IN', // Hindi
  'bn-IN', // Bengali
  'ta-IN', // Tamil
  'te-IN', // Telugu
  'gu-IN', // Gujarati
  'kn-IN', // Kannada
  'ml-IN', // Malayalam
  'mr-IN', // Marathi
  'od-IN', // Odia
  'pa-IN', // Punjabi
  'as-IN', // Assamese
  'ur-IN', // Urdu
] as const;

/**
 * Audio output codecs Sarvam supports. `wav` is the safest default —
 * universally decodable in `<audio>` elements without codec concerns.
 */
export const TTS_SUPPORTED_CODECS = [
  'wav',
  'mp3',
  'pcm',
  'mulaw',
  'alaw',
  'opus',
  'flac',
] as const;

export const TTS_SUPPORTED_MODELS = ['bulbul:v1', 'bulbul:v2'] as const;

/** Sarvam bulbul v2 default speaker for `en-IN`. */
export const TTS_DEFAULT_SPEAKER_EN = 'amelia';
/** Sarvam bulbul v2 default speaker for Indic languages. */
export const TTS_DEFAULT_SPEAKER_INDIC = 'anushka';

/** Body of `POST /api/tts`. */
export class TtsRequestBody {
  @JSONSchema({
    description: 'Text to synthesize. Max 2000 characters.',
    example: 'Namaste! Your crop is healthy.',
    type: 'string',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;

  @JSONSchema({
    description:
      'BCP-47 language code. Must be one of the supported languages.',
    example: 'hi-IN',
    type: 'string',
    enum: TTS_SUPPORTED_LANGUAGES as unknown as string[],
  })
  @IsString()
  @IsIn(TTS_SUPPORTED_LANGUAGES as unknown as string[])
  language!: string;

  @JSONSchema({
    description:
      'Voice id. Defaults to a sensible per-language choice when omitted.',
    example: 'anushka',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  speaker?: string;

  @JSONSchema({
    description:
      'Speaking pace multiplier (0.3 – 3.0). 1.0 is normal speed.',
    example: 1.0,
    type: 'number',
    minimum: 0.3,
    maximum: 3.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.3)
  @Max(3.0)
  pace?: number;

  @JSONSchema({
    description:
      'Pitch offset (-1.0 – 1.0). 0.0 is neutral. Sarvam accepts -1 to 1.',
    example: 0.0,
    type: 'number',
    minimum: -1.0,
    maximum: 1.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(-1.0)
  @Max(1.0)
  pitch?: number;

  @JSONSchema({
    description:
      'Loudness multiplier (0.1 – 2.0). 1.0 is neutral.',
    example: 1.0,
    type: 'number',
    minimum: 0.1,
    maximum: 2.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(2.0)
  loudness?: number;

  @JSONSchema({
    description: 'Sarvam TTS model id.',
    example: 'bulbul:v2',
    type: 'string',
    enum: TTS_SUPPORTED_MODELS as unknown as string[],
  })
  @IsOptional()
  @IsString()
  @IsIn(TTS_SUPPORTED_MODELS as unknown as string[])
  model?: string;

  @JSONSchema({
    description: 'Audio output codec.',
    example: 'wav',
    type: 'string',
    enum: TTS_SUPPORTED_CODECS as unknown as string[],
  })
  @IsOptional()
  @IsString()
  @IsIn(TTS_SUPPORTED_CODECS as unknown as string[])
  outputAudioCodec?: string;

  @JSONSchema({
    description: 'Audio sample rate in Hz.',
    example: 22050,
    type: 'number',
    enum: [8000, 16000, 22050, 24000, 48000],
  })
  @IsOptional()
  @IsNumber()
  @IsIn([8000, 16000, 22050, 24000, 48000])
  speechSampleRate?: number;
}

/** Response payload of `POST /api/tts`. */
export class TtsResponse {
  @JSONSchema({
    description:
      'Base64-encoded audio bytes. Decode into a Blob/ArrayBuffer client-side.',
    type: 'string',
  })
  @IsString()
  @Expose()
  audioBase64!: string;

  @JSONSchema({
    description: 'MIME type of the audio payload.',
    example: 'audio/wav',
    type: 'string',
  })
  @IsString()
  @Expose()
  contentType!: string;

  @JSONSchema({
    description: 'Decoded audio size in bytes.',
    example: 48044,
    type: 'integer',
  })
  @IsNumber()
  @Expose()
  byteSize!: number;

  @JSONSchema({
    description: 'True when this audio was served from the cache.',
    example: false,
    type: 'boolean',
  })
  @Expose()
  cached!: boolean;

  @JSONSchema({
    description:
      'Deterministic cache key derived from the request. Useful for client-side logging.',
    example: 'a3f1c…',
    type: 'string',
  })
  @IsString()
  @Expose()
  hash!: string;
}

export const TTS_VALIDATORS = [TtsRequestBody, TtsResponse];

export {
  TtsRequestBody as TtsRequestBodyClass,
  TtsResponse as TtsResponseClass,
};
