import 'reflect-metadata';
import {
  JsonController,
  Get,
  HttpCode,
  QueryParams,
  Authorized,
  QueryParam,
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
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {AUDIT_TRAILS_TYPES} from '#root/modules/auditTrails/types.js';
import {IAuditTrailsService} from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import {
  DashboardQueryDto,
  DemographicUsersQueryDto,
  PlatformUsersQueryDto,
  QueryAnalyticsQueryDto,
  SourceQueryDto,
  UserDetailsQueryDto,
  WeatherConcernAnalyticsQueryDto,
  WeatherConcernQueriesQueryDto,
  FeedbackUsersQueryDto,
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
  QueryCategoryQuestionType,
} from '#root/shared/database/interfaces/IChatbotRepository.js';
import {COORDINATOR_ROLES} from '#root/shared/constants/roles.js';

@OpenAPI({
  tags: ['chatbot-analytics'],
  description: 'Chatbot analytics endpoints',
})
@injectable()
@JsonController('/analytics', {transformResponse: false})
export class ChatbotAnalyticsController {
  constructor(
    @inject(CHATBOT_TYPES.ChatbotService)
    private readonly chatbotService: IChatbotService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

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
      undefined,
      query.coordinatorId,
    );
  }

  @OpenAPI({
    summary: 'Get paginated feedback messages',
    description:
      'Returns a paginated list of feedback messages filtered by rating or tag.',
  })
  @Get('/feedback-users')
  @HttpCode(200)
  @Authorized()
  async getFeedbackUsers(@QueryParams() query: FeedbackUsersQueryDto) {
 
    return this.chatbotService.getFeedbackUsers(
      query.source,
      query.page,
      query.limit,
      query.search,
      query.sortBy,
      query.sortOrder,
      query.userType,
      query.rating,
      query.tag,
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

    @QueryParam('startDate')
    startDate: string,

    @QueryParam('endDate')
    endDate: string,

    @QueryParam('coordinatorId')
    coordinatorId?: string,
  ) {
    // console.log("Selected state code controller", selectedStateCode);
    let convertedStartDate = undefined
    let convertedEndDate = undefined
    if(startDate){
      convertedStartDate = new Date(startDate);
    }
    if(endDate){
      convertedEndDate = new Date(endDate);
    }
    return this.chatbotService.getDistrictAnalyticsByState(
      state,
      selectedStateCode,
      source,
      userType,
      convertedStartDate,
      convertedEndDate,
      coordinatorId,
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
  async getQueryCategories(@QueryParams() query: { source?: string; userType?: string; coordinatorId?: string }) {
    return this.chatbotService.getQueryCategories(query.source || 'annam', query.userType || 'all', query.coordinatorId);
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
      tag?: string;
      userId?: string;
      manualSource?: string;
      effectiveDate?: string;
      coordinatorId?: string;
    },
    @QueryParam('userId') userId?: string,
  ) {
    const scopedUserId = userId || query.userId;
    let globalStartDate = undefined;
    let globalEndDate = undefined;
    if(query.startDate) globalStartDate = new Date(query.startDate);
    if(query.endDate) globalEndDate = new Date (query.endDate)

    if (query.category) {
      return this.chatbotService.getQueryCategoryQuestions(
        query.category,
        query.questionType,
        query.page,
        query.limit,
        query.source,
        query.userType,
        query.search,
        query.coordinatorId,
      );
    } else if (query.state && !query.district && !query.closedWithInTwohours) {
      console.log("Inside first else if.......")
      return this.chatbotService.getQuestionFromState(
        query.state,
        query.questionType,
        query.page,
        query.limit,
        query.source,
        query.userType,
        query.search,
        globalStartDate,
        globalEndDate,
      );
    }
    else if (query.district && !query.closedWithInTwohours) {
      return this.chatbotService.getQuestionFromDistrict(
        query.district,
        query.state,
        query.questionType,
        query.page,
        query.limit,
        query.source,
        query.userType,
        query.search,
        globalStartDate,
        globalEndDate,
        undefined
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
        query.coordinatorId,
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
        scopedUserId,
      );
    } else if (query.closedWithInTwohours) {
      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);
      console.log("query object is", query)
      console.log("State from frontend is", query.state)
      console.log("District from frontend is coming", query.district)
      return this.chatbotService.getQuestionsClosedWithinTwoHours(
        query.page,
        query.limit,
        query.source,
        query.userType,
        query.search,
        startDate,
        endDate,
        query.isPassed,
        query.tag,
        scopedUserId,
        query.state,
        query.district
      );
    } else if (query.manualSource){
      return this.chatbotService.getQuestionByManualSource(
        query.manualSource,
        query.effectiveDate,
        query.userType,
        query.page,
        query.limit,
        query.search,
      )
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
        scopedUserId,
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
    @QueryParam('district') district: string,
    @QueryParam('block') block: string,
    @QueryParam('village') village: string,
    @QueryParam('granularity')
    granularity: 'monthly' | 'weekly' | 'daily' | 'hourly',
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string,
  ) {
    return this.chatbotService.getFarmerHeatMapAnalytics({
      source,
      userType,
      state,
      district,
      block,
      village,
      granularity,
      startDate,
      endDate,
    });
  }

  @OpenAPI({
    summary: 'Get coordinator duplicate question heat map',
    description:
      'Returns coordinator-scoped duplicate question counts by block and village. Repeated identical questions from the same user count as one duplicate group.',
  })
  @Get('/coordinator-duplicate-heat-map/:userId')
  @HttpCode(200)
  @Authorized(['admin', ...COORDINATOR_ROLES])
  async getCoordinatorDuplicateQuestionHeatMap(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: IUser,
  ) {
    await this.assertCoordinatorOwnDashboard(userId, currentUser);

    return this.chatbotService.getCoordinatorDuplicateQuestionHeatMap(userId);
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
    @QueryParams() query: {source?: string; userType?: string; coordinatorId?: string},
  ) {
    return this.chatbotService.getTopCrops(query.source, query.userType, query.coordinatorId);
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
  @OpenAPI({
    summary: 'Get users by demographic category',
    description:
      'Returns paginated users filtered by a demographic category and value such as age, gender, experience, or landholding.',
  })
  @Get('/users-by-demographic')
  @HttpCode(200)
  @Authorized()
  async getUsersByDemographic(@QueryParams() query: DemographicUsersQueryDto) {
    return this.chatbotService.getUsersByDemographic(
      query.category,
      query.value,
      query.source,
      query.userType,
      query.page,
      query.limit,
      query.search,
      query.sortBy,
      query.sortOrder,
    );
  }

  @OpenAPI({
    summary: 'Get users by platform',
    description:
      'Returns paginated users filtered by the selected platform, with optional search and sorting.',
  })
  @ResponseSchema(PaginatedUserDetailsResponse, {
    statusCode: 200,
    description: 'Paginated users for the selected platform',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch users by platform',
  })
  @Get('/users-by-platform')
  @HttpCode(200)
  @Authorized()
  async getUsersByPlatform(@QueryParams() query: PlatformUsersQueryDto) {
    return this.chatbotService.getUsersByPlatform(
      query.platform,
      query.source,
      query.page,
      query.limit,
      query.search,
      query.sortBy,
      query.sortOrder,
      query.userType,
    );
  }

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
    const fromMap = query.fromMap === "true" ? true : false
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
      fromMap,
      query.loginStatus,
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
}

