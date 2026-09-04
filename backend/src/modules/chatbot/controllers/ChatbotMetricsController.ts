import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  HttpCode,
  QueryParams,
  Authorized,
  QueryParam,
  Param,
  Patch,
  Body,
  CurrentUser,
  ForbiddenError,
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
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
  SendResponseAdherenceReportRequest,
} from '../classes/validators/ChatbotQueryValidators.js';
import {
  ActiveUsersQuery,
  RetentionMetricsQuery,
  TopFaqsQuery,
  userProfileQuery,
} from '../types/chatbot.type.js';
import {IActiveUser} from '#root/shared/database/providers/mongo/repositories/ChatbotRepository.js';
import {
  FeedbackData,
  KccAndAgriAppStats,
  PlatformInstallEntry,
  ResponseAdherenceTable,
  UserDemographics,
} from '#root/shared/database/interfaces/IChatbotRepository.js';
import {COORDINATOR_ROLES} from '#root/shared/constants/roles.js';

@OpenAPI({
  tags: ['chatbot-metrics'],
  description: 'Chatbot metrics and reporting endpoints',
})
@injectable()
@JsonController('/analytics', {transformResponse: false})
export class ChatbotMetricsController {
  constructor(
    @inject(CHATBOT_TYPES.ChatbotService)
    private readonly chatbotService: IChatbotService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

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
  limit: number = 12,

  @QueryParam('startDate')
  startDate?: string,

  @QueryParam('endDate')
  endDate?: string,
): Promise<any> {
  return await this.chatbotService.getUserQuestionsData(
    userEmail,
    source,
    userType,
    Number(page),
    Number(limit),
    startDate,
    endDate,
  );
}

