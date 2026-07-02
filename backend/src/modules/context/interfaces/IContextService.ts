import { IContext } from '#root/shared/interfaces/models.js';

export interface IContextService {
  addContext(userId: string, text: string): Promise<{ insertedId: string }>;
  getById(contextId: string): Promise<IContext | null>;
  translate(text: string, targetLang: string, sourceLang?: string): Promise<{ translated_text: string }>;
  speechToText(file: Express.Multer.File, language: string): Promise<unknown>;
}
