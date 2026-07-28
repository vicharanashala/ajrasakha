import { AccAgentService, type GeneratedQuestion } from "./accAgentService";

export type { GeneratedQuestion };

export class QuestionService {
  private accAgentService = new AccAgentService();

  async generateQuestionsFromCallContext(
    query: string,
    state?: string,
    crop?: string,
    district?: string,
    domain?: string | string[],
    season?: string
  ): Promise<GeneratedQuestion[] | null> {
    return this.accAgentService.generateQuestionsFromCallContext(query, state, crop, district, domain, season);
  }
}
