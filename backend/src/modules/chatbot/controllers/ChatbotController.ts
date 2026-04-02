import 'reflect-metadata';
import {
  JsonController,
  Get,
  HttpCode,
  QueryParam,
  Authorized,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { CHATBOT_TYPES } from '../types.js';
import type { IChatbotService } from '../interfaces/IChatbotService.js';

@OpenAPI({
  tags: ['analytics'],
  description: 'Chatbot analytics endpoints',
})
@injectable()
@JsonController('/analytics', { transformResponse: false })
export class ChatbotController {
  constructor(
    @inject(CHATBOT_TYPES.ChatbotService)
    private readonly chatbotService: IChatbotService,
  ) {}

  @Get('/dashboard')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get full chatbot analytics dashboard data' })
  async getDashboard(@QueryParam('days') days = 30) {
    return this.chatbotService.getDashboard(days);
  }

  @Get('/kpi')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get KPI summary for today' })
  async getKpiSummary() {
    return this.chatbotService.getKpiSummary();
  }

  @Get('/dau')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get daily active users trend' })
  async getDailyActiveUsers(@QueryParam('days') days = 30) {
    return this.chatbotService.getDailyActiveUsers(days);
  }

  @Get('/channel-split')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get channel split percentages' })
  async getChannelSplit() {
    return this.chatbotService.getChannelSplit();
  }

  @Get('/voice-accuracy')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get voice accuracy by language' })
  async getVoiceAccuracy() {
    return this.chatbotService.getVoiceAccuracyByLanguage();
  }

  @Get('/geo')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get geographic distribution of sessions' })
  async getGeoDistribution() {
    return this.chatbotService.getGeoDistribution();
  }

  @Get('/query-categories')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get query category breakdown' })
  async getQueryCategories() {
    return this.chatbotService.getQueryCategories();
  }

  @Get('/user-trend')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get daily user activity trend for bar graph (last N days, daily granularity)' })
  async getDailyUserTrend(@QueryParam('days') days = 30) {
    return this.chatbotService.getDailyUserTrend(days);
  }
}
