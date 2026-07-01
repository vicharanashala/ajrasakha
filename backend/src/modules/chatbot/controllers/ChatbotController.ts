import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  HttpCode,
  QueryParams,
  Authorized,
  ContentType,
  Res,
  QueryParam,
  Delete,
  Param,
  Patch,
  Body,
  BadRequestError,
  CurrentUser,
  ForbiddenError,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {CHATBOT_TYPES} from '../types.js';
import type {IChatbotService} from '../interfaces/IChatbotService.js';
import {IUser} from '#root/shared/interfaces/models.js';
import {
  AuditAction,
  AuditCategory,
  ModeratorAuditTrail,
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {AUDIT_TRAILS_TYPES} from '#root/modules/auditTrails/types.js';
import {IAuditTrailsService} from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import {
  DashboardQueryDto,
  QueryAnalyticsQueryDto,
  QueryCategoryQuestionsQueryDto,
  SourceQueryDto,
  UserDetailsQueryDto,
  WeatherConcernAnalyticsQueryDto,
  WeatherConcernQueriesQueryDto,
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
  DistrictAnalyticsEntryResponse,
} from '../classes/validators/ChatbotResponseValidators.js';
import {
  ActiveUsersQuery,
  GrowthQuery,
  GrowthResponse,
  RetentionMetricsQuery,
  TopFaqsQuery,
  userProfileQuery,
} from '../types/chatbot.type.js';
import {IActiveUser} from '#root/shared/database/providers/mongo/repositories/ChatbotRepository.js';
import {
  FeedbackData,
  KccAndAgriAppStats,
  PlatformInstallEntry,
  QueryCategoryQuestionType,
  ResponseAdherenceTable,
  UserDemographics,
} from '#root/shared/database/interfaces/IChatbotRepository.js';
import {COORDINATOR_ROLES} from '#root/shared/constants/roles.js';

@OpenAPI({
  tags: ['analytics'],
  description: 'Chatbot analytics endpoints',
})
@injectable()
@JsonController('/analytics', {transformResponse: false})
export class ChatbotController {
  constructor(
    @inject(CHATBOT_TYPES.ChatbotService)
    private readonly chatbotService: IChatbotService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  private assertStrongPassword(password?: string) {
    if (!password || !password.trim()) {
      throw new BadRequestError('Password is required');
    }
    if (password.length < 8) {
      throw new BadRequestError('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      throw new BadRequestError(
        'Password must contain at least one uppercase letter',
      );
    }
    if (!/[a-z]/.test(password)) {
      throw new BadRequestError(
        'Password must contain at least one lowercase letter',
      );
    }
    if (!/[0-9]/.test(password)) {
      throw new BadRequestError('Password must contain at least one number');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      throw new BadRequestError(
        'Password must contain at least one special character',
      );
    }
  }

  @OpenAPI({
    summary: 'Get full chatbot analytics dashboard data',
    description:
      'Retrieves comprehensive chatbot analytics data including KPIs, trends, and breakdowns for the specified time period and source.',
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
    return this.chatbotService.getDashboard(
      query.days,
      query.source,
      query.userType,
      query.startTime,
      query.endTime,
    );
  }

  @OpenAPI({
    summary: 'Get paginated total query analytics',
    description:
      'Returns filtered daily, weekly, or monthly total query analytics for the dashboard modal.',
  })
  @Get('/query-analytics')
  @HttpCode(200)
  @Authorized()
  async getQueryAnalytics(@QueryParams() query: QueryAnalyticsQueryDto) {
    return this.chatbotService.getQueryAnalytics(query.period, {
      month: query.month,
      year: query.year,
      page: query.page,
      limit: query.limit,
      source: query.source,
      userType: query.userType,
    });
  }

  @OpenAPI({
    summary: 'Get district-wise analytics for a state',
    description:
      'Retrieves district-level question analytics including total, unique, and duplicate questions for the selected state.',
  })
  @ResponseSchema(DistrictAnalyticsEntryResponse, {
    statusCode: 200,
    description: 'District-wise analytics data retrieved successfully',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch district analytics',
  })
  @Get('/state-wise-analytics')
  @HttpCode(200)
  @Authorized()
  async getDistrictAnalyticsByState(
    @QueryParam('state') state: string,

    @QueryParam('selectedStateCode') selectedStateCode: string,

    @QueryParam('source')
    source: string,

    @QueryParam('userType')
    userType: string = 'all',
  ) {
    // console.log("Selected state code controller", selectedStateCode);
    return this.chatbotService.getDistrictAnalyticsByState(
      state,
      selectedStateCode,
      source,
      userType,
    );
  }

  @OpenAPI({
    summary: 'Get KPI summary for today',
    description:
      'Retrieves key performance indicators including total users, daily queries, average session duration, and user growth metrics.',
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
    return this.chatbotService.getKpiSummary(query.source, query.userType);
  }

  @OpenAPI({
    summary: 'Get daily active users trend',
    description:
      'Retrieves daily active user counts over the specified number of days, showing user engagement trends.',
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
    return this.chatbotService.getDailyActiveUsers(
      query.days,
      query.source,
      query.userType,
    );
  }

  @OpenAPI({
    summary: 'Get channel split percentages',
    description:
      'Retrieves the percentage breakdown of user sessions by channel (voice, text, kcc_agent, ivrs).',
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
    description:
      'Retrieves voice recognition accuracy percentages grouped by language code.',
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
    description:
      'Retrieves session counts grouped by geographic state, sorted in descending order by count.',
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
  @OpenAPI({summary: 'Get geographic distribution of sessions'})
  async getGeoDistribution(@QueryParams() query: SourceQueryDto) {
    return this.chatbotService.getGeoDistribution(query.source);
  }

  @OpenAPI({
    summary: 'Get query category breakdown',
    description:
      'Retrieves the percentage breakdown of queries by category (e.g., Crop Disease, Weather, Market Prices), sorted in descending order.',
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
    return this.chatbotService.getQueryCategories(query.source, query.userType);
  }

  // @OpenAPI({
  //   summary: 'Get paginated questions for a query category',
  //   description:
  //     'Lists questions for a selected dashboard query category, with server-side pagination and all/unique/duplicate filtering.',
  // })
  // @Get('/query-category-questions')
  // @HttpCode(200)
  // @Authorized()
  // async getQueryCategoryQuestions(
  //   @QueryParams() query: QueryCategoryQuestionsQueryDto,
  // ) {
  //   return this.chatbotService.getQueryCategoryQuestions(
  //     query.category,
  //     query.questionType,
  //     query.page,
  //     query.limit,
  //     query.source,
  //     query.userType,
  //   );
  // }

  // @Get('/district-questions')
  // @HttpCode(200)
  // @Authorized()
  // async getQuestionFromDistrict(
  //   @QueryParams()
  //   query: {
  //     district: string;
  //     questionType?: QueryCategoryQuestionType;
  //     page?: number;
  //     limit?: number;
  //     source?: string;
  //     userType?: string;
  //   },
  // ) {
  //   return this.chatbotService.getQuestionFromDistrict(
  //     query.district,
  //     query.questionType,
  //     query.page,
  //     query.limit,
  //     query.source,
  //     query.userType,
  //   );
  // }

  @OpenAPI({
    summary: 'Get the paginated queries from the selected filter',
    description:
      'Retrieves paginated questions based on the selected filter - either by query category or by district. Supports filtering by question type (all, unique, duplicate) and pagination parameters.',
  })
  @Get('/filtered-questions')
  @HttpCode(200)
  @Authorized()
  async getQuestionByFilters(
    @QueryParams()
    query: {
      category?: string;
      district?: string;
      state?: string;
      crop?: string;
      crops?: string;
      status?: string;
      closedWithInTwohours?: boolean;
      notificationType?: string;
      period?: string
      questionType?: QueryCategoryQuestionType;
      page?: number;
      limit?: number;
      source?: string;
      userType?: string;
      search?: string;
      startDate?: Date;
      endDate?: Date;
      isPassed?: string;
    },
  ) {
    if (query.category) {
      return this.chatbotService.getQueryCategoryQuestions(
        query.category,
        query.questionType,
        query.page,
        query.limit,
        query.source,
        query.userType,
        query.search,
      );
    } else if (query.state && !query.district) {
      return this.chatbotService.getQuestionFromState(
        query.state,
        query.questionType,
        query.page,
        query.limit,
        query.source,
        query.userType,
        query.search,
      );
    }
    else if (query.district) {
      return this.chatbotService.getQuestionFromDistrict(
        query.district,
        query.state,
        query.questionType,
        query.page,
        query.limit,
        query.source,
        query.userType,
        query.search,
      );
    } else if (query.crop) {
      return this.chatbotService.getQuestionsByCrop(
        query.crop,
        query.crops?.split(','),
        query.questionType,
        query.page,
        query.limit,
        query.source,
        query.userType,
        query.search,
      );
    } else if (query.status) {
      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);
      return this.chatbotService.getQuestionsByStatus(
        query.status,
        query.page,
        query.limit,
        query.source,
        query.userType,
        query.search,
        startDate,
        endDate,
      );
    } else if (query.closedWithInTwohours) {
      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);
      return this.chatbotService.getQuestionsClosedWithinTwoHours(
        query.page,
        query.limit,
        query.source,
        query.userType,
        query.search,
        startDate,
        endDate,
        query.isPassed,
      );
    } else {
      if(query.period){
        return this.chatbotService.getQueriesByPeriod(
        query.period,
        query.page,
        query.limit,
        query.source,
        query.userType,
        query.search,
        )
      }
      
      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);
      return this.chatbotService.getQuestionsByNotificationStatus(
        query.notificationType,
        query.page,
        query.limit,
        query.source,
        query.userType,
        query.search,
        startDate,
        endDate,
      );
    }
  }

  @OpenAPI({
    summary: 'Get weather concern analytics',
    description:
      'Returns weather concern percentages from weather tool messages filtered by season and farmer location.',
  })
  @Get('/weather-concerns')
  @HttpCode(200)
  @Authorized()
  async getWeatherConcernAnalytics(
    @QueryParams() query: WeatherConcernAnalyticsQueryDto,
  ) {
    return this.chatbotService.getWeatherConcernAnalytics(
      {
        season: query.season,
        state: query.state,
        district: query.district,
        block: query.block,
        village: query.village,
        startDate: query.startDate,
        endDate: query.endDate,
      },
      query.source,
      query.userType,
    );
  }

  @OpenAPI({
    summary: 'Get paginated queries for a specific weather concern',
    description:
      'Returns paginated weather queries that fall under a specific weather concern, filtered by season and farmer location.',
  })
  @Get('/weather-concern-queries')
  @HttpCode(200)
  @Authorized()
  async getWeatherConcernQueries(
    @QueryParams() query: WeatherConcernQueriesQueryDto,
  ) {
    return this.chatbotService.getWeatherConcernQueries(
      {
        season: query.season,
        state: query.state,
        district: query.district,
        block: query.block,
        village: query.village,
        startDate: query.startDate,
        endDate: query.endDate,
      },
      query.concern,
      query.page,
      query.limit,
      query.source,
      query.userType,
      query.search,
    );
  }

  @OpenAPI({
    summary: 'Get farmer heat map analytics',
    description:
      'Returns state or district heat map metrics by month, week, day, or hour for farmer activity and question status analysis.',
  })
  @Get('/farmer-heat-map')
  @HttpCode(200)
  @Authorized()
  async getFarmerHeatMapAnalytics(
    @QueryParam('source') source: string,
    @QueryParam('userType') userType: string,
    @QueryParam('state') state: string,
    @QueryParam('granularity')
    granularity: 'monthly' | 'weekly' | 'daily' | 'hourly',
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string,
  ) {
    return this.chatbotService.getFarmerHeatMapAnalytics({
      source,
      userType,
      state,
      granularity,
      startDate,
      endDate,
    });
  }

  @OpenAPI({
    summary: 'Get top crops by questions',
    description:
      'Retrieves top crops aggregated from questions and duplicate_questions, excluding agri_expert source.',
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
  async getTopCrops(
    @QueryParams() query: {source?: string; userType?: string},
  ) {
    return this.chatbotService.getTopCrops(query.source, query.userType);
  }

  @OpenAPI({
    summary:
      'Get daily user activity trend for bar graph  (last N days, daily granularity)',
    description:
      'Retrieves daily user activity counts (distinct users per day) over the last N days, suitable for bar graph visualization.',
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
    return this.chatbotService.getDailyUserTrend(
      query.days,
      query.source,
      query.userType,
    );
  }

  @OpenAPI({
    summary: 'Get paginated user details with question counts',
    description:
      'Retrieves a paginated list of users with their question counts, optionally filtered by date range and search query. Includes summary statistics.',
  })
  @ResponseSchema(PaginatedUserDetailsResponse, {
    statusCode: 200,
    description:
      'Paginated user details with question counts and summary statistics',
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
    const lowFeedbackOnly = query.lowFeedbackOnly === 'true';
    const isVerified =
      query.isVerified === 'true' ? true : query.isVerified === 'false'
          ? false
          : undefined;
    const activeTodayByProfile = query.activeTodayByProfile === 'true';
    return this.chatbotService.getUserDetails(
      query.startDate,
      query.endDate,
      query.page,
      query.limit,
      query.search,
      query.source,
      query.crop,
      query.primaryCrops,
      query.secondaryCrops,
      query.village,
      query.state,
      query.district,
      query.block,
      query.profileCompleted,
      inactiveOnly,
      lowFeedbackOnly,
      query.userType,
      query.roles,
      query.sortBy,
      query.sortOrder,
      activeTodayByProfile,
      query.missingDemographicField,
      isVerified,
    );
  }

  @OpenAPI({
    summary: 'Get unverified users with search capability',
    description:
      'Retrieves a paginated list of unverified users (isVerified = false) with optional search filter. Supports pagination.',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch unverified users',
  })
  @Get('/unverified-users')
  @HttpCode(200)
  @Authorized()
  async getUnverifiedUsers(
    @QueryParam('page') page: number = 1,
    @QueryParam('limit') limit: number = 10,
    @QueryParam('search') search: string = '',
    @QueryParam('source') source: string = '',
  ) {
    return this.chatbotService.getAllUnverifiedUsers(
      page,
      limit,
      search,
      source,
    );
  }

  @OpenAPI({
    summary: 'Update user verification status',
    description:
      "Updates a user's verification status. Only users with admin role can perform this action.",
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 404,
    description: 'User not found',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to verify user',
  })
  @Patch('/verify-user/:userId')
  @HttpCode(200)
  @Authorized(['admin'])
  async verifyUser(
    @Param('userId') userId: string,
    @Body() body: {isVerified?: boolean},
    @QueryParam('source') source: string = 'annam',
    @CurrentUser() currentUser: IUser,
  ) {
    if (!userId) {
      throw new BadRequestError('User ID is required');
    }
    try {
      const targetStatus = body?.isVerified ?? true;
      const beforeUser = await this.chatbotService.getUserById(userId, source);
      const previousValue = beforeUser?.isVerified ?? true;
      const verifiedUser = await this.chatbotService.verifyUser(
        userId,
        source,
        targetStatus,
      );
      this.auditTrailsService.createAuditTrail({
        category: AuditCategory.FARMER_MANAGEMENT,
        action: AuditAction.UPDATE_USER_VERIFICATION,
        actor: {
          id: currentUser._id.toString(),
          name: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
          email: currentUser.email,
          role: currentUser.role,
          avatar: currentUser.avatar || '',
        },
        context: {
          userId,
          source,
          name: beforeUser?.name || beforeUser?.username || '',
          email: beforeUser?.email || '',
          role: beforeUser?.role || beforeUser?.userRole || '',
        },
        changes: {
          before: {isVerified: previousValue},
          after: {isVerified: targetStatus},
        },
        outcome: {
          status: OutComeStatus.SUCCESS,
        },
      });
      return {
        success: true,
        message: targetStatus
          ? 'User verified successfully'
          : 'User marked unverified successfully',
        user: verifiedUser,
      };
    } catch (error: any) {
      this.auditTrailsService.createAuditTrail({
        category: AuditCategory.FARMER_MANAGEMENT,
        action: AuditAction.UPDATE_USER_VERIFICATION,
        actor: {
          id: currentUser._id.toString(),
          name: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
          email: currentUser.email,
          role: currentUser.role,
          avatar: currentUser.avatar || '',
        },
        context: {userId, source},
        changes: {
          after: {isVerified: body?.isVerified ?? true},
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorMessage:
            error?.message || 'Failed to update verification status',
          errorName: error?.name || 'Error',
          errorStack:
            error?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      throw error;
    }
  }

  // @Get('/download-chatbot-report')
  // @Authorized()
  // @ContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  // @OpenAPI({ summary: 'Download chatbot conversations as Excel (date range, max 1 month)' })
  // async downloadChatbotReport(
  //   @QueryParams() query: { startDate?: string; endDate?: string; source?: string; downloadFormat?: string },
  //   @Res() response: any,
  // ) {
  //   if (!query.startDate || !query.endDate) {
  //     response.status(400).json({ success: false, message: 'startDate and endDate are required' });
  //     return;
  //   }
  //   const startDate = new Date(query.startDate);
  //   const endDate = new Date(query.endDate);
  //   const data = await this.chatbotService.generateChatbotExcelReport(startDate, endDate, query.source);
  //   if (!data) {
  //     response.status(200).json({ success: false, message: 'No data found for the selected date range' });
  //     return;
  //   }
  //   return Buffer.from(data as ArrayBuffer);
  // }

  @Get('/download-chatbot-report')
  @Authorized()
  @OpenAPI({
    summary: 'Download chatbot analytics report as Excel or PDF',
  })
  async downloadChatbotReport(
    @QueryParams()
    query: {
      startDate?: string;
      endDate?: string;
      source?: string;
      downloadFormat?: 'pdf' | 'xlsx';
      state?: string;
    },

    @Res() response: any,
  ) {
    try {
      if (!query.startDate || !query.endDate) {
        return response.status(400).json({
          success: false,
          message: 'startDate and endDate are required',
        });
      }

      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);
      const state = query.state;
      const format = query.downloadFormat || 'xlsx';

      // console.log('state is', state);

      let data: ArrayBuffer | Buffer | null = null;

      // ─────────────────────────────────────
      // PDF
      // ─────────────────────────────────────

      if (format === 'pdf') {
        data = await this.chatbotService.generateChatbotAnalyticsPdfReport(
          startDate,
          endDate,
          state,
          query.source,
        );

        if (!data) {
          return response.status(200).json({
            success: false,
            message: 'No data found for selected date range',
          });
        }

        response.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename=chatbot-report-${Date.now()}.pdf`,
        });

        return response.send(data);
      }

      // ─────────────────────────────────────
      // EXCEL
      // ─────────────────────────────────────

      data = await this.chatbotService.generateChatbotAnalyticsExcelReport(
        startDate,
        endDate,
        state,
        query.source,
      );

      if (!data) {
        return response.status(200).json({
          success: false,
          message: 'No data found for selected date range',
        });
      }

      response.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

        'Content-Disposition': `attachment; filename=chatbot-report-${Date.now()}.xlsx`,
      });

      return response.send(Buffer.from(data));
    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to download report',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @OpenAPI({
    summary: 'Get user growth metrics',
    description:
      'Retrieves user growth metrics over the last N days, suitable for bar graph visualization.',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch user growth trend',
  })
  @OpenAPI({summary: 'Get duplicate questions with farmer details'})
  @Get('/duplicate-questions')
  @HttpCode(200)
  @Authorized()
  async getDuplicateQuestions(@QueryParams() query: SourceQueryDto) {
    return this.chatbotService.getDuplicateQuestions(query.source);
  }

  @OpenAPI({
    summary: 'Get domain query spikes',
    description:
      'Returns domains where daily question count is ≥1.5× the rolling average over the last N days.',
  })
  @Get('/domain-spikes')
  @HttpCode(200)
  @Authorized()
  async getDomainSpikes(@QueryParams() query: {days?: number}) {
    return this.chatbotService.getDomainSpikes(query.days ?? 60);
  }

  @Get('/user-growth')
  @HttpCode(200)
  @Authorized()
  async getGrowth(@QueryParams() query: GrowthQuery): Promise<GrowthResponse> {
    const hasCustomRange = Boolean(query.startDate && query.endDate);

    if (hasCustomRange) {
      const startDate = new Date(query.startDate!);
      const endDate = new Date(query.endDate!);

      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        throw new Error('Invalid startDate or endDate.');
      }

      if (startDate > endDate) {
        throw new Error('startDate cannot be after endDate.');
      }

      const data = await this.chatbotService.getGrowth(
        query.source,
        query.userType,
        30,
        startDate,
        endDate,
      );
      return data;
    }

    const range = Number(query.range) || 30;
    const data = await this.chatbotService.getGrowth(query.source, query.userType, range);
    return data;
  }

  @OpenAPI({
    summary: 'Delete a farmer',
    description: 'Deletes a farmer from the specified source database.',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to delete farmer',
  })
  @Delete('/users/:userId')
  @HttpCode(200)
  @Authorized(['admin'])
  async deleteUser(
    @Param('userId') userId: string,
    @QueryParam('source') source: string,
    @CurrentUser() user: IUser,
  ) {
    if (!source) {
      source = 'annam';
    }

    const actorPayload = user
      ? {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user.avatar || '',
        }
      : null;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.FARMER_MANAGEMENT,
      action: AuditAction.DELETE_FARMER,
      actor: actorPayload!,
      context: {
        userId,
        source,
      },
      createdAt: new Date(),
    };

    let beforeUser: any = null;
    try {
      beforeUser = await this.chatbotService.getUserById(userId, source);
    } catch (e) {
      console.error('Failed to fetch user before deletion for audit trail', e);
    }

    try {
      const success = await this.chatbotService.deleteUser(userId, source);
      if (success) {
        auditPayload = {
          ...auditPayload,
          changes: {
            before: beforeUser
              ? {
                  id: beforeUser._id?.toString(),
                  name: beforeUser.name,
                  email: beforeUser.email,
                  userRole: beforeUser.userRole,
                  farmerProfile: beforeUser.farmerProfile,
                }
              : {},
          },
          outcome: {
            status: OutComeStatus.SUCCESS,
          },
        };
      } else {
        auditPayload = {
          ...auditPayload,
          outcome: {
            status: OutComeStatus.FAILED,
            errorMessage: 'Failed to delete user',
          },
        };
      }
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      return {
        success,
        message: success
          ? 'User deleted successfully'
          : 'Failed to delete user',
      };
    } catch (error: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorMessage: error?.message || 'Failed to delete user',
          errorName: error?.name || 'Error',
          errorStack:
            error?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      throw error;
    }
  }

  @OpenAPI({
    summary: 'Edit a farmer',
    description:
      'Updates editable farmer fields for a user in the selected source database.',
  })
  @Patch('/users/:userId')
  @HttpCode(200)
  @Authorized(['admin', ...COORDINATOR_ROLES])
  async updateUser(
    @Param('userId') userId: string,
    @QueryParam('source') source: string,
    @Body()
    body: {
      name?: string;
      userRole?: string;
      farmerProfile?: {
        farmerName?: string;
        age?: number;
        gender?: string | null;
        villageName?: string;
        blockName?: string;
        district?: string;
        state?: string;
        phoneNo?: string;
        nearestKVK?: string;
        languagePreference?: string;
        yearsOfExperience?: number;
        totalLandCultivating?: number;
        cropsCultivated?: string[];
        primaryCrop?: string;
        secondaryCrop?: string;
        awarenessOfKCC?: boolean;
        usesAgriApps?: boolean;
        highestEducatedPerson?: string;
        numberOfSmartphones?: number;
        platform?: string;
        landhold?: number;
      };
    },
    @CurrentUser() user: IUser,
  ) {
    if (!source) {
      source = 'annam';
    }
    // console.log('Body---------', body);

    const actorPayload = user
      ? {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user.avatar || '',
        }
      : null;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.FARMER_MANAGEMENT,
      action: AuditAction.UPDATE_FARMER,
      actor: actorPayload!,
      context: {
        userId,
        source,
      },
      createdAt: new Date(),
    };

    let beforeUser: any = null;
    try {
      beforeUser = await this.chatbotService.getUserById(userId, source);
    } catch (e) {
      console.error('Failed to fetch user before update for audit trail', e);
    }

    if (user.role !== 'admin') {
      if (source !== 'annam') {
        throw new ForbiddenError(
          'Coordinators can only update their linked Annam profile',
        );
      }

      const targetEmail = beforeUser?.email?.trim().toLowerCase();
      const actorEmail = user.email?.trim().toLowerCase();

      if (!targetEmail || !actorEmail || targetEmail !== actorEmail) {
        throw new ForbiddenError(
          'Coordinators can only update their own linked farmer profile',
        );
      }

      if (body.userRole && body.userRole !== beforeUser?.userRole) {
        throw new ForbiddenError('Coordinators cannot change coordinator role');
      }

      delete body.userRole;
    }

    try {
      const success = await this.chatbotService.updateUser(
        userId,
        source,
        body,
      );
      if (success) {
        let afterUser: any = null;
        try {
          afterUser = await this.chatbotService.getUserById(userId, source);
        } catch (e) {
          console.error('Failed to fetch user after update for audit trail', e);
        }

        auditPayload = {
          ...auditPayload,
          changes: {
            before: beforeUser
              ? {
                  name: beforeUser.name,
                  userRole: beforeUser.userRole,
                  farmerProfile: beforeUser.farmerProfile,
                }
              : {},
            after: afterUser
              ? {
                  name: afterUser.name,
                  userRole: afterUser.userRole,
                  farmerProfile: afterUser.farmerProfile,
                }
              : {},
          },
          outcome: {
            status: OutComeStatus.SUCCESS,
          },
        };
      } else {
        auditPayload = {
          ...auditPayload,
          outcome: {
            status: OutComeStatus.FAILED,
            errorMessage: 'Failed to update user',
          },
        };
      }
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      return {
        success,
        message: success
          ? 'User updated successfully'
          : 'Failed to update user',
      };
    } catch (error: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorMessage: error?.message || 'Failed to update user',
          errorName: error?.name || 'Error',
          errorStack:
            error?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      throw error;
    }
  }

  @OpenAPI({
    summary: 'Change farmer password',
    description:
      'Updates a farmer password securely in the selected source database.',
  })
  @Post('/admin/users/:userId/change-password')
  @HttpCode(200)
  @Authorized(['admin'])
  async changeUserPassword(
    @Param('userId') userId: string,
    @QueryParam('source') source: string,
    @Body()
    body: {
      newPassword: string;
      keepLoggedIn: boolean;
    },
    @CurrentUser() user: IUser,
  ) {
    if (!source) {
      source = 'annam';
    }
    this.assertStrongPassword(body.newPassword);

    const actorPayload = user
      ? {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user.avatar || '',
        }
      : null;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.FARMER_MANAGEMENT,
      action: AuditAction.CHANGE_USER_PASSWORD,
      actor: actorPayload!,
      context: {
        userId,
        source,
        origin: 'Admin Panel',
      },
      createdAt: new Date(),
    };

    let targetUser: any = null;
    try {
      targetUser = await this.chatbotService.getUserById(userId, source);
    } catch (e) {
      console.error('Failed to fetch target user for password audit trail', e);
    }

    try {
      const success = await this.chatbotService.changeUserPassword(
        userId,
        source,
        body.newPassword,
        body.keepLoggedIn
      );

      auditPayload = {
        ...auditPayload,
        changes: {
          before: targetUser
            ? {
                id: targetUser._id?.toString(),
                email: targetUser.email,
                userRole: targetUser.userRole,
                passwordChanged: false,
              }
            : {},
          after: {
            passwordChanged: success,
            sessionsInvalidated: success,
          },
        },
        outcome: {
          status: success ? OutComeStatus.SUCCESS : OutComeStatus.FAILED,
          ...(success ? {} : {errorMessage: 'Failed to change user password'}),
        },
      };

      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }

      return {
        success,
        message: success
          ? 'Password changed successfully'
          : 'Failed to change password',
      };
    } catch (error: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorMessage: error?.message || 'Failed to change password',
          errorName: error?.name || 'Error',
          errorStack:
            error?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      throw error;
    }
  }

  @OpenAPI({
    summary: 'Add a new farmer',
    description:
      'Creates a new farmer in the selected database source (restricted to annam).',
  })
  @Post('/users')
  @HttpCode(201)
  @Authorized(['admin'])
  async addUser(
    @QueryParam('source') source: string,
    @Body()
    body: {
      email: string;
      name: string;
      password: string;
      userRole?: string;
      isVerified?: boolean;
    },
    @CurrentUser() user: IUser,
  ) {
    if (!source) {
      source = 'annam';
    }
    if (source === 'whatsapp') {
      throw new BadRequestError(
        'Add farmer functionality is not supported for whatsapp source',
      );
    }
    if (!body.email || !body.email.trim()) {
      throw new BadRequestError('Email is required');
    }
    if (!body.name || !body.name.trim()) {
      throw new BadRequestError('Name is required');
    }
    this.assertStrongPassword(body.password);

    const actorPayload = user
      ? {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user.avatar || '',
        }
      : null;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.FARMER_MANAGEMENT,
      action: AuditAction.ADD_FARMER,
      actor: actorPayload!,
      context: {
        source,
        email: body.email.trim().toLowerCase(),
      },
      createdAt: new Date(),
    };

    try {
      const success = await this.chatbotService.addUser(source, body);
      if (success) {
        let createdUser = null;
        try {
          const userRepo = (this.chatbotService as any).chatbotRepository;
          await userRepo.init(source);
          createdUser = await userRepo.users.findOne({
            email: body.email.trim().toLowerCase(),
          });
        } catch (e) {
          console.error('Failed to fetch added user for audit trail', e);
        }

        auditPayload = {
          ...auditPayload,
          changes: {
            after: createdUser
              ? {
                  id: createdUser._id?.toString(),
                  name: createdUser.name,
                  email: createdUser.email,
                  userRole: createdUser.userRole,
                  isVerified: createdUser.isVerified ?? true,
                  createdAt: createdUser.createdAt,
                }
              : {
                  name: body.name,
                  email: body.email,
                  userRole: body.userRole || 'FARMER',
                  isVerified: body.isVerified ?? true,
                },
          },
          outcome: {
            status: OutComeStatus.SUCCESS,
          },
        };
      } else {
        auditPayload = {
          ...auditPayload,
          outcome: {
            status: OutComeStatus.FAILED,
            errorMessage: 'Failed to create user',
          },
        };
      }
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      return {
        success,
        message: success
          ? 'User created successfully'
          : 'Failed to create user',
      };
    } catch (error: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorMessage: error?.message || 'Failed to create user',
          errorName: error?.name || 'Error',
          errorStack:
            error?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      if (error instanceof BadRequestError) {
        throw error;
      }
      throw error;
    }
  }

  // @Get('/daily-active-users-trend')
  // @HttpCode(200)
  // @Authorized()
  // async getDailyActiveUsersTrend(@QueryParams() query: ActiveUsersQuery): Promise<any> {
  //   const startDate = query.startDate
  //     ? new Date(query.startDate)
  //     : undefined;

  //   const endDate = query.endDate
  //     ? new Date(query.endDate)
  //     : undefined;
  //   const source = query.source;
  //   const userType = query.userType;

  //   return await this.chatbotService.getDailyActiveUsersTrend( source, userType, startDate, endDate,);
  // }

  // @Get('/monthly-active-users-trend')
  // @HttpCode(200)
  // @Authorized()
  // async getMonthlyActiveUsersTrend(@QueryParams() query: ActiveUsersQuery): Promise<any> {
  //   const startDate = query.startDate
  //     ? new Date(query.startDate)
  //     : undefined;

  //   const endDate = query.endDate
  //     ? new Date(query.endDate)
  //     : undefined;
  //   const source = query.source;
  //   const userType = query.userType;

  //   return await this.chatbotService.getMonthlyActiveUsersTrend( source, userType, startDate, endDate);
  // }

  // @Get('/weekly-active-users-trend')
  // @HttpCode(200)
  // @Authorized()
  // async getWeeklyActiveUsersTrend(@QueryParams() query: ActiveUsersQuery): Promise<any> {
  //   const startDate = query.startDate
  //     ? new Date(query.startDate)
  //     : undefined;

  //   const endDate = query.endDate
  //     ? new Date(query.endDate)
  //     : undefined;
  //   const source = query.source;
  //   const userType = query.userType;

  //   return await this.chatbotService.getWeeklyActiveUsersTrend( source, userType, startDate, endDate);
  // }

  @Get('/retention-metrics')
  @HttpCode(200)
  @Authorized()
  async getRetentionMetrics(
    @QueryParams() query: RetentionMetricsQuery,
  ): Promise<any> {
    const startDate = query.startDate ? new Date(query.startDate) : undefined;

    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const source = query.source;
    const userType = query.userType;
    const requestType = query.requestType;

    return await this.chatbotService.getRetentionMetrics(
      source,
      userType,
      requestType,
      startDate,
      endDate,
    );
  }

  @Get('/user-questions-data')
  @HttpCode(200)
  @Authorized()
  async getUserQuestionsData(
    @QueryParam('userEmail') userEmail: string,

    @QueryParam('source')
    source: string = 'annam',

    @QueryParam('userType')
    userType: string = 'all',

    @QueryParam('page')
    page: number = 1,

    @QueryParam('limit')
    limit: number = 10,
  ): Promise<any> {
    // const userData =
    //   await this.userService.getUserByEmail(userEmail);

    // if (!userData) {
    //   throw new Error(
    //     'User not found with the provided email.',
    //   );
    // }

    // const userId = userData._id.toString();

    return await this.chatbotService.getUserQuestionsData(
      userEmail,
      source,
      userType,
      Number(page),
      Number(limit),
    );
  }

  @Post('/notify-user')
  @HttpCode(200)
  @Authorized()
  async notifyUser(
    @QueryParam('userEmail') userEmail: string,
    @QueryParam('messageId') messageId: string,
    @QueryParam('message') message: string,
  ) {
    return this.chatbotService.notifyUser(userEmail, messageId, message);
  }

  @Get('/closed-notified-data')
  @HttpCode(200)
  @Authorized()
  async getClosedAndNotifedData(
    @QueryParam('source')
    source: string = 'annam',
    @QueryParam('userType')
    userType: string = 'all',
    @QueryParam('startDate')
    startDate?: string,
    @QueryParam('endDate')
    endDate?: string,
  ): Promise<any> {
    return await this.chatbotService.getClosedAndNotifedData(
      source,
      userType,
      startDate,
      endDate,
    );
  }

  @Get('/monthly-churn-rate')
  @HttpCode(200)
  @Authorized()
  async getMonthlyChurnRate(
    @QueryParam('source')
    source: string = 'annam',

    @QueryParam('userType')
    userType: string = 'all',
  ): Promise<any> {
    return await this.chatbotService.getMonthlyChurnRate(source, userType);
  }

  @Get('/active-users-trend')
  @HttpCode(200)
  @Authorized()
  async getActiveUsersTrend(
    @QueryParams() query: ActiveUsersQuery,
  ): Promise<IActiveUser[]> {
    const startDate = query.startDate ? new Date(query.startDate) : undefined;

    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const source = query.source;
    const userType = query.userType;
    const requestType = query.requestType;

    return await this.chatbotService.getActiveUsersTrend(
      source,
      userType,
      requestType,
      startDate,
      endDate,
    );
  }

  @Get('/top-faqs')
  @HttpCode(200)
  @Authorized()
  async getTopFaqs(@QueryParams() query: TopFaqsQuery): Promise<any> {
    const startTime = query.startTime
      ? new Date(query.startTime).toString()
      : undefined;

    const endTime = query.endTime
      ? new Date(query.endTime).toString()
      : undefined;
    const source = query.source;
    const userType = query.userType;

    const [topFaqs, topQuestionsFromCollection, repeatQueryCountData] =
      await Promise.all([
        this.chatbotService.getTopFaqs(source, userType, startTime, endTime),
        this.chatbotService.getTopQuestionsFromCollection(
          source,
          userType,
          startTime,
          endTime,
        ),
        this.chatbotService.getRepeatQueryCount(
          source,
          userType,
          startTime,
          endTime,
        ),
      ]);

    return {topFaqs, topQuestionsFromCollection, ...repeatQueryCountData};
  }

  @Get('/daily-question-trends')
  @HttpCode(200)
  @Authorized()
  async getDailyQuestionTrends(
    @QueryParams() query: ActiveUsersQuery,
  ): Promise<
    Array<{day: string; uniqueCount: number; duplicateCount: number}>
  > {
    const startDate = query.startDate
      ? new Date(query.startDate).toISOString()
      : undefined;

    const endDate = query.endDate
      ? new Date(query.endDate).toISOString()
      : undefined;
    const source = query.source;
    const userType = query.userType;

    return await this.chatbotService.getDailyQuestionTrends(
      30,
      source,
      userType,
      startDate,
      endDate,
    );
  }

  @Get('/users-metrices')
  @HttpCode(200)
  @Authorized()
  async getUsermetrices(@QueryParams() query: ActiveUsersQuery): Promise<{
    userDemographics: UserDemographics;
    platformInstalls: PlatformInstallEntry[];
    kccAndAgriAppUsage: KccAndAgriAppStats;
    feedbackData: FeedbackData;
  }> {
    const source = query.source;
    const userType = query.userType;

    return await this.chatbotService.getUsersMetrics(source, userType);
  }

  @Get('/response-adherence-table-data')
  @HttpCode(200)
  @Authorized()
  async getResponseAderenceTable(
    @QueryParams() query: ActiveUsersQuery,
  ): Promise<ResponseAdherenceTable> {
    const startDate = query.startDate
      ? new Date(query.startDate).toISOString()
      : undefined;

    const endDate = query.endDate
      ? new Date(query.endDate).toISOString()
      : undefined;
    const source = query.source;
    const userType = query.userType;

    return await this.chatbotService.getResponseAdherenceTable(
      source,
      userType,
      startDate,
      endDate,
    );
  }

  @Get('/state-user-data')
  @HttpCode(200)
  @Authorized()
  async getAllStatesQuestionsAndUsersData(
        @QueryParams()
    query: {
      source: string,
      userType: string,
    }
  ): Promise<any>{
    return this.chatbotService.getAllStatesQuestionsAndUsersData(query.source, query.userType)
  }
  
  @Get('/user-profile')
  @HttpCode(200)
  @Authorized()
  async getUserProfile(
    @QueryParams() query: userProfileQuery
  ) {
    return await this.chatbotService.getUserProfile(
      query.userId,
    );
  }

  @Patch('/assign-users/:userId')
  @HttpCode(200)
  @Authorized(['admin', ...COORDINATOR_ROLES])
  async assignUsers(
    @Param('userId') userId: string,
    @Body() body: {userIds: string[]},
    @CurrentUser() currentUser: IUser,
  ) {
    await this.assertCoordinatorOwnDashboard(userId, currentUser);

    return await this.chatbotService.assignUsers(
      userId,
      body.userIds,
    );
  }

  @Patch('/unassign-users/:userId')
  @HttpCode(200)
  @Authorized(['admin', ...COORDINATOR_ROLES])
  async unAssignUsers(
    @Param('userId') userId: string,
    @Body() body: {userIds: string[]},
    @CurrentUser() currentUser: IUser,
  ) {
    await this.assertCoordinatorOwnDashboard(userId, currentUser);

    return await this.chatbotService.unAssignUsers(
      userId,
      body.userIds,
    );
  }

  private async assertCoordinatorOwnDashboard(userId: string, currentUser: IUser) {
    if (currentUser.role === 'admin') return;

    const profile = await this.chatbotService.getUserProfile(userId);
    const profileEmail = profile?.email?.trim().toLowerCase();
    const currentUserEmail = currentUser.email?.trim().toLowerCase();

    if (!profileEmail || !currentUserEmail || profileEmail !== currentUserEmail) {
      throw new ForbiddenError(
        'Coordinators can only manage users from their own dashboard',
      );
    }
  }

  @Get('/village-data')
  @HttpCode(200)
  @Authorized()
  async getVillageUserCounts(
    @QueryParams()
    query: {
      state: string;
      district: string;
      source: string;
      userType: string;
    }
  ): Promise<any> {
    return this.chatbotService.getVillageUserCounts(
      query.state,
      query.district,
      query.source,
      query.userType,
    );
  }

  @Get('/question-lifecycle')
  @HttpCode(200)
  @Authorized()
  async getQuestionLifecycle(
    @QueryParam('questionId')
    questionId: string
  ): Promise<any> {
    return this.chatbotService.getQuestionLifecycle(
      questionId
    );
  }

  @Get('/active-users-details')
  @HttpCode(200)
  @Authorized()
  async getActiveUsers(
  @QueryParams()
    query: {

      page?: number;
      limit?: number;
      source?: string;
      userType?: string;
      district?: string;
      state?: string;
      search?: string;

    },
) {
  const pageInNumber = Number(query.page)
  const limitInNumber = Number(query.limit)
  return this.chatbotService.getActiveUsersDetails(
    pageInNumber,
    limitInNumber,
    query.source,
    query.userType,
    query.state,
    query.district,
    query.search,
  );
}



@Get('/get-coordinators-details')
  @HttpCode(200)
  @Authorized()
  async getCoordinatorsDetails(
  @QueryParams()
    query: {

      page?: number;
      limit?: number;
      source?: string;
      userType?: string;
      district?: string;
      state?: string;
      search?: string;

    },
) {
  const pageInNumber = Number(query.page)
  const limitInNumber = Number(query.limit)
  return this.chatbotService.getCoordinatorsDetails(
    pageInNumber,
    limitInNumber,
    query.source,
    query.userType,
    query.state,
    query.district,
    query.search,
  );
}
}