  @Get('/user-message-metric-details')
  @HttpCode(200)
  @Authorized()
  async getUserMessageMetricDetails(
    @QueryParam('userId') userId: string,
    @QueryParam('metric') metric: string,
    @QueryParam('page') page: number = 1,
    @QueryParam('limit') limit: number = 10,
  ): Promise<any> {
    return await this.chatbotService.getUserMessageMetricDetails(
      userId,
      metric,
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
    @QueryParam('userId')
    userId?: string,
  ): Promise<any> {
    return await this.chatbotService.getClosedAndNotifedData(
      source,
      userType,
      startDate,
      endDate,
      userId,
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
    const coordinatorId = query.coordinatorId;

    const [topFaqs, topQuestionsFromCollection, repeatQueryCountData] =
      await Promise.all([
        this.chatbotService.getTopFaqs(source, userType, startTime, endTime, coordinatorId),
        this.chatbotService.getTopQuestionsFromCollection(
          source,
          userType,
          startTime,
          endTime,
          coordinatorId,
        ),
        this.chatbotService.getRepeatQueryCount(
          source,
          userType,
          startTime,
          endTime,
          coordinatorId,
        ),
      ]);

    return {topFaqs, topQuestionsFromCollection, ...repeatQueryCountData};
  }

  @Get('/top-questions/:questionId')
  @HttpCode(200)
  @Authorized()
  async getTopQuestionInstances(
    @Param('questionId') questionId: string,
    @QueryParams() query: TopFaqsQuery,
    @QueryParam('page') page: number = 1,
    @QueryParam('limit') limit: number = 10,
  ): Promise<any> {
    const startTime = query.startTime
      ? new Date(query.startTime).toString()
      : undefined;

    const endTime = query.endTime
      ? new Date(query.endTime).toString()
      : undefined;
    const source = query.source;
    const userType = query.userType;
    const coordinatorId = query.coordinatorId;

    return await this.chatbotService.getTopQuestionInstances(
      questionId,
      source,
      userType,
      startTime,
      endTime,
      page,
      limit,
      coordinatorId
    );
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
    let startDate = undefined;
    let endDate = undefined;
    if(query.startDate){
      startDate = new Date(query.startDate);
    }
    if(query.endDate){
      endDate = new Date (query.endDate);
    }

    return await this.chatbotService.getUsersMetrics(source, userType, startDate, endDate);
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

  @OpenAPI({
    summary: 'Email the Response Adherence Summary report',
    description:
      'Sends the Response Adherence Summary report (as built by the dashboard download button) as a CSV attachment to the given list of recipient emails.',
  })
  @Post('/response-adherence-table/email')
  @HttpCode(200)
  @Authorized()
  async sendResponseAdherenceReportEmail(
    @Body() body: SendResponseAdherenceReportRequest,
    @CurrentUser() user: IUser,
  ) {
    const {emails, reportContent, reportHtml, fileName, source, userType, startDate, endDate, timeWindow} = body;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.ADMIN_REPORT,
      action: AuditAction.SEND_DASHBOARD_REPORT,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        recipients: emails,
        source,
        userType,
        startDate,
        endDate,
        endPoint: 'sendResponseAdherenceReportEmail',
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };

    try {
      const result = await this.chatbotService.sendResponseAdherenceReportEmail(
        emails,
        reportContent,
        fileName || `response-adherence-report-${startDate || ''}.csv`,
        {source, userType, startDate, endDate, timeWindow},
        reportHtml,
      );
      this.auditTrailsService.createAuditTrail(auditPayload);
      return result;
    } catch (error: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorMessage: error?.message || 'Failed to send response adherence report email',
          errorName: error?.name || 'Error',
          errorStack:
            error?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      console.error('Error in sendResponseAdherenceReportEmail controller:', error);
      throw error;
    }
  }

  @Get('/state-user-data')
  @HttpCode(200)
  @Authorized()
  async getAllStatesQuestionsAndUsersData(
        @QueryParams()
    query: {
      source: string,
      userType: string,
      startDate: string,
      endDate: string,
    }
  ): Promise<any>{
    let startDate = undefined
    let endDate = undefined
    if(query.startDate) startDate = new Date(query.startDate)
    if(query.endDate) endDate =  new Date(query.endDate);
    return this.chatbotService.getAllStatesQuestionsAndUsersData(query.source, query.userType, startDate, endDate);
  }
  
  @Get('/user-profile')
  @HttpCode(200)
  @Authorized()
  async getUserProfile(
    @QueryParams() query: userProfileQuery
  ) {
    return await this.chatbotService.getUserProfile(
      query.userId,
      query.startDate,
      query.endDate,
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
      startDate?: string;
      endDate?: string;
    },
) {
  const pageInNumber = Number(query.page)
  const limitInNumber = Number(query.limit)
  let startDate = undefined;
  let endDate = undefined;
  if(query.startDate) startDate = new Date(query.startDate);
  if(query.endDate) endDate = new Date(query.endDate)
  return this.chatbotService.getActiveUsersDetails(
    pageInNumber,
    limitInNumber,
    query.source,
    query.userType,
    query.state,
    query.district,
    query.search,
    startDate,
    endDate
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
  @Get('/lifecycle-summary')
  @HttpCode(200)
  @Authorized()
  async getLifecycleSummary(
    @QueryParam('status') status: string = 'all',
    @QueryParam('source') source: string = 'annam',
    @QueryParam('userType') userType: string = 'all',
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string,
    @QueryParam('isPassed') isPassed?: string,
    @QueryParam('tag') tag?: string,
    @QueryParam('notificationType') notificationType?: string,
    @QueryParam('userId') userId?: string,
    @QueryParam('page') page?: number,
    @QueryParam('limit') limit?: number,
    @QueryParam('manualSource') manualSource?: string,
    @QueryParam('effectiveDate') effectiveDate?: string,
  ): Promise<any> {
    const start= startDate
        ? new Date(startDate)
        : undefined;
    const end= endDate
        ? new Date(endDate)
        : undefined;
    return this.chatbotService.getLifeCycleSummary(
      status,
      source,
      userType,
      start,
      end,
      isPassed,
      tag,
      notificationType,
      userId,
      page,
      limit,
      manualSource,
      effectiveDate
    );
  }

  @Get('/feedback-by-location')
  @HttpCode(200)
  @Authorized()
  async getFeedbackByLocation(@QueryParams() query: any) {
    const numberPage = Number(query.page)
    const numberLimit = Number(query.limit)
    let startDate = undefined;
    let endDate = undefined;
    if(query.startDate) startDate = new Date(query.startDate);
    if(query.endDate) endDate = new Date(query.endDate);
    return this.chatbotService.getFeedbackByLocation(
      query.source,
      numberPage,
      numberLimit,
      query.sortBy,
      query.sortOrder,
      query.userType,
      query.rating,
      query.state,
      query.district,
      query.search,
      startDate,
      endDate
    );
  }


  @Get('/closed-question-by-location')
  @HttpCode(200)
  @Authorized()
  async getClosedInLastTwoHoursByLocation(@QueryParams() query: any) {
        let startDate = undefined;
    let endDate = undefined;
    if(query.startDate) startDate = new Date(query.startDate);
    if(query.endDate) endDate = new Date(query.endDate);
    return this.chatbotService.getClosedInLastTwoHoursByLocation(
      query.source,
      query.userType,
      query.state,
      query.district,
      startDate,
      endDate
    );
  }

  @Get('/active-user-by-questions')
  @HttpCode(200)
  @Authorized()
  async getActiveUsersDetailsByQuestions(@QueryParams() query: any){
    let startDate = undefined;
    let endDate = undefined;
    if(query.startDate) startDate = new Date(query.startDate);
    if(query.endDate) endDate = new Date(query.endDate);
    return this.chatbotService.getActiveUsersDetailsByQuestions(
      query.page,
      query.limit,
      query.source,
      query.userType,
      query.state,
      query.district,
      query.search,
      startDate,
      endDate
    )
  }

  // Dataset Application Totals (external data release service)
  @OpenAPI({ summary: 'Get total number of questions in the dataset application' })
  @Get('/dataset/total-questions')
  @HttpCode(200)
  @Authorized()
  async getTotalQuestionsFromDataset() {
    const total = await this.chatbotService.getTotalQuestionsFromDataset();
    return { total };
  }

  @OpenAPI({ summary: 'Get total number of feedbacks in the dataset application' })
  @Get('/dataset/total-feedbacks')
  @HttpCode(200)
  @Authorized()
  async getTotalFeedbacksFromDataset() {
    const total = await this.chatbotService.getTotalFeedbacksFromDataset();
    return { total };
  }

  @OpenAPI({ summary: 'Get total number of users in the dataset application' })
  @Get('/dataset/total-users')
  @HttpCode(200)
  @Authorized()
  async getTotalUsersFromDataset() {
    const total = await this.chatbotService.getTotalUsersFromDataset();
    return { total };
  }

  // Dataset Application Lists (external data release service â€” NOT the
  // internal review system)
  @OpenAPI({
    summary: 'List questions in the dataset application',
    description: 'Paginated list of dataset-app questions (questionId, question, createdAt).',
  })
  @Get('/dataset/questions')
  @HttpCode(200)
  @Authorized()
  async listQuestionsFromDataset(
    @QueryParam('page') page: number = 1,
    @QueryParam('pageSize') pageSize: number = 10,
  ) {
    return this.chatbotService.listQuestionsFromDataset(page, pageSize);
  }

  @OpenAPI({
    summary: 'List feedbacks in the dataset application',
    description: 'Paginated list of dataset-app feedbacks (email, questionId, tag, type, predefinedOption, comment, reviewNote, status, createdAt).',
  })
  @Get('/dataset/feedbacks')
  @HttpCode(200)
  @Authorized()
  async listFeedbacksFromDataset(
    @QueryParam('page') page: number = 1,
    @QueryParam('pageSize') pageSize: number = 10,
  ) {
    return this.chatbotService.listFeedbacksFromDataset(page, pageSize);
  }

  @OpenAPI({
    summary: 'List users in the dataset application',
    description: 'Paginated list of dataset-app users (name, email, phone, age, createdAt).',
  })
  @Get('/dataset/users')
  @HttpCode(200)
  @Authorized()
  async listUsersFromDataset(
    @QueryParam('page') page: number = 1,
    @QueryParam('pageSize') pageSize: number = 10,
  ) {
    return this.chatbotService.listUsersFromDataset(page, pageSize);
  }

}
