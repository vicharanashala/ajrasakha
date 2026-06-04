import {IContextRepository} from '#root/shared/database/interfaces/IContextRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession} from 'mongodb';
import {IContext} from '#root/shared/interfaces/models.js';
import {InternalServerError, BadRequestError} from 'routing-controllers';
import { QuestionService } from '#root/modules/question/services/QuestionService.js';
import { IContextService } from '../interfaces/IContextService.js';
import { appConfig } from '#root/config/app.js';

@injectable()
export class ContextService extends BaseService implements IContextService {
  constructor(
    @inject(GLOBAL_TYPES.ContextRepository)
    private readonly contextRepo: IContextRepository,
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: QuestionService,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async addContext(
    userId: string,
    text: string,
  ): Promise<{insertedId: string}> {
    try {
      if (!text || text.trim().length === 0) {
        throw new BadRequestError('Context text required');
      }

      return this._withTransaction(async (session: ClientSession) => {
        const result = await this.contextRepo.addContext(text, session);

        const contextId = result.insertedId;

        // await this.questionService.addDummyQuestions(
        //   userId,
        //   contextId,
        //   dummyQuestions,
        //   session,
        // );

        return result;
      });
    } catch (error) {
      throw new InternalServerError(`Failed to add context: ${error}`);
    }
  }

  async getById(contextId: string): Promise<IContext | null> {
    try {
      if (!contextId) {
        throw new BadRequestError('ContextId is required');
      }

      return this._withTransaction(async (session: ClientSession) => {
        const context = await this.contextRepo.getById(contextId, session);
        if (!context) {
          throw new BadRequestError(`Context with ID ${contextId} not found`);
        }
        return context;
      });
    } catch (error) {
      throw new InternalServerError(`Failed to get context: ${error}`);
    }
  }

  async translate(
    text: string,
    targetLang: string,
    sourceLang?: string,
  ): Promise<{ translated_text: string }> {
    const MAX_TOTAL_CHARS = 30_000;

    const apiKey = appConfig.sarvamAPI;
    if (!apiKey) throw new BadRequestError('Sarvam API key not configured');
    if (!text?.trim()) throw new BadRequestError('text is required');
    if (!targetLang) throw new BadRequestError('targetLang is required');
    if (text.length > MAX_TOTAL_CHARS)
      throw new BadRequestError(`Text exceeds maximum allowed length of ${MAX_TOTAL_CHARS} characters`);

    // Languages exclusive to sarvam-translate:v1 (supports 22 languages)
    // mayura:v1 supports only 11 languages but auto-detects source language
    const SARVAM_ONLY_LANGS = new Set([
      'en-IN', 'hi-IN', 'bn-IN',
      'gu-IN', 'kn-IN', 'ml-IN',
      'mr-IN', 'od-IN', 'pa-IN',
      'ta-IN', 'te-IN', 'as-IN',
      'doi-IN', 'kok-IN', 'ks-IN',
      'mai-IN', 'mni-IN', 'ne-IN',
      'sa-IN', 'sat-IN', 'sd-IN',
      'ur-IN', 'brx-IN',
    ]);

    const useSarvamModel = SARVAM_ONLY_LANGS.has(targetLang);
    const model = useSarvamModel ? 'sarvam-translate:v1' : 'mayura:v1';
    // API character limits: mayura:v1 = 1000, sarvam-translate:v1 = 2000

    // sarvam-translate:v1 requires an explicit source language (no 'auto').
    // When sourceLang is unknown, go via English:
    //   Step 1 — mayura:v1 auto-detects source → English
    //   Step 2 — sarvam-translate:v1 English → target
    if (useSarvamModel && !sourceLang) {
      const enChunks = this._splitIntoChunks(text, 900);
      const enResults = await this._translateInBatches(enChunks, 'auto', 'en-IN', 'mayura:v1', apiKey);
      const enText = enResults.join(' ');
      if(targetLang === 'en-IN') return { translated_text: enText };
      const targetChunks = this._splitIntoChunks(enText, 1900);
      const targetResults = await this._translateInBatches(targetChunks, 'en-IN', targetLang, model, apiKey);
      return { translated_text: targetResults.join(' ') };
    }

    const source_language_code = sourceLang ?? 'auto';
    const maxChars = useSarvamModel ? 1900 : 900;
    const chunks = this._splitIntoChunks(text, maxChars);
    const translatedChunks = await this._translateInBatches(chunks, source_language_code, targetLang, model, apiKey);
    return { translated_text: translatedChunks.join(' ') };
  }

  private async _translateInBatches(
    chunks: string[],
    source_language_code: string,
    targetLang: string,
    model: string,
    apiKey: string,
    batchSize = 3,
  ): Promise<string[]> {
    const results: string[] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(chunk =>
          this._callSarvamTranslate(chunk, source_language_code, targetLang, model, apiKey),
        ),
      );
      results.push(...batchResults);
    }

    return results;
  }

  private _splitIntoChunks(text: string, maxChars: number): string[] {
    if (text.length <= maxChars) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxChars) {
      let splitAt = remaining.lastIndexOf('\n', maxChars);
      if (splitAt < maxChars / 2) splitAt = remaining.lastIndexOf('. ', maxChars);
      if (splitAt < maxChars / 2) splitAt = maxChars;

      chunks.push(remaining.slice(0, splitAt + 1));
      remaining = remaining.slice(splitAt + 1);
    }

    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
  }

  async speechToText(
    file: Express.Multer.File,
    language: string,
  ): Promise<unknown> {
    const apiKey = appConfig.sarvamAPI;
    if (!apiKey) throw new BadRequestError('Sarvam API key not configured');

    const formData = new FormData();
    formData.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'recording.webm');
    formData.append('language', language);

    const response = await fetch('https://api.sarvam.ai/speech-to-text-translate', {
      method: 'POST',
      headers: { 'api-subscription-key': apiKey },
      body: formData,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => response.statusText);
      throw new InternalServerError(`Sarvam STT error ${response.status}: ${body}`);
    }

    return response.json();
  }

  private async _callSarvamTranslate(
    input: string,
    source_language_code: string,
    target_language_code: string,
    model: string,
    apiKey: string,
  ): Promise<string> {
    const response = await fetch('https://api.sarvam.ai/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey,
      },
      body: JSON.stringify({ input, source_language_code, target_language_code, model }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => response.statusText);
      throw new InternalServerError(`Sarvam API error ${response.status}: ${body}`);
    }

    const data = await response.json() as { translated_text?: string };
    if (!data?.translated_text) {
      throw new InternalServerError('Sarvam API returned empty translation');
    }

    return data.translated_text;
  }
}
