import type { FetchAiInitialAnswerBody } from '../classes/validators/AnswerValidator.js';

/**
 * Interface defining AI initial answer generation operations.
 */
export interface IAnswerAiService {
  fetchAiInitialAnswer(body: FetchAiInitialAnswerBody): Promise<any>;
}
