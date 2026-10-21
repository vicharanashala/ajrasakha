import type { FetchAiInitialAnswerBody, PolishDraftBody } from '../classes/validators/AnswerValidator.js';

/**
 * Interface defining AI initial answer generation operations.
 */
export interface IAnswerAiService {
  fetchAiInitialAnswer(body: FetchAiInitialAnswerBody): Promise<any>;

  /**
   * Proxies to the standalone apis/writing_assistant service for language-
   * polishing suggestions and structural coverage checks against the Golden
   * Database. Never mutates the stored draft - only returns suggestions for
   * the author to accept or ignore. A failure here must never block the
   * existing draft-submission endpoints, which never call this method.
   */
  getWritingAssistantSuggestions(body: PolishDraftBody): Promise<any>;
}
