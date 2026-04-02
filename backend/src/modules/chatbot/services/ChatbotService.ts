import { injectable, inject } from 'inversify';
import { InternalServerError } from 'routing-controllers';
import { CHATBOT_TYPES } from '../types.js';
import type { IChatbotService, DashboardResponse } from '../interfaces/IChatbotService.js';
import type { IChatbotRepository } from '#root/shared/database/interfaces/IChatbotRepository.js';

@injectable()
export class ChatbotService implements IChatbotService {
  constructor(
    @inject(CHATBOT_TYPES.ChatbotRepository)
    private readonly chatbotRepository: IChatbotRepository,
  ) {}

  async getDashboard(days = 30): Promise<DashboardResponse> {
    try {
      const [kpi, dau, channelSplit, voiceAccuracy, geo, queryCategories, weeklySessionDuration, dailyQueries, todayQueryCount] =
        await Promise.all([
          this.chatbotRepository.getKpiSummary(),
          this.chatbotRepository.getDailyActiveUsers(days),
          this.chatbotRepository.getChannelSplit(),
          this.chatbotRepository.getVoiceAccuracyByLanguage(),
          this.chatbotRepository.getGeoDistribution(),
          this.chatbotRepository.getQueryCategories(),
          this.chatbotRepository.getWeeklyAvgSessionDuration(Math.ceil(days / 7)),
          this.chatbotRepository.getDailyQueryCounts(days),
          this.chatbotRepository.getTodayQueryCount(),
        ]);

      return {
        kpi: { ...kpi, dailyQueries: todayQueryCount },
        dau,
        channelSplit,
        voiceAccuracy,
        geo,
        queryCategories,
        weeklySessionDuration,
        dailyQueries,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch dashboard data: ${error}`);
    }
  }

  async getKpiSummary() {
    try {
      return await this.chatbotRepository.getKpiSummary();
    } catch (error) {
      throw new InternalServerError(`Failed to fetch KPI summary: ${error}`);
    }
  }

  async getDailyActiveUsers(days = 30) {
    try {
      return await this.chatbotRepository.getDailyActiveUsers(days);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch daily active users: ${error}`);
    }
  }

  async getChannelSplit() {
    try {
      return await this.chatbotRepository.getChannelSplit();
    } catch (error) {
      throw new InternalServerError(`Failed to fetch channel split: ${error}`);
    }
  }

  async getVoiceAccuracyByLanguage() {
    try {
      return await this.chatbotRepository.getVoiceAccuracyByLanguage();
    } catch (error) {
      throw new InternalServerError(`Failed to fetch voice accuracy: ${error}`);
    }
  }

  async getGeoDistribution() {
    try {
      return await this.chatbotRepository.getGeoDistribution();
    } catch (error) {
      throw new InternalServerError(`Failed to fetch geo distribution: ${error}`);
    }
  }

  async getQueryCategories() {
    try {
      return await this.chatbotRepository.getQueryCategories();
    } catch (error) {
      throw new InternalServerError(`Failed to fetch query categories: ${error}`);
    }
  }

  async getWeeklyAvgSessionDuration(weeks = 52) {
    try {
      return await this.chatbotRepository.getWeeklyAvgSessionDuration(weeks);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch weekly session duration: ${error}`);
    }
  }

  async getDailyQueryCounts(days = 30) {
    try {
      return await this.chatbotRepository.getDailyQueryCounts(days);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch daily query counts: ${error}`);
    }
  }

  async getTodayQueryCount() {
    try {
      return await this.chatbotRepository.getTodayQueryCount();
    } catch (error) {
      throw new InternalServerError(`Failed to fetch today query count: ${error}`);
    }
  }

  async getDailyUserTrend(days = 30) {
    try {
      return await this.chatbotRepository.getDailyUserTrend(days);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch daily user trend: ${error}`);
    }
  }
}
