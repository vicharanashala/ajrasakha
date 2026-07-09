import { injectable, inject } from 'inversify';
import { ClientSession } from 'mongodb';
import { BadRequestError, InternalServerError } from 'routing-controllers';
import { appConfig } from '#root/config/app.js';
import { BaseService } from '#shared/classes/BaseService.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';

const MAX_TOTAL_CHARS = 30000;

@injectable()
export class ContextService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly database: MongoDatabase,
  ) {
    super(database);
  }

  async addContext(text: string): Promise<{ insertedId: string }> {
    try {
      if (!text || text.trim().length === 0) {
        throw new BadRequestError('Context text required');
      }
      const collection = await this.database.getCollection('contexts');
      const result = await collection.insertOne({
        text,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { insertedId: result.insertedId.toString() };
    } catch (error: any) {
      throw new InternalServerError(`Failed to add context: ${error.message || error}`);
    }
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

  async translate(
    text: string,
    targetLang: string,
    sourceLang?: string,
  ): Promise<{ translated_text: string }> {
    const apiKey = appConfig.sarvamAPI;
    if (!apiKey) throw new BadRequestError('Sarvam API key not configured');
    if (!text?.trim()) throw new BadRequestError('text is required');
    if (!targetLang) throw new BadRequestError('targetLang is required');
    if (text.length > MAX_TOTAL_CHARS)
      throw new BadRequestError(`Text exceeds maximum allowed length of ${MAX_TOTAL_CHARS} characters`);

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

    if (useSarvamModel && !sourceLang) {
      const enChunks = this._splitIntoChunks(text, 900);
      const enResults = await this._translateInBatches(enChunks, 'auto', 'en-IN', 'mayura:v1', apiKey);
      const enText = enResults.join(' ');
      if (targetLang === 'en-IN') return { translated_text: enText };
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

    const data = (await response.json()) as { translated_text?: string };
    if (!data?.translated_text) {
      throw new InternalServerError('Sarvam API returned empty translation');
    }

    return data.translated_text;
  }
}
