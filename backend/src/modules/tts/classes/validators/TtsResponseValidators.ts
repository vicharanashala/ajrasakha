import {JSONSchema} from 'class-validator-jsonschema';
import {IsString, IsNotEmpty} from 'class-validator';

/**
 * Generic error response shape used across all TTS endpoints in the
 * `@ResponseSchema` decorators (mirrors the convention in
 * `core/classes/validators/NotificationResponseValidators.ts`).
 */
export class TtsErrorResponse {
  @JSONSchema({
    description: 'Human-readable error message.',
    example: 'text must be longer than 1 character',
    type: 'string',
  })
  @IsString()
  @IsNotEmpty()
  message!: string;

  @JSONSchema({
    description: 'Optional machine-readable error code.',
    example: 'TTS_UPSTREAM_ERROR',
    type: 'string',
  })
  @IsString()
  code?: string;
}
