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

  private _resolveSourceLanguage(text: string, sourceLang?: string): string {
    if (sourceLang && sourceLang !== 'auto' && sourceLang !== 'unknown') {
      return sourceLang;
    }

    // Check for Indian / Perso-Arabic scripts
    if (/[\u0900-\u097F]/.test(text)) return 'hi-IN'; // Devanagari (Hindi, Marathi, Sanskrit, etc.)
    if (/[\u0980-\u09FF]/.test(text)) return 'bn-IN'; // Bengali / Assamese
    if (/[\u0A00-\u0A7F]/.test(text)) return 'pa-IN'; // Gurmukhi (Punjabi)
    if (/[\u0A80-\u0AFF]/.test(text)) return 'gu-IN'; // Gujarati
    if (/[\u0B00-\u0B7F]/.test(text)) return 'od-IN'; // Odia
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta-IN'; // Tamil
    if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN'; // Telugu
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kn-IN'; // Kannada
    if (/[\u0D00-\u0D7F]/.test(text)) return 'ml-IN'; // Malayalam
    if (/[\u0600-\u06FF]/.test(text)) return 'ur-IN'; // Perso-Arabic (Urdu, Kashmiri, Sindhi)

    // If text has NO Indic/Arabic scripts, treat as English
    if (!/[\u0900-\u0D7F\u0600-\u06FF]/.test(text)) {
      return 'en-IN';
    }

    return 'auto';
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

    // Resolve source language code
    const resolvedSourceLang = this._resolveSourceLanguage(cleanText, sourceLang);

    // Instant bypass if source and target are the same language
    if (resolvedSourceLang === targetLang) {
      return { translated_text: cleanText };
    }

    const isTargetEnglish = targetLang === 'en-IN' || targetLang.startsWith('en');
    const isSourceEnglish = resolvedSourceLang === 'en-IN' || resolvedSourceLang.startsWith('en');
    if (isTargetEnglish && isSourceEnglish) {
      return { translated_text: cleanText };
    }

    // When translating to English, use Claude translation API on Annam servers
    if (isTargetEnglish) {
      try {
        const sourceLangCode = resolvedSourceLang !== 'auto' ? resolvedSourceLang : 'auto';
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

    const MAYURA_LANGUAGES = new Set([
      'en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'kn-IN',
      'ml-IN', 'mr-IN', 'od-IN', 'pa-IN', 'ta-IN', 'te-IN',
    ]);

    // sarvam-translate:v1 strictly forbids 'auto' as source_language_code.
    // If source language could not be resolved (remains 'auto'):
    if (resolvedSourceLang === 'auto') {
      if (MAYURA_LANGUAGES.has(targetLang)) {
        // mayura:v1 supports 'auto' for 11 major languages (max 900 chars per chunk)
        const chunks = this._splitIntoChunks(cleanText, 900);
        const translatedChunks = await this._translateInBatches(chunks, 'auto', targetLang, 'mayura:v1', apiKey);
        return { translated_text: translatedChunks.join(' ') };
      } else {
        // Two-step: auto -> en-IN via mayura:v1, then en-IN -> targetLang via sarvam-translate:v1
        const enChunks = this._splitIntoChunks(cleanText, 900);
        const enResults = await this._translateInBatches(enChunks, 'auto', 'en-IN', 'mayura:v1', apiKey);
        const enText = enResults.join(' ');
        if (targetLang === 'en-IN') return { translated_text: enText };
        const targetChunks = this._splitIntoChunks(enText, 1900);
        const targetResults = await this._translateInBatches(targetChunks, 'en-IN', targetLang, 'sarvam-translate:v1', apiKey);
        return { translated_text: targetResults.join(' ') };
      }
    }

    // When source language is known (e.g. en-IN, hi-IN, bn-IN):
    const model = 'sarvam-translate:v1';
    const maxChars = 1900;
    const chunks = this._splitIntoChunks(cleanText, maxChars);
    const translatedChunks = await this._translateInBatches(chunks, resolvedSourceLang, targetLang, model, apiKey);
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
