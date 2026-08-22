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

    const model = 'sarvam-translate:v1';
    const source_language_code = sourceLang ?? 'auto';
    const maxChars = 1900;
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
