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

  async getDashboard(days = 30, source = 'vicharanashala'): Promise<DashboardResponse> {
    try {
      const [kpi, dau, channelSplit, voiceAccuracy, geo, queryCategories, dailyQueries, todayQueryCount, weeklyQueries, avgSessionDurationMin, weeklySessionDuration] =
        await Promise.all([
          this.chatbotRepository.getKpiSummary(source),
          this.chatbotRepository.getDailyActiveUsers(days, source),
          this.chatbotRepository.getChannelSplit(source),
          this.chatbotRepository.getVoiceAccuracyByLanguage(source),
          this.chatbotRepository.getGeoDistribution(source),
          this.chatbotRepository.getQueryCategories(source),
          this.chatbotRepository.getDailyQueryCounts(days, source),
          this.chatbotRepository.getTodayQueryCount(source),
          this.chatbotRepository.getWeeklyQueryCounts(source),
          // V2: inactivity-gap based session duration replaces the old value from getKpiSummary
          this.chatbotRepository.getAvgSessionDurationV2(source),
          // V2: inactivity-gap based weekly breakdown replaces the old getWeeklyAvgSessionDuration
          this.chatbotRepository.getWeeklyAvgSessionDurationV2(Math.ceil(days / 7), source),
        ]);

      return {
        // Override avgSessionDurationMin in the KPI with the V2 value
        kpi: { ...kpi, dailyQueries: todayQueryCount, avgSessionDurationMin },
        dau,
        channelSplit,
        voiceAccuracy,
        geo,
        queryCategories,
        weeklySessionDuration,
        dailyQueries,
        weeklyQueries,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch dashboard data: ${error}`);
    }
  }

  async getKpiSummary(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getKpiSummary(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch KPI summary: ${error}`);
    }
  }

  async getDailyActiveUsers(days = 30, source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getDailyActiveUsers(days, source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch daily active users: ${error}`);
    }
  }

  async getChannelSplit(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getChannelSplit(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch channel split: ${error}`);
    }
  }

  async getVoiceAccuracyByLanguage(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getVoiceAccuracyByLanguage(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch voice accuracy: ${error}`);
    }
  }

  async getGeoDistribution(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getGeoDistribution(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch geo distribution: ${error}`);
    }
  }

  async getQueryCategories(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getQueryCategories(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch query categories: ${error}`);
    }
  }

  async getWeeklyAvgSessionDuration(weeks = 52, source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getWeeklyAvgSessionDuration(weeks, source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch weekly session duration: ${error}`);
    }
  }

  async getDailyQueryCounts(days = 30, source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getDailyQueryCounts(days, source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch daily query counts: ${error}`);
    }
  }

  async getTodayQueryCount(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getTodayQueryCount(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch today query count: ${error}`);
    }
  }

  async getDailyUserTrend(days = 30, source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getDailyUserTrend(days, source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch daily user trend: ${error}`);
    }
  }

  async getWeeklyQueryCounts(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getWeeklyQueryCounts(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch weekly query counts: ${error}`);
    }
  }

  async getUserDetails(startDate?: string, endDate?: string, page = 1, limit = 10, search = '', source = 'vicharanashala', crop = '', village = '', profileCompleted = 'all') {
    try {
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;
      return await this.chatbotRepository.getUserDetails(start, end, page, limit, search, source, crop, village, profileCompleted);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch user details: ${error}`);
    }
  }

  async getAvgSessionDurationV2(source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getAvgSessionDurationV2(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch avg session duration v2: ${error}`);
    }
  }

  async getWeeklyAvgSessionDurationV2(weeks = 52, source = 'vicharanashala') {
    try {
      return await this.chatbotRepository.getWeeklyAvgSessionDurationV2(weeks, source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch weekly avg session duration v2: ${error}`);
    }
  }
}
