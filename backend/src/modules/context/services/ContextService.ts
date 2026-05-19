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
    const apiKey = appConfig.sarvamAPI;
    if (!apiKey) throw new BadRequestError('Sarvam API key not configured');
    if (!text?.trim()) throw new BadRequestError('text is required');
    if (!targetLang) throw new BadRequestError('targetLang is required');

    // Languages exclusive to sarvam-translate:v1
    const SARVAM_ONLY_LANGS = new Set([
      'as-IN', 'brx-IN', 'doi-IN', 'kok-IN',
      'ks-IN', 'mai-IN', 'mni-IN', 'ne-IN',
      'sa-IN', 'sat-IN', 'sd-IN', 'ur-IN',
    ]);

    const useSarvamModel = SARVAM_ONLY_LANGS.has(targetLang);
    const model = useSarvamModel ? 'sarvam-translate:v1' : 'mayura:v1';
    const source_language_code = useSarvamModel ? (sourceLang ?? 'en-IN') : 'auto';

    const response = await fetch('https://api.sarvam.ai/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey,
      },
      body: JSON.stringify({
        input: text,
        source_language_code,
        target_language_code: targetLang,
        model,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => response.statusText);
      throw new InternalServerError(`Sarvam API error ${response.status}: ${body}`);
    }

    const data = await response.json() as { translated_text?: string };
    if (!data?.translated_text) {
      throw new InternalServerError('Sarvam API returned empty translation');
    }

    return { translated_text: data.translated_text };
  }
}
