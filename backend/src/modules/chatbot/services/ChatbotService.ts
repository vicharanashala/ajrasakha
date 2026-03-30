import { injectable, inject } from 'inversify';
import { CHATBOT_TYPES } from '../types.js';
import type { IChatbotRepository } from '#root/shared/database/interfaces/IChatbotRepository.js';

@injectable()
export class ChatbotService {
  constructor(
    @inject(CHATBOT_TYPES.ChatbotRepository)
    private readonly chatbotRepository: IChatbotRepository,
  ) {}

  async getKpiSummary() {
    return this.chatbotRepository.getKpiSummary();
  }

  async getDailyActiveUsers(days = 30) {
    return this.chatbotRepository.getDailyActiveUsers(days);
  }

  async getChannelSplit() {
    return this.chatbotRepository.getChannelSplit();
  }

  async getVoiceAccuracyByLanguage() {
    return this.chatbotRepository.getVoiceAccuracyByLanguage();
  }

  async getGeoDistribution() {
    return this.chatbotRepository.getGeoDistribution();
  }

  async getQueryCategories() {
    return this.chatbotRepository.getQueryCategories();
  }

  /** Single call that returns everything the dashboard needs. */
  async getDashboard(days = 30) {
    const [kpi, dau, channelSplit, voiceAccuracy, geo, queryCategories] =
      await Promise.all([
        this.chatbotRepository.getKpiSummary(),
        this.chatbotRepository.getDailyActiveUsers(days),
        this.chatbotRepository.getChannelSplit(),
        this.chatbotRepository.getVoiceAccuracyByLanguage(),
        this.chatbotRepository.getGeoDistribution(),
        this.chatbotRepository.getQueryCategories(),
      ]);

    return { kpi, dau, channelSplit, voiceAccuracy, geo, queryCategories };
  }
}
