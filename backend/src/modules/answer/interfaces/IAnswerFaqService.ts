/**
 * Interface defining Golden FAQ operations.
 */
export interface IAnswerFaqService {
  goldenFaq(
    userId: string,
    page: number,
    limit: number,
    search: string,
  ): Promise<{ faqs: any[]; totalFaqs: number }>;
}
