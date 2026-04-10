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

  @Get('/')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get full chatbot analytics dashboard data' })
  async getDashboard(
    @QueryParam('days') days = 30,
    @QueryParam('source') source: string = 'vicharanashala',
  ) {
    return this.chatbotService.getDashboard(days, source);
  }

  @Get('/kpi')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get KPI summary for today' })
  async getKpiSummary(@QueryParam('source') source: string = 'vicharanashala') {
    return this.chatbotService.getKpiSummary(source);
  }

  @Get('/dau')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get daily active users trend' })
  async getDailyActiveUsers(
    @QueryParam('days') days = 30,
    @QueryParam('source') source: string = 'vicharanashala',
  ) {
    return this.chatbotService.getDailyActiveUsers(days, source);
  }

  @Get('/channel-split')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get channel split percentages' })
  async getChannelSplit(@QueryParam('source') source: string = 'vicharanashala') {
    return this.chatbotService.getChannelSplit(source);
  }

  @Get('/voice-accuracy')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get voice accuracy by language' })
  async getVoiceAccuracy(@QueryParam('source') source: string = 'vicharanashala') {
    return this.chatbotService.getVoiceAccuracyByLanguage(source);
  }

  @Get('/geo')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get geographic distribution of sessions' })
  async getGeoDistribution(@QueryParam('source') source: string = 'vicharanashala') {
    return this.chatbotService.getGeoDistribution(source);
  }

  @Get('/query-categories')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get query category breakdown' })
  async getQueryCategories(@QueryParam('source') source: string = 'vicharanashala') {
    return this.chatbotService.getQueryCategories(source);
  }

  @Get('/user-trend')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get daily user activity trend for bar graph (last N days, daily granularity)' })
  async getDailyUserTrend(
    @QueryParam('days') days = 30,
    @QueryParam('source') source: string = 'vicharanashala',
  ) {
    return this.chatbotService.getDailyUserTrend(days, source);
  }

  @Get('/user-details')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get users with question counts, paginated, optionally filtered by date range and search' })
  async getUserDetails(
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string,
    @QueryParam('page') page = 1,
    @QueryParam('limit') limit = 10,
    @QueryParam('search') search: string = '',
    @QueryParam('source') source: string = 'vicharanashala',
  ) {
    return this.chatbotService.getUserDetails(startDate, endDate, Number(page), Number(limit), search, source);
  }
}
