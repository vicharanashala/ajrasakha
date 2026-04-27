import 'reflect-metadata';
import {
  JsonController,
  Get,
  HttpCode,
  QueryParams,
  Authorized,
  ContentType,
  Res,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { CHATBOT_TYPES } from '../types.js';
import type { IChatbotService } from '../interfaces/IChatbotService.js';
import {
  DashboardQueryDto,
  SourceQueryDto,
  UserDetailsQueryDto,
} from '../classes/validators/ChatbotQueryValidators.js';
import {
  ChatbotErrorResponse,
  DashboardResponseSchema,
  KpiSummaryResponse,
  DailyActiveUsersEntryResponse,
  ChannelSplitEntryResponse,
  VoiceAccuracyEntryResponse,
  GeoStateEntryResponse,
  QueryCategoryEntryResponse,
  PaginatedUserDetailsResponse,
  TopCropsResponse,
} from '../classes/validators/ChatbotResponseValidators.js';

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

  @OpenAPI({ 
    summary: 'Get full chatbot analytics dashboard data',
    description: 'Retrieves comprehensive chatbot analytics data including KPIs, trends, and breakdowns for the specified time period and source.',
  })
  @ResponseSchema(DashboardResponseSchema, {
    statusCode: 200,
    description: 'Complete dashboard data with all analytics metrics',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch dashboard data',
  })
  @Get('/')
  @HttpCode(200)
  @Authorized()
  async getDashboard(@QueryParams() query: DashboardQueryDto) {
    return this.chatbotService.getDashboard(query.days, query.source);
  }

  @OpenAPI({ 
    summary: 'Get KPI summary for today',
    description: 'Retrieves key performance indicators including total users, daily queries, average session duration, and user growth metrics.',
  })
  @ResponseSchema(KpiSummaryResponse, {
    statusCode: 200,
    description: 'KPI summary metrics for the specified source',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch KPI summary',
  })
  @Get('/kpi')
  @HttpCode(200)
  @Authorized()
  async getKpiSummary(@QueryParams() query: SourceQueryDto) {
    return this.chatbotService.getKpiSummary(query.source);
  }

  @OpenAPI({ 
    summary: 'Get daily active users trend',
    description: 'Retrieves daily active user counts over the specified number of days, showing user engagement trends.',
  })
  @ResponseSchema(DailyActiveUsersEntryResponse, {
    statusCode: 200,
    isArray: true,
    description: 'Array of daily active user entries for the specified period',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch daily active users',
  })
  @Get('/dau')
  @HttpCode(200)
  @Authorized()
  async getDailyActiveUsers(@QueryParams() query: DashboardQueryDto) {
    return this.chatbotService.getDailyActiveUsers(query.days, query.source);
  }

  @OpenAPI({ 
    summary: 'Get channel split percentages',
    description: 'Retrieves the percentage breakdown of user sessions by channel (voice, text, kcc_agent, ivrs).',
  })
  @ResponseSchema(ChannelSplitEntryResponse, {
    statusCode: 200,
    isArray: true,
    description: 'Array of channel split entries with percentage distribution',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch channel split',
  })
  @Get('/channel-split')
  @HttpCode(200)
  @Authorized()
  async getChannelSplit(@QueryParams() query: SourceQueryDto) {
    return this.chatbotService.getChannelSplit(query.source);
  }

  @OpenAPI({ 
    summary: 'Get voice accuracy by language',
    description: 'Retrieves voice recognition accuracy percentages grouped by language code.',
  })
  @ResponseSchema(VoiceAccuracyEntryResponse, {
    statusCode: 200,
    isArray: true,
    description: 'Array of voice accuracy entries by language',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch voice accuracy',
  })
  @Get('/voice-accuracy')
  @HttpCode(200)
  @Authorized()
  async getVoiceAccuracy(@QueryParams() query: SourceQueryDto) {
    return this.chatbotService.getVoiceAccuracyByLanguage(query.source);
  }

  @OpenAPI({ 
    summary: 'Get geographic distribution of sessions',
    description: 'Retrieves session counts grouped by geographic state, sorted in descending order by count.',
  })
  @ResponseSchema(GeoStateEntryResponse, {
    statusCode: 200,
    isArray: true,
    description: 'Array of geographic distribution entries by state',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch geo distribution',
  })
  @Get('/geo')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get geographic distribution of sessions' })
  async getGeoDistribution(@QueryParams() query: SourceQueryDto) {
    return this.chatbotService.getGeoDistribution(query.source);
  }

  @OpenAPI({ 
    summary: 'Get query category breakdown',
    description: 'Retrieves the percentage breakdown of queries by category (e.g., Crop Disease, Weather, Market Prices), sorted in descending order.',
  })
  @ResponseSchema(QueryCategoryEntryResponse, {
    statusCode: 200,
    isArray: true,
    description: 'Array of query category entries with percentage breakdown',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch query categories',
  })
  @Get('/query-categories')
  @HttpCode(200)
  @Authorized()
  async getQueryCategories(@QueryParams() query: SourceQueryDto) {
    return this.chatbotService.getQueryCategories(query.source);
  }

  @OpenAPI({ 
    summary: 'Get top crops by questions',
    description: 'Retrieves top crops aggregated from questions and duplicate_questions, excluding agri_expert source.',
  })
  @ResponseSchema(TopCropsResponse, {
    statusCode: 200,
    description: 'Top crops data including overall active document count',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch top crops',
  })
  @Get('/top-crops')
  @HttpCode(200)
  @Authorized()
  async getTopCrops() {
    return this.chatbotService.getTopCrops();
  }

  @OpenAPI({ 
    summary: 'Get daily user activity trend for bar graph  (last N days, daily granularity)',
    description: 'Retrieves daily user activity counts (distinct users per day) over the last N days, suitable for bar graph visualization.',
  })
  @ResponseSchema(DailyActiveUsersEntryResponse, {
    statusCode: 200,
    isArray: true,
    description: 'Array of daily user activity entries for bar graph rendering',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch daily user trend',
  })
  @Get('/user-trend')
  @HttpCode(200)
  @Authorized()
  async getDailyUserTrend(@QueryParams() query: DashboardQueryDto) {
    return this.chatbotService.getDailyUserTrend(query.days, query.source);
  }

  @OpenAPI({ 
    summary: 'Get paginated user details with question counts',
    description: 'Retrieves a paginated list of users with their question counts, optionally filtered by date range and search query. Includes summary statistics.',
  })
  @ResponseSchema(PaginatedUserDetailsResponse, {
    statusCode: 200,
    description: 'Paginated user details with question counts and summary statistics',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch user details',
  })
  @Get('/user-details')
  @HttpCode(200)
  @Authorized()
  async getUserDetails(@QueryParams() query: UserDetailsQueryDto) {
    const inactiveOnly = query.inactiveOnly === 'true';
    return this.chatbotService.getUserDetails(
      query.startDate,
      query.endDate,
      query.page,
      query.limit,
      query.search,
      query.source,
      query.crop,
      query.village,
      query.profileCompleted,
      inactiveOnly,
    );
  }

  @Get('/download-chatbot-report')
  @Authorized()
  @ContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @OpenAPI({ summary: 'Download chatbot conversations as Excel (date range, max 1 month)' })
  async downloadChatbotReport(
    @QueryParams() query: { startDate?: string; endDate?: string; source?: string },
    @Res() response: any,
  ) {
    if (!query.startDate || !query.endDate) {
      response.status(400).json({ success: false, message: 'startDate and endDate are required' });
      return;
    }
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);
    const data = await this.chatbotService.generateChatbotExcelReport(startDate, endDate, query.source);
    if (!data) {
      response.status(200).json({ success: false, message: 'No data found for the selected date range' });
      return;
    }
    return Buffer.from(data as ArrayBuffer);
  }
}
