import 'reflect-metadata';
import {
  JsonController,
  Get,
  HttpCode,
  QueryParams,
  Authorized,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { CHATBOT_TYPES } from '../types.js';
import type { IChatbotService } from '../interfaces/IChatbotService.js';
import {
  DashboardQueryDto,
  SourceQueryDto,
  UserDetailsQueryDto,
} from '../classes/validators/ChatbotQueryValidators.js';

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
  async getDashboard(@QueryParams() query: DashboardQueryDto) {
    return this.chatbotService.getDashboard(query.days, query.source);
  }

  @Get('/kpi')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get KPI summary for today' })
  async getKpiSummary(@QueryParams() query: SourceQueryDto) {
    return this.chatbotService.getKpiSummary(query.source);
  }

  @Get('/dau')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get daily active users trend' })
  async getDailyActiveUsers(@QueryParams() query: DashboardQueryDto) {
    return this.chatbotService.getDailyActiveUsers(query.days, query.source);
  }

  @Get('/channel-split')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get channel split percentages' })
  async getChannelSplit(@QueryParams() query: SourceQueryDto) {
    return this.chatbotService.getChannelSplit(query.source);
  }

  @Get('/voice-accuracy')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get voice accuracy by language' })
  async getVoiceAccuracy(@QueryParams() query: SourceQueryDto) {
    return this.chatbotService.getVoiceAccuracyByLanguage(query.source);
  }

  @Get('/geo')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get geographic distribution of sessions' })
  async getGeoDistribution(@QueryParams() query: SourceQueryDto) {
    return this.chatbotService.getGeoDistribution(query.source);
  }

  @Get('/query-categories')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get query category breakdown' })
  async getQueryCategories(@QueryParams() query: SourceQueryDto) {
    return this.chatbotService.getQueryCategories(query.source);
  }

  @Get('/user-trend')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get daily user activity trend for bar graph (last N days, daily granularity)' })
  async getDailyUserTrend(@QueryParams() query: DashboardQueryDto) {
    return this.chatbotService.getDailyUserTrend(query.days, query.source);
  }

  @Get('/user-details')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get users with question counts, paginated, optionally filtered by date range and search' })
  async getUserDetails(@QueryParams() query: UserDetailsQueryDto) {
    return this.chatbotService.getUserDetails(
      query.startDate,
      query.endDate,
      query.page,
      query.limit,
      query.search,
      query.source,
    );
  }
}
