import 'reflect-metadata';
import {
  JsonController,
  Post,
  Body,
  HttpCode,
  Authorized,
  CurrentUser,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject} from 'inversify';
import {TTS_TYPES} from '../types.js';
import {ITtsService} from '../interfaces/ITtsService.js';
import {IUser} from '#root/shared/interfaces/models.js';
import {
  TtsRequestBody,
  TtsResponse,
} from '../classes/validators/TtsValidators.js';
import {TtsErrorResponse} from '../classes/validators/TtsResponseValidators.js';

@OpenAPI({
  tags: ['TTS'],
  description:
    'Server-side text-to-speech proxy. Backed by Sarvam and a Mongo audio cache so re-listens are free.',
})
@JsonController('/tts')
export class TtsController {
  constructor(
    @inject(TTS_TYPES.TtsService)
    private readonly ttsService: ITtsService,
  ) {}

  @OpenAPI({
    summary: 'Synthesize speech from text',
    description:
      'Returns base64-encoded audio for the given text. Identical requests (same text, language, voice, settings) are served from a Mongo-backed cache and returned instantly.',
  })
  @ResponseSchema(TtsResponse, {
    statusCode: 200,
    description: 'Audio payload successfully synthesized or retrieved from cache.',
  })
  @ResponseSchema(TtsErrorResponse, {
    statusCode: 400,
    description: 'Bad request — invalid or missing fields.',
  })
  @ResponseSchema(TtsErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized — Firebase ID token missing or expired.',
  })
  @ResponseSchema(TtsErrorResponse, {
    statusCode: 502,
    description:
      'Bad gateway — upstream Sarvam TTS call failed. See server logs for details.',
  })
  @ResponseSchema(TtsErrorResponse, {
    statusCode: 503,
    description:
      'Service unavailable — SARVAM_API_KEY is not configured on the server.',
  })
  @Post('/')
  @HttpCode(200)
  @Authorized()
  async synthesize(
    @Body() body: TtsRequestBody,
    @CurrentUser() user: IUser,
  ): Promise<TtsResponse> {
    const result = await this.ttsService.synthesize({
      text: body.text,
      language: body.language,
      speaker: body.speaker,
      pace: body.pace,
      pitch: body.pitch,
      loudness: body.loudness,
      model: body.model,
      outputAudioCodec: body.outputAudioCodec,
      speechSampleRate: body.speechSampleRate,
      requestedBy: user?._id?.toString(),
    });
    return {
      audioBase64: result.audioBase64,
      contentType: result.contentType,
      byteSize: result.byteSize,
      cached: result.cached,
      hash: result.hash,
    };
  }
}
