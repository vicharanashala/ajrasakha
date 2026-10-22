import 'reflect-metadata';
import { injectable } from 'inversify';
import { InternalServerError } from 'routing-controllers';
import { aiConfig } from '#root/config/ai.js';
import { FetchAiInitialAnswerBody } from '../classes/validators/AnswerValidator.js';
import { IAnswerAiService } from '../interfaces/IAnswerAiService.js';

/**
 * Service responsible for AI initial answer generation.
 */
@injectable()
export class AnswerAiService implements IAnswerAiService {
  async fetchAiInitialAnswer(body: FetchAiInitialAnswerBody): Promise<any> {
    try {
      const response = await fetch(aiConfig.aiInitialAnswerGenerateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      let data: any;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = responseText;
      }

      if (!response.ok) {
        throw new InternalServerError(
          `AI answer service failed with status ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
        );
      }
      return data;
    } catch (error) {
      if (error instanceof InternalServerError) throw error;
      console.error('Error in fetchAiInitialAnswer:', error);
      throw new InternalServerError('Failed to fetch AI initial answer');
    }
  }
}
