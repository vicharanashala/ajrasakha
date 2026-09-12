import { injectable, inject } from 'inversify';
import { BadRequestError, InternalServerError } from 'routing-controllers';
import { appConfig } from '#root/config/app.js';
import { aiConfig } from '#root/config/ai.js';
import { BaseService } from '#shared/classes/BaseService.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';
import { SocksProxyAgent } from 'socks-proxy-agent';
import axios, { AxiosInstance } from 'axios';

const MAX_TOTAL_CHARS = 30000;

@injectable()
export class ContextService extends BaseService {
  private readonly httpAgent = new SocksProxyAgent('socks5://localhost:1055');
  private readonly translateApiUrl = aiConfig.accTranslateApiUrl || "http://100.100.108.44:8110/v1/translate/to-english";
  private readonly TIMEOUT = aiConfig.accAgentTimeout || 15000;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly database: MongoDatabase,
  ) {
    super(database);
  }

  private createAxiosInstance(): AxiosInstance {
    return axios.create({
      httpAgent: this.httpAgent,
      httpsAgent: this.httpAgent,
    });
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
    const cleanText = text?.trim();
    if (!cleanText) throw new BadRequestError('text is required');
    if (!targetLang) throw new BadRequestError('targetLang is required');
    if (cleanText.length > MAX_TOTAL_CHARS)
      throw new BadRequestError(`Text exceeds maximum allowed length of ${MAX_TOTAL_CHARS} characters`);

    // Instant bypass if already English / ASCII and translating to English
    const isTargetEnglish = targetLang === 'en-IN' || targetLang.startsWith('en');
    const isSourceEnglish = (sourceLang && sourceLang.startsWith('en')) || /^[\x00-\x7F]*$/.test(cleanText);
    if (isTargetEnglish && isSourceEnglish) {
      return { translated_text: cleanText };
    }

    // When translating to English, use Claude translation API on Annam servers
    if (isTargetEnglish) {
      try {
        const sourceLangCode = sourceLang && sourceLang !== 'unknown' ? sourceLang : 'auto';
        const api = this.createAxiosInstance();
        const response = await api.post(
          this.translateApiUrl,
          {
            text: cleanText,
            source_language: sourceLangCode,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: this.TIMEOUT,
          }
        );
        const translated = response.data?.translated_text?.trim();
        if (translated) {
          return { translated_text: translated };
        }
      } catch (claudeErr: any) {
        console.warn(`⚠️ [ContextService] Claude translate API warning (${claudeErr.message}). Falling back to Sarvam.`);
      }
    }

    // Fallback or non-English target: Sarvam translate
    const apiKey = appConfig.sarvamAPI;
    if (!apiKey) throw new BadRequestError('Sarvam API key not configured');

    const model = 'sarvam-translate:v1';
    const source_language_code = sourceLang ?? 'auto';
    const maxChars = 1900;
    const chunks = this._splitIntoChunks(cleanText, maxChars);
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
