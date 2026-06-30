import {injectable, inject} from 'inversify';
import {
  InternalServerError,
  BadRequestError,
  NotFoundError,
} from 'routing-controllers';
import {CHATBOT_TYPES} from '../types.js';
import type {
  IChatbotService,
  DashboardResponse,
} from '../interfaces/IChatbotService.js';
import type {
  IChatbotRepository,
  ChatbotConversationData,
  WeatherConcernAnalyticsFilters,
  PaginatedUserDetails,
  UnverifiedUserEntry,
  UserDemographics,
  PlatformInstallEntry,
  KccAndAgriAppStats,
  FeedbackData,
  ResponseAdherenceTable,
  FarmerHeatMapFilters,
  FarmerHeatMapResponse,
  QueryCategoryQuestionType,
} from '#root/shared/database/interfaces/IChatbotRepository.js';
import ExcelJS from 'exceljs';
import {GrowthResponse} from '../types/chatbot.type.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  getDateLabelsBetween,
  getDateRange,
  mapToSeries,
} from '../utils/chatbot.utils.js';

import PDFDocument from 'pdfkit';
import {WhatsappUsers} from '#root/utils/dummyWhatsAppUsers.js';
import {access} from 'node:fs';
import {aiConfig} from '#root/config/ai.js';
import {appConfig} from '#root/config/app.js';
import axios from 'axios';
import {WHATSAPP_TYPES} from '#root/modules/whatsapp/types.js';
import {IWhatsAppService} from '#root/modules/whatsapp/interfaces/IWhatsAppService.js';
import {triggerWebhook} from '#root/modules/answer/utils/triggerWebhook.js';
import {sendEmailNotification} from '#root/utils/mailer.js';
import { LGD_TYPES } from '#root/modules/lgd/types.js';
import { ILocationService } from '#root/modules/lgd/interfaces/ILocationService.js';

@injectable()
export class ChatbotService extends BaseService implements IChatbotService {
  constructor(
    @inject(CHATBOT_TYPES.ChatbotRepository)
    private readonly chatbotRepository: IChatbotRepository,
    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
    @inject(WHATSAPP_TYPES.WhatsAppService)
    private readonly whatsappService: IWhatsAppService,

    @inject (LGD_TYPES.LocationService)
    private readonly lgdService: ILocationService
  ) {
    super(mongoDatabase);
  }

  private drawTable(
    doc: PDFKit.PDFDocument,
    title: string,
    data: any[],
    state?: string,
  ) {
    // console.log('drawing table with state', state);
    const tableConfigs: Record<
      string,
      {
        headers: string[];
        fields: string[];
        widths: number[];
        showTotal?: boolean;
      }
    > = {
      'Monthly Queries': {
        headers: ['Period', 'Query Count'],
        fields: ['period', 'queryCount'],
        widths: [250, 200],
      },

      'Weekly Queries': {
        headers: ['Period', 'Query Count'],
        fields: ['period', 'queryCount'],
        widths: [250, 200],
      },

      'Daily Queries': {
        headers: ['Period', 'Query Count'],
        fields: ['period', 'queryCount'],
        widths: [250, 200],
      },

      'Gender Split': {
        headers: ['Gender', 'Count'],
        fields: ['label', 'count'],
        widths: [250, 200],
        showTotal: true,
      },

      'Farming Experience': {
        headers: ['Experience', 'Number of Farmer'],
        fields: ['label', 'count'],
        widths: [250, 200],
        showTotal: true,
      },

      'Age Group': {
        headers: ['Age', 'Data'],
        fields: ['label', 'count'],
        widths: [250, 200],
        showTotal: true,
      },

      'Query Catagories': {
        headers: ['Query Type', 'Unique', 'Duplicate'],
        fields: ['label', 'questionCount', 'duplicateQuestionCount'],
        widths: [300, 80, 80],
      },

      'Top Crops': {
        headers: ['Crop Name', 'Count'],
        fields: ['name', 'count'],
        widths: [220, 220],
        showTotal: true,
      },
      'Top Faqs': {
        headers: ['Question', 'Count'],
        fields: ['question', 'count'],
        widths: [260, 220],
      },

      'District Analytics': {
        headers: ['District', 'Unique Count', 'Duplicate Count', 'Total'],
        fields: [
          'district',
          'uniqueQuestions',
          'duplicateQuestions',
          'totalQuestions',
        ],
        widths: [180, 110, 110, 80],
      },
      'Positive Feedback': {
        headers: ['Feedback Type', 'Count'],
        fields: ['tag', 'count'],
        widths: [320, 140],
      },

      'Negative Feedback': {
        headers: ['Feedback Type', 'Count'],
        fields: ['tag', 'count'],
        widths: [320, 140],
      },
    };

    const feedbackLabelMap: Record<string, string> = {
      accurate_reliable: 'Accurate and Reliable',

      clear_well_written: 'Clear and Well-Written',

      attention_to_detail: 'Attention to Detail',

      creative_solution: 'Creative Solution',

      inaccurate: 'Inaccurate or Incorrect',

      not_matched: "Didn't Match Question",

      bad_style: 'Poor Style or Tone',

      missing_image: 'Expected an Image',

      unjustified_refusal: 'Refused with Reason',

      not_helpful: 'Lacked Useful Information',
    };

    const analyticsStateLabel =
      state && state !== 'All States'
        ? `District categories of ${state}`
        : 'No state selected';

    const config = tableConfigs[title];

    if (!config) return;

    const startX = 50;
    let currentY = doc.y;
    const rowHeight = 30;

    // ─────────────────────────────────────
    // TITLE
    // ─────────────────────────────────────

    doc.fontSize(16).font('Helvetica-Bold').text(title, startX, currentY);

    currentY += 30;

    let total: number | string;
    if (title === 'District Analytics') {
      doc
        .font('Helvetica')
        .fontSize(11)
        .text(analyticsStateLabel, startX, currentY);

      currentY += 25;
    }

    // ─────────────────────────────────────
    // HEADER DRAWER
    // ─────────────────────────────────────

    const drawHeader = () => {
      let currentX = startX;

      config.headers.forEach((header, index) => {
        const width = config.widths[index];

        doc.rect(currentX, currentY, width, rowHeight).stroke();

        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text(header, currentX + 8, currentY + 8, {
            width: width - 16,
            align: 'left',
          });

        currentX += width;
      });

      currentY += rowHeight;
    };

    drawHeader();

    // ─────────────────────────────────────
    // ROWS
    // ─────────────────────────────────────

    data.forEach(item => {
      // Dynamic row height for long FAQs
      let dynamicRowHeight = rowHeight;

      if (title === 'Top Faqs') {
        dynamicRowHeight = 55;
      }

      // Check BEFORE rendering row
      if (currentY + dynamicRowHeight > 720) {
        doc.addPage();

        currentY = 50;

        // Redraw title
        doc.fontSize(16).font('Helvetica-Bold').text(title, startX, currentY);

        currentY += 30;

        // Redraw analytics state
        if (title === 'District Analytics') {
          doc
            .font('Helvetica')
            .fontSize(11)
            .text(analyticsStateLabel, startX, currentY);

          currentY += 25;
        }

        // Redraw header
        drawHeader();
      }

      let currentX = startX;

      config.fields.forEach((field, index) => {
        const width = config.widths[index];

        doc.rect(currentX, currentY, width, dynamicRowHeight).stroke();

        let value =
          field === 'tag'
            ? (feedbackLabelMap[item[field]] ?? item[field])
            : String(item[field] ?? '-');

        doc
          .font('Helvetica')
          .fontSize(11)
          .text(value, currentX + 8, currentY + 8, {
            width: width - 16,
            align: 'left',
          });

        currentX += width;
      });

      currentY += dynamicRowHeight;
    });

    // ─────────────────────────────────────
    // TOTAL
    // ─────────────────────────────────────

    if (config.showTotal) {
      total = data.reduce((acc, item) => acc + (item.count ?? 0), 0);

      currentY += 10;

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(`$Total = ${total}`, startX + config.widths[0] + 10, currentY);
    }

    doc.moveDown(3);
  }

  private readonly baseUrl =
    'http://' + aiConfig.serverIP + ':' + aiConfig.whatsAppServerPort;
  private readonly WHATSAPP_SERVER_URL = aiConfig.WHATSAPP_SERVER_URL;
  private readonly WA_WEBHOOK_API_KEY = appConfig.WA_WEBHOOK_API_KEY;

  private async getInactiveUsers() {
    try {
      const response = await axios.get(
        `${this.WHATSAPP_SERVER_URL}/whatsapp/users`,
        {
          params: {
            isPaginated: false,
            skip: 0,
            limit: 100,
          },
          headers: {
            'x-internal-api-key': this.WA_WEBHOOK_API_KEY,
          },
        },
      );

      const usersResponse = response.data;

      return usersResponse;
    } catch (error) {
      console.error('Error fetching inactive WhatsApp users:', error);

      throw new InternalServerError('Failed to fetch inactive WhatsApp users');
    }
  }

  async getDashboard(
    days = 30,
    source = 'annam',
    userType = 'all',
    startTime?: string,
    endTime?: string,
    month?: string,
  ): Promise<DashboardResponse> {
    const currentMonth =
      month ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    try {
      const [
        kpi,
        dau,
        // channelSplit,
        // voiceAccuracy,
        // geo,
        // queryCategories,
        dailyQueries,
        todayQueryCount,
        weeklyQueries,
        monthlyQueries,
        avgSessionDurationMin,
        weeklySessionDuration,
        monthlySessionDuration,
        // demographics,
        // kccAndAgri,
        // platformInstalls,
        // domainSpikes,
        // feedbackData,
        // dailyQuestionTrends,
        // topFaqs,
        // topQuestionsFromCollection,
        // responseAdherenceTable,
        dailySummary,
        weeklySummary,
        monthlySummary,
      ] = await Promise.all([
        this.chatbotRepository.getKpiSummary(
          source,
          undefined,
          userType,
          startTime,
          endTime,
        ),
        this.chatbotRepository.getDailyActiveUsers(
          days,
          source,
          undefined,
          userType,
        ),
        //         this.chatbotRepository.getChannelSplit(source),
        //         this.chatbotRepository.getVoiceAccuracyByLanguage(source),
        //         this.chatbotRepository.getGeoDistribution(source),
        //         this.chatbotRepository.getQueryCategories(source, undefined, userType),
        this.chatbotRepository.getDailyAnalytics(
          currentMonth,
          source,
          undefined,
          userType,
        ),
        this.chatbotRepository.getTodayQueryCount(source, undefined, userType),
        this.chatbotRepository.getWeeklyAnalytics(
          currentMonth,
          source,
          undefined,
          userType,
        ),
        this.chatbotRepository.getMonthlyAnalytics(source, undefined, userType),
        this.chatbotRepository.getAvgSessionDurationV2(
          source,
          undefined,
          userType,
        ),
        this.chatbotRepository.getWeeklyAvgSessionDurationV2(
          Math.ceil(days / 7),
          source,
          undefined,
          userType,
        ),
        this.chatbotRepository.getMonthlyAvgSessionDuration(
          Math.ceil(days / 30),
          source,
          undefined,
          userType,
        ),
        // this.chatbotRepository.getUserDemographics(source, undefined, userType),
        // this.chatbotRepository.getKccAndAgriAppStats(
        //   source,
        //   undefined,
        //   userType,
        // ),
        // this.chatbotRepository.getPlatformInstalls(source, undefined, userType),
        //         this.chatbotRepository.getDomainSpikes(60),
        // this.chatbotRepository.getFeedbackData(source, undefined, userType),
        // this.chatbotRepository.getDailyQuestionTrends(
        //   days,
        //   source,
        //   undefined,
        //   userType,
        //   startTime,
        //   endTime,
        // ),
        // this.chatbotRepository.getTopFaqs(
        //   source,
        //   undefined,
        //   userType,
        //   startTime,
        //   endTime,
        // ),
        // this.chatbotRepository.getTopQuestionsFromCollection(
        //   source,
        //   undefined,
        //   userType,
        //   startTime,
        //   endTime,
        // ),
        // this.chatbotRepository
        //   .getResponseAdherenceTable(
        //     undefined,
        //     userType,
        //     startTime,
        //     endTime,
        //     source,
        //   )
        //   .catch(() => ({
        //     date: '',
        //     time: '',
        //     timeWindow: '',
        //     whatsappQueriesAsked: 0,
        //     ajrasakhaQueriesAsked: 0,
        //     whatsappPushedToReviewer: 0,
        //     ajrasakhaPushedToReviewer: 0,
        //     whatsappAnsweredWithin120Min: 0,
        //     ajrasakhaAnsweredWithin120Min: 0,
        //     whatsappMarkedDuplicate: 0,
        //     ajrasakhaMarkedDuplicate: 0,
        //     whatsappDynamicWeather: 0,
        //     ajrasakhaDynamicWeather: 0,
        //     whatsappDynamicMarket: 0,
        //     ajrasakhaDynamicMarket: 0,
        //     whatsappDynamicSchemes: 0,
        //     ajrasakhaDynamicSchemes: 0,
        //     whatsappNonGdbWithin120: 0,
        //     ajrasakhaNonGdbWithin120: 0,
        //     whatsappInReview: 0,
        //     ajrasakhaInReview: 0,
        //     whatsappOpen: 0,
        //     ajrasakhaOpen: 0,
        //     whatsappDelayed: 0,
        //     ajrasakhaDelayed: 0,
        //     whatsappAverageResponseMinutes: 0,
        //     ajrasakhaAverageResponseMinutes: 0,
        //     whatsappAdherencePct: 0,
        //     ajrasakhaAdherencePct: 0,
        //   })),
        this.chatbotRepository.getQuerySummaryByPeriod(
          'daily',
          source,
          undefined,
          userType,
        ),
        this.chatbotRepository.getQuerySummaryByPeriod(
          'weekly',
          source,
          undefined,
          userType,
        ),
        this.chatbotRepository.getQuerySummaryByPeriod(
          'monthly',
          source,
          undefined,
          userType,
        ),
      ]);

      return {
        // Override avgSessionDurationMin in the KPI with the V2 value
        kpi: {...kpi, dailyQueries: todayQueryCount, avgSessionDurationMin},
        dau,
        // channelSplit,
        // voiceAccuracy,
        // geo,
        // queryCategories,
        weeklySessionDuration,
        dailyQueries,
        weeklyQueries,
        monthlyQueries: monthlyQueries,
        monthlySessionDuration,
        // ageGroups: demographics.ageGroups,
        // genderSplit: demographics.genderSplit,
        // farmingExperience: demographics.farmingExperience,
        // // landHolding: demographics.landHolding,
        // kccAwareness: kccAndAgri.kccAwareness,
        // agriAppUsage: kccAndAgri.agriAppUsage,
        // platformInstalls,
        // domainSpikes,
        // feedbackData,
        // dailyQuestionTrends,
        // topFaqs,
        // topQuestionsFromCollection,
        // responseAdherenceTable,
        querySummaries: {
          daily: dailySummary,
          weekly: weeklySummary,
          monthly: monthlySummary,
        },
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch dashboard data: ${error}`);
    }
  }

  async getKpiSummary(source = 'annam', userType = 'all') {
    try {
      return await this.chatbotRepository.getKpiSummary(
        source,
        undefined,
        userType,
      );
    } catch (error) {
      throw new InternalServerError(`Failed to fetch KPI summary: ${error}`);
    }
  }

  async getDailyActiveUsers(
    days = 30,
    source = 'annam',
    userType = 'all',
  ) {
    try {
      return await this.chatbotRepository.getDailyActiveUsers(
        days,
        source,
        undefined,
        userType,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch daily active users: ${error}`,
      );
    }
  }

  async getChannelSplit(source = 'annam') {
    try {
      return await this.chatbotRepository.getChannelSplit(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch channel split: ${error}`);
    }
  }

  async getVoiceAccuracyByLanguage(source = 'annam') {
    try {
      return await this.chatbotRepository.getVoiceAccuracyByLanguage(source);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch voice accuracy: ${error}`);
    }
  }

  async getGeoDistribution(source = 'annam') {
    try {
      return await this.chatbotRepository.getGeoDistribution(source);
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch geo distribution: ${error}`,
      );
    }
  }

  async getQueryCategories(source = 'annam', userType = 'all') {
    try {
      return await this.chatbotRepository.getQueryCategories(
        source,
        undefined,
        userType,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch query categories: ${error}`,
      );
    }
  }

  async getQueryCategoryQuestions(
    category: string,
    questionType: 'all' | 'unique' | 'duplicate' = 'all',
    page = 1,
    limit = 10,
    source = 'annam',
    userType = 'all',
    search?: string,
  ) {
    try {
      return await this.chatbotRepository.getQueryCategoryQuestions(
        category,
        questionType,
        page,
        limit,
        source,
        undefined,
        userType,
        search,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch query category questions: ${error}`,
      );
    }
  }

  async getWeatherConcernAnalytics(
    filters: WeatherConcernAnalyticsFilters = {},
    source = 'annam',
    userType = 'all',
  ) {
    try {
      return await this.chatbotRepository.getWeatherConcernAnalytics(
        filters,
        source,
        undefined,
        userType,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch weather concern analytics: ${error}`,
      );
    }
  }

  async getWeatherConcernQueries(
    filters: WeatherConcernAnalyticsFilters,
    concern: string,
    page = 1,
    limit = 10,
    source: 'annam',
    userType = 'all',
    search?: string,
  ) {
    try {
      return await this.chatbotRepository.getWeatherConcernQueries(
        filters,
        concern,
        page,
        limit,
        source,
        undefined,
        userType,
        search,
      );
    } catch (error) {
      throw new InternalServerError(

        `Failed to fetch weather concern analytics: ${error}`,
      );
    }
  }

  async getFarmerHeatMapAnalytics(
    filters: FarmerHeatMapFilters = {},
  ): Promise<FarmerHeatMapResponse> {
    try {
      return await this.chatbotRepository.getFarmerHeatMapAnalytics(filters);
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch farmer heat map analytics: ${error}`,
      );
    }
  }

  async getDistrictAnalyticsByState(
    state: string,
    selectedStateCode: string,
    source = 'annam',
    userType = 'all',
  ) {
    try {
      const stateCode = Number(selectedStateCode);
      const district = await this.lgdService.getDistricts(stateCode);
      return await this.chatbotRepository.getDistrictAnalyticsByState(
        state,
        district,
        source,
        undefined,
        userType,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch district analytics: ${error}`,
      );
    }
  }

  async getQuestionFromDistrict(
    district: string,
    state: string,
    questionType: 'all' | 'unique' | 'duplicate' = 'all',
    page = 1,
    limit = 10,
    source = 'annam',
    userType = 'all',
    search?: string,
  ): Promise<any> {
    try {
      return await this.chatbotRepository.getQuestionFromDistrict(
        district,
        state,
        questionType,
        page,
        limit,
        source,
        undefined,
        userType,
        search,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch district questions: ${error}`,
      );
    }
  }

  async getTopCrops(source?: string, userType?: string) {
    try {
      return await this.chatbotRepository.getTopCrops(source, userType);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch top crops: ${error}`);
    }
  }

  async getWeeklyAvgSessionDuration(weeks = 52, source = 'annam') {
    try {
      return await this.chatbotRepository.getWeeklyAvgSessionDuration(
        weeks,
        source,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch weekly session duration: ${error}`,
      );
    }
  }

  async getDailyAnalytics(
    month?: string,
    source = 'annam',
    userType = 'all',
  ) {
    try {
      return await this.chatbotRepository.getDailyAnalytics(
        month,
        source,
        undefined,
        userType,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch daily analytics: ${error}`,
      );
    }
  }

  async getTodayQueryCount(source = 'annam', userType = 'all') {
    try {
      return await this.chatbotRepository.getTodayQueryCount(
        source,
        undefined,
        userType,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch today query count: ${error}`,
      );
    }
  }

  async getDailyUserTrend(
    days = 30,
    source = 'annam',
    userType = 'all',
  ) {
    try {
      return await this.chatbotRepository.getDailyUserTrend(
        days,
        source,
        undefined,
        userType,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch daily user trend: ${error}`,
      );
    }
  }

  async getWeeklyAnalytics(
    month?: string,
    source = 'annam',
    userType = 'all',
  ) {
    try {
      return await this.chatbotRepository.getWeeklyAnalytics(
        month,
        source,
        undefined,
        userType,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch weekly analytics: ${error}`,
      );
    }
  }

  async getMonthlyAnalytics(source = 'annam', userType = 'all') {
    try {
      return await this.chatbotRepository.getMonthlyAnalytics(
        source,
        undefined,
        userType,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch monthly analytics: ${error}`,
      );
    }
  }

  async getQueryAnalytics(
    period: 'daily' | 'weekly' | 'monthly',
    options: {
      month?: string;
      year?: number;
      page?: number;
      limit?: number;
      source?: string;
      userType?: string;
    },
  ) {
    const source = options.source ?? 'annam';
    const userType = options.userType ?? 'all';
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, options.limit ?? 10);

    try {
      const rows =
        period === 'daily'
          ? await this.chatbotRepository.getDailyAnalytics(
              options.month,
              source,
              undefined,
              userType,
            )
          : period === 'weekly'
            ? await this.chatbotRepository.getWeeklyAnalytics(
                options.month,
                source,
                undefined,
                userType,
              )
            : await this.chatbotRepository.getMonthlyAnalytics(
                source,
                undefined,
                userType,
                options.year,
              );

      const total = rows.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const startIndex = (page - 1) * limit;
      return {
        data: rows.slice(startIndex, startIndex + limit),
        page,
        limit,
        total,
        totalPages,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch query analytics: ${error}`,
      );
    }
  }

  async getUserDetails(
    startDate?: string,
    endDate?: string,
    page = 1,
    limit = 10,
    search = '',
    source = 'annam',
    crop = '',
    primaryCrops = '',
    secondaryCrops = '',
    village = '',
    state = '',
    district = '',
    block = '',
    profileCompleted = 'all',
    inactiveOnly = false,
    lowFeedbackOnly = false,
    userType = 'all',
    roles = '',
    sortBy = 'totalQuestions',
    sortOrder = 'desc',
    activeTodayByProfile = false,
    missingDemographicField?: string,
    isVerified?: boolean,
  ): Promise<PaginatedUserDetails> {
    try {
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;
      const data = await this.chatbotRepository.getUserDetails(
        start,
        end,
        page,
        limit,
        search,
        source,
        crop,
        primaryCrops,
        secondaryCrops,
        village,
        state,
        district,
        block,
        profileCompleted,
        inactiveOnly,
        undefined,
        userType,
        roles,
        sortBy,
        sortOrder,
        lowFeedbackOnly,
        activeTodayByProfile,
        missingDemographicField,
        isVerified,
      );
      return data;
    } catch (error) {
      throw new InternalServerError(`Failed to fetch user details: ${error}`);
    }
  }

  async getUserQuestionsData(
    userEmail: string,
    source = 'annam',
    userType = 'all',
    page = 1,
    limit = 10,
  ) {
    const user = await this.chatbotRepository.getUserData(userEmail, source);

    // Always fetch messages
    const messages = await this.chatbotRepository.getUsersMessages(
      userEmail,
      source,
      undefined,
      userType,
      page,
      limit,
    );

    // No user found
    if (!user) {
      return {
        questions: {
          total: 0,
          totalPages: 0,
          currentPage: page,
          limit,
          items: [],
        },

        messages,
      };
    }

    const threadIds =
  await this.chatbotRepository.getUserConversationIds(
    user.userId,
    source,
  );

    // Extract messageIds
    const messageIds = await this.chatbotRepository.getAllUserMessageIds(
      userEmail,
      source,
    );

    // No linked messages
    if (!messageIds.length) {
      return {
        questions: {
          total: 0,
          totalPages: 0,
          currentPage: page,
          limit,
          items: [],
        },

        messages,
      };
    }

    // Fetch questions using messageIds
    const questions = await this.chatbotRepository.getUserQuestionsData(
        {
      threadIds,
      messageIds,
      userId: user.userId,
    },
      source,
      userType,
      page,
      limit,
    );

    return {
      questions,
      messages,
    };
  }

  async getAvgSessionDurationV2(source = 'annam', userType = 'all') {
    try {
      return await this.chatbotRepository.getAvgSessionDurationV2(
        source,
        undefined,
        userType,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch avg session duration v2: ${error}`,
      );
    }
  }

  async getWeeklyAvgSessionDurationV2(
    weeks = 52,
    source = 'annam',
    userType = 'all',
  ) {
    try {
      return await this.chatbotRepository.getWeeklyAvgSessionDurationV2(
        weeks,
        source,
        undefined,
        userType,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch weekly avg session duration v2: ${error}`,
      );
    }
  }

  // async generateChatbotExcelReport(
  //   startDate: Date,
  //   endDate: Date,
  //   source = 'annam',
  // ): Promise<ArrayBuffer | null> {
  //   try {
  //     const rows = await this.chatbotRepository.generateChatbotExcelReport(
  //       startDate,
  //       endDate,
  //       source,
  //     );
  //     if (!rows || rows.length === 0) return null;

  //     // ── helpers ─────────────────────────────────────────────────────────────
  //     const safeJson = (raw: any): any => {
  //       try {
  //         return raw ? JSON.parse(raw) : {};
  //       } catch {
  //         return {};
  //       }
  //     };

  //     const truncate = (text: any, maxLen = 32000): string => {
  //       if (!text) return '';
  //       const s = String(text);
  //       return s.length > maxLen ? s.slice(0, maxLen) + '… [TRUNCATED]' : s;
  //     };

  //     const extractLocation = (toolCalls: any[]) => {
  //       for (const tc of toolCalls) {
  //         if (tc.name === 'get_location_info_mcp_weather' && tc.output) {
  //           try {
  //             const out = JSON.parse(tc.output);
  //             const locData = JSON.parse(out[0].text);
  //             const loc = locData?.location ?? {};
  //             return {
  //               state: loc.state ?? '',
  //               district: loc.county ?? '',
  //               city: loc.city ?? '',
  //             };
  //           } catch {
  //             /* skip */
  //           }
  //         }
  //       }
  //       return {state: '', district: '', city: ''};
  //     };

  //     const extractUploadDetails = (toolCalls: any[]) => {
  //       for (const tc of toolCalls) {
  //         if (tc.name === 'upload_question_to_reviewer_system_mcp_pop') {
  //           const args = safeJson(tc.args);
  //           const details = args.details ?? {};
  //           return {
  //             question_en: args.question ?? '',
  //             state: args.state_name ?? '',
  //             crop: args.crop ?? '',
  //             district: details.district ?? '',
  //             season: details.season ?? '',
  //             domain: details.domain ?? '',
  //           };
  //         }
  //       }
  //       return {
  //         question_en: '',
  //         state: '',
  //         crop: '',
  //         district: '',
  //         season: '',
  //         domain: '',
  //       };
  //     };

  //     const extractWeather = (toolCalls: any[]): string => {
  //       for (const tc of toolCalls) {
  //         if (tc.name === 'get_weather_forecast_mcp_weather' && tc.output) {
  //           try {
  //             const out = JSON.parse(tc.output);
  //             return String(out[0]?.text ?? '').slice(0, 500);
  //           } catch {
  //             /* skip */
  //           }
  //         }
  //       }
  //       return '';
  //     };

  //     // ── styling helpers ──────────────────────────────────────────────────────
  //     const HEADER_FILL: ExcelJS.Fill = {
  //       type: 'pattern',
  //       pattern: 'solid',
  //       fgColor: {argb: 'FF1F4E79'},
  //     };
  //     const HEADER_FONT: Partial<ExcelJS.Font> = {
  //       name: 'Calibri',
  //       bold: true,
  //       color: {argb: 'FFFFFFFF'},
  //       size: 11,
  //     };
  //     const CELL_FONT: Partial<ExcelJS.Font> = {name: 'Calibri', size: 10};
  //     const WRAP_ALIGN: Partial<ExcelJS.Alignment> = {
  //       wrapText: true,
  //       vertical: 'top',
  //     };
  //     const CENTER_ALIGN: Partial<ExcelJS.Alignment> = {
  //       horizontal: 'center',
  //       vertical: 'middle',
  //       wrapText: true,
  //     };
  //     const THIN_BORDER: Partial<ExcelJS.Borders> = {
  //       left: {style: 'thin'},
  //       right: {style: 'thin'},
  //       top: {style: 'thin'},
  //       bottom: {style: 'thin'},
  //     };

  //     const styleHeader = (sheet: ExcelJS.Worksheet) => {
  //       const row = sheet.getRow(1);
  //       row.eachCell(cell => {
  //         cell.font = HEADER_FONT;
  //         cell.fill = HEADER_FILL;
  //         cell.alignment = CENTER_ALIGN;
  //         cell.border = THIN_BORDER;
  //       });
  //       sheet.autoFilter = {
  //         from: {row: 1, column: 1},
  //         to: {row: 1, column: sheet.columnCount},
  //       };
  //       sheet.views = [{state: 'frozen', ySplit: 1}];
  //     };

  //     const autoWidth = (sheet: ExcelJS.Worksheet, max = 60) => {
  //       sheet.columns.forEach(col => {
  //         let best = 12;
  //         col.eachCell?.({includeEmpty: false}, cell => {
  //           const lines = String(cell.value ?? '').split('\n');
  //           const longest = Math.max(...lines.map(l => l.length));
  //           best = Math.max(best, Math.min(longest + 2, max));
  //         });
  //         col.width = best;
  //       });
  //     };

  //     // ── workbook setup ───────────────────────────────────────────────────────
  //     const wb = new ExcelJS.Workbook();

  //     const ws1 = wb.addWorksheet('Conversations');
  //     ws1.columns = [
  //       {header: 'S.No', key: 'sno', width: 6},
  //       {header: 'Conversation ID', key: 'convId', width: 36},
  //       {header: 'User Question (Original)', key: 'userQ', width: 40},
  //       {header: 'User Question (English)', key: 'userQEn', width: 40},
  //       {header: 'State', key: 'state', width: 16},
  //       {header: 'District', key: 'district', width: 16},
  //       {header: 'Crop', key: 'crop', width: 16},
  //       {header: 'Season', key: 'season', width: 14},
  //       {header: 'Domain', key: 'domain', width: 18},
  //       {header: 'Location – State', key: 'locState', width: 16},
  //       {header: 'Location – District', key: 'locDistrict', width: 16},
  //       {header: 'Location – City', key: 'locCity', width: 16},
  //       {header: 'Number of Tool Calls', key: 'toolCount', width: 12},
  //       {header: 'Tool Names Used', key: 'toolNames', width: 40},
  //       {header: 'Number of Think Steps', key: 'thinkCount', width: 12},
  //       {header: 'Bot Response (Final Text)', key: 'botResponse', width: 60},
  //       {header: 'Weather Forecast Preview', key: 'weather', width: 40},
  //     ];

  //     const ws2 = wb.addWorksheet('Tool Calls');
  //     ws2.columns = [
  //       {header: 'S.No', key: 'sno', width: 6},
  //       {header: 'Conversation ID', key: 'convId', width: 36},
  //       {header: 'User Question (Original)', key: 'userQ', width: 30},
  //       {header: 'Tool Call Order', key: 'order', width: 10},
  //       {header: 'Tool Name', key: 'name', width: 40},
  //       {header: 'Tool Call ID', key: 'id', width: 30},
  //       {header: 'Arguments (JSON)', key: 'args', width: 40},
  //       {header: 'Progress', key: 'progress', width: 10},
  //       {header: 'Output Preview', key: 'output', width: 50},
  //     ];

  //     const ws3 = wb.addWorksheet('Reviewer Data');
  //     ws3.columns = [
  //       {header: 'S.No', key: 'sno', width: 6},
  //       {header: 'Conversation ID', key: 'convId', width: 36},
  //       {header: 'User Question (Original)', key: 'userQ', width: 30},
  //       {header: 'Reviewer Question ID', key: 'qId', width: 26},
  //       {header: 'Reviewer Question Text', key: 'qText', width: 40},
  //       {header: 'Reviewer Answer Text', key: 'aText', width: 50},
  //       {header: 'Author', key: 'author', width: 18},
  //       {header: 'Similarity Score', key: 'score', width: 14},
  //       {header: 'Source 1 Name', key: 's1Name', width: 24},
  //       {header: 'Source 1 Link', key: 's1Link', width: 40},
  //       {header: 'Source 2 Name', key: 's2Name', width: 24},
  //       {header: 'Source 2 Link', key: 's2Link', width: 40},
  //     ];

  //     const ws4 = wb.addWorksheet('FAQ Videos');
  //     ws4.columns = [
  //       {header: 'S.No', key: 'sno', width: 6},
  //       {header: 'Conversation ID', key: 'convId', width: 36},
  //       {header: 'User Question (Original)', key: 'userQ', width: 30},
  //       {header: 'FAQ Title', key: 'title', width: 30},
  //       {header: 'FAQ Link', key: 'link', width: 40},
  //       {header: 'FAQ Query', key: 'query', width: 30},
  //       {header: 'FAQ English Answer', key: 'answer', width: 50},
  //       {header: 'Similarity Score', key: 'score', width: 14},
  //     ];

  //     const ws5 = wb.addWorksheet('POP Data');
  //     ws5.columns = [
  //       {header: 'S.No', key: 'sno', width: 6},
  //       {header: 'Conversation ID', key: 'convId', width: 36},
  //       {header: 'User Question (Original)', key: 'userQ', width: 30},
  //       {header: 'POP Text', key: 'text', width: 50},
  //       {header: 'Similarity Score', key: 'score', width: 14},
  //       {header: 'Page No', key: 'page', width: 10},
  //       {header: 'Source', key: 'source', width: 40},
  //       {header: 'Source Name', key: 'sourceName', width: 24},
  //       {header: 'Topics', key: 'topics', width: 30},
  //     ];

  //     const ws6 = wb.addWorksheet('Golden Data');
  //     ws6.columns = [
  //       {header: 'S.No', key: 'sno', width: 6},
  //       {header: 'Conversation ID', key: 'convId', width: 36},
  //       {header: 'User Question (Original)', key: 'userQ', width: 30},
  //       {header: 'Golden Question Text', key: 'qText', width: 40},
  //       {header: 'Golden Answer Text', key: 'aText', width: 50},
  //       {header: 'Author', key: 'author', width: 18},
  //       {header: 'Similarity Score', key: 'score', width: 14},
  //       {header: 'Source Name', key: 'sName', width: 24},
  //       {header: 'Source Link', key: 'sLink', width: 40},
  //     ];

  //     let tcRow = 2,
  //       revRow = 2,
  //       faqRow = 2,
  //       popRow = 2,
  //       goldRow = 2;

  //     rows.forEach((item, idx) => {
  //       const convId = item.conversationId;
  //       const userQ =
  //         item.farmerQuestions.find(t => t && t.trim().length > 0) ?? '';
  //       const contentBlocks: any[] =
  //         Array.isArray(item.mcpToolCalls) && item.mcpToolCalls.length > 0
  //           ? Array.isArray(item.mcpToolCalls[0])
  //             ? item.mcpToolCalls[0]
  //             : []
  //           : [];

  //       // classify content blocks
  //       const toolCallsRaw: any[] = [];
  //       const thinkTexts: string[] = [];
  //       const responseTexts: string[] = [];

  //       for (const block of contentBlocks) {
  //         if (!block || typeof block !== 'object') continue;
  //         if (block.type === 'tool_call' && block.tool_call) {
  //           toolCallsRaw.push({
  //             id: block.tool_call.id ?? '',
  //             name: block.tool_call.name ?? '',
  //             args: block.tool_call.args ?? '',
  //             progress: block.tool_call.progress ?? '',
  //             output: block.tool_call.output ?? '',
  //           });
  //         } else if (block.type === 'think') {
  //           thinkTexts.push(block.think ?? '');
  //         } else if (block.type === 'text') {
  //           responseTexts.push(block.text ?? '');
  //         }
  //       }

  //       const uploadInfo = extractUploadDetails(toolCallsRaw);
  //       const loc = extractLocation(toolCallsRaw);
  //       const weatherPreview = extractWeather(toolCallsRaw);
  //       const toolNames = toolCallsRaw.map(tc => tc.name).join(', ');
  //       const finalResponse = responseTexts.join('\n\n---\n\n');

  //       // Sheet 1
  //       ws1.addRow({
  //         sno: idx + 1,
  //         convId,
  //         userQ: truncate(userQ, 10000),
  //         userQEn: truncate(uploadInfo.question_en, 10000),
  //         state: uploadInfo.state,
  //         district: uploadInfo.district,
  //         crop: uploadInfo.crop,
  //         season: uploadInfo.season,
  //         domain: uploadInfo.domain,
  //         locState: loc.state,
  //         locDistrict: loc.district,
  //         locCity: loc.city,
  //         toolCount: toolCallsRaw.length,
  //         toolNames,
  //         thinkCount: thinkTexts.length,
  //         botResponse: truncate(finalResponse),
  //         weather: truncate(weatherPreview, 5000),
  //       });

  //       // Sheet 2
  //       toolCallsRaw.forEach((tc, order) => {
  //         let outputText = '';
  //         if (tc.output) {
  //           try {
  //             const parsed = JSON.parse(tc.output);
  //             outputText =
  //               Array.isArray(parsed) && parsed.length > 0
  //                 ? (parsed[0].text ?? String(parsed))
  //                 : String(parsed);
  //           } catch {
  //             outputText = String(tc.output);
  //           }
  //         }
  //         ws2.addRow({
  //           sno: tcRow - 1,
  //           convId,
  //           userQ: truncate(userQ, 2000),
  //           order: order + 1,
  //           name: tc.name,
  //           id: tc.id,
  //           args: truncate(tc.args, 5000),
  //           progress: tc.progress,
  //           output: truncate(outputText, 5000),
  //         });
  //         tcRow++;
  //       });

  //       // Sheet 3
  //       toolCallsRaw.forEach(tc => {
  //         if (
  //           tc.name === 'get_context_from_reviewer_dataset_mcp_reviewer' &&
  //           tc.output
  //         ) {
  //           try {
  //             const out = JSON.parse(tc.output);
  //             const results = JSON.parse(out[0].text);
  //             if (Array.isArray(results)) {
  //               results.forEach((r: any) => {
  //                 const sources = r.sources ?? [];
  //                 ws3.addRow({
  //                   sno: revRow - 1,
  //                   convId,
  //                   userQ: truncate(userQ, 2000),
  //                   qId: r.question_id ?? '',
  //                   qText: truncate(r.question_text ?? '', 10000),
  //                   aText: truncate(r.answer_text ?? ''),
  //                   author: r.author ?? '',
  //                   score: r.similarity_score ?? '',
  //                   s1Name:
  //                     sources[0]?.source_name ?? sources[0]?.sourceName ?? '',
  //                   s1Link: sources[0]?.source ?? '',
  //                   s2Name:
  //                     sources[1]?.source_name ?? sources[1]?.sourceName ?? '',
  //                   s2Link: sources[1]?.source ?? '',
  //                 });
  //                 revRow++;
  //               });
  //             }
  //           } catch {
  //             /* skip */
  //           }
  //         }
  //       });

  //       // Sheet 4
  //       toolCallsRaw.forEach(tc => {
  //         if (tc.name === 'search_faq_mcp_faq-videos' && tc.output) {
  //           try {
  //             const out = JSON.parse(tc.output);
  //             const faqData = JSON.parse(out[0].text);
  //             const results = faqData.results ?? [];
  //             results.forEach((r: any) => {
  //               ws4.addRow({
  //                 sno: faqRow - 1,
  //                 convId,
  //                 userQ: truncate(userQ, 2000),
  //                 title: r.title ?? '',
  //                 link: r.link ?? '',
  //                 query: r.query ?? '',
  //                 answer: truncate(r.english_answer ?? '', 10000),
  //                 score: r.similarity_score ?? '',
  //               });
  //               faqRow++;
  //             });
  //           } catch {
  //             /* skip */
  //           }
  //         }
  //       });

  //       // Sheet 5
  //       toolCallsRaw.forEach(tc => {
  //         if (
  //           tc.name === 'get_context_from_package_of_practices_mcp_pop' &&
  //           tc.output
  //         ) {
  //           try {
  //             const out = JSON.parse(tc.output);
  //             const results = JSON.parse(out[0].text);
  //             if (Array.isArray(results)) {
  //               results.forEach((r: any) => {
  //                 const meta = r.meta_data ?? {};
  //                 ws5.addRow({
  //                   sno: popRow - 1,
  //                   convId,
  //                   userQ: truncate(userQ, 2000),
  //                   text: truncate(r.text ?? ''),
  //                   score: meta.similarity_score ?? '',
  //                   page: meta.page_no ?? '',
  //                   source: meta.source ?? '',
  //                   sourceName: meta.source_name ?? '',
  //                   topics: Array.isArray(meta.topics)
  //                     ? meta.topics.join(', ')
  //                     : '',
  //                 });
  //                 popRow++;
  //               });
  //             }
  //           } catch {
  //             /* skip */
  //           }
  //         }
  //       });

  //       // Sheet 6
  //       toolCallsRaw.forEach(tc => {
  //         if (
  //           tc.name === 'get_context_from_golden_dataset_mcp_golden' &&
  //           tc.output
  //         ) {
  //           try {
  //             const out = JSON.parse(tc.output);
  //             const results = JSON.parse(out[0].text ?? '');
  //             if (Array.isArray(results)) {
  //               results.forEach((r: any) => {
  //                 const sources = r.sources ?? [];
  //                 ws6.addRow({
  //                   sno: goldRow - 1,
  //                   convId,
  //                   userQ: truncate(userQ, 2000),
  //                   qText: truncate(r.question_text ?? '', 10000),
  //                   aText: truncate(r.answer_text ?? ''),
  //                   author: r.author ?? '',
  //                   score: r.similarity_score ?? '',
  //                   sName:
  //                     sources[0]?.source_name ?? sources[0]?.sourceName ?? '',
  //                   sLink: sources[0]?.source ?? '',
  //                 });
  //                 goldRow++;
  //               });
  //             }
  //           } catch {
  //             /* skip */
  //           }
  //         }
  //       });
  //     });

  //     // Style all sheets
  //     [ws1, ws2, ws3, ws4, ws5, ws6].forEach(ws => {
  //       styleHeader(ws);
  //       ws.eachRow((row, rowNum) => {
  //         if (rowNum === 1) return;
  //         row.eachCell(cell => {
  //           cell.font = CELL_FONT;
  //           cell.alignment = WRAP_ALIGN;
  //           cell.border = THIN_BORDER;
  //         });
  //       });
  //       autoWidth(ws);
  //     });

  //     return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
  //   } catch (error) {
  //     throw new InternalServerError(
  //       `Failed to generate chatbot Excel report: ${error}`,
  //     );
  //   }
  // }

  async generateChatbotAnalyticsExcelReport(
    startDate: Date,
    endDate: Date,
    state: string,
    source = 'annam',
    userType = 'all',
    month?: string,
  ): Promise<ArrayBuffer | null> {
    try {
      // ─────────────────────────────────────────────────────────────
      // FETCH REPORT DATA
      // ─────────────────────────────────────────────────────────────

      const states =await this.lgdService.getStates();
      const selectedState = states.find(s => s.stateNameEnglish === state);
      const districts = await this.lgdService.getDistricts(selectedState.stateCode);
      const reportData = await this.chatbotRepository.generateChatBotData(
        startDate,
        endDate,
        30,
        userType,
        undefined,
        districts,
        state,
        source,
      );

      if (!reportData) return null;


      // ─────────────────────────────────────────────────────────────
      // WORKBOOK SETUP
      // ─────────────────────────────────────────────────────────────

      const wb = new ExcelJS.Workbook();

      wb.creator = 'Chatbot Analytics System';
      wb.created = new Date();

      // ─────────────────────────────────────────────────────────────
      // STYLES
      // ─────────────────────────────────────────────────────────────

      const HEADER_FILL: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {argb: 'FF1F4E79'},
      };

      const HEADER_FONT: Partial<ExcelJS.Font> = {
        name: 'Calibri',
        bold: true,
        color: {argb: 'FFFFFFFF'},
        size: 11,
      };

      const CELL_FONT: Partial<ExcelJS.Font> = {
        name: 'Calibri',
        size: 10,
      };

      const WRAP_ALIGN: Partial<ExcelJS.Alignment> = {
        wrapText: true,
        vertical: 'middle',
      };

      const CENTER_ALIGN: Partial<ExcelJS.Alignment> = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };

      const THIN_BORDER: Partial<ExcelJS.Borders> = {
        left: {style: 'thin'},
        right: {style: 'thin'},
        top: {style: 'thin'},
        bottom: {style: 'thin'},
      };

      const styleHeader = (sheet: ExcelJS.Worksheet) => {
        const row = sheet.getRow(1);

        row.eachCell(cell => {
          cell.font = HEADER_FONT;
          cell.fill = HEADER_FILL;
          cell.alignment = CENTER_ALIGN;
          cell.border = THIN_BORDER;
        });

        sheet.views = [{state: 'frozen', ySplit: 1}];

        sheet.autoFilter = {
          from: {row: 1, column: 1},
          to: {row: 1, column: sheet.columnCount},
        };
      };

      const styleRows = (sheet: ExcelJS.Worksheet) => {
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;

          row.eachCell(cell => {
            cell.font = CELL_FONT;
            cell.alignment = WRAP_ALIGN;
            cell.border = THIN_BORDER;
          });
        });
      };

      const autoWidth = (sheet: ExcelJS.Worksheet, max = 40) => {
        sheet.columns.forEach(column => {
          let width = 12;

          column.eachCell?.({includeEmpty: false}, cell => {
            const cellLength = String(cell.value ?? '').length;
            width = Math.max(width, Math.min(cellLength + 2, max));
          });

          column.width = width;
        });
      };

      // ─────────────────────────────────────────────────────────────
      // SUMMARY SHEET
      // ─────────────────────────────────────────────────────────────

      const summarySheet = wb.addWorksheet('Summary');

      summarySheet.columns = [
        {header: 'Metric', key: 'metric', width: 30},
        {header: 'Value', key: 'value', width: 20},
      ];

      summarySheet.addRows([
        {
          metric: 'Total Downloads',
          value: reportData.totalDownloads ?? 0,
        },
        {
          metric: 'Average Session Duration',
          value: reportData.averageSession ?? 0,
        },
        {
          metric: 'Daily Active Users',
          value: reportData.dau ?? 0,
        },
        {metric: 'Total Feedbacks', value: reportData.feedback},
        {
          metric: 'Total Positive Feedback',
          value: reportData.positiveFeedBackCount,
        },
        {
          metric: 'Total Negative Feedback',
          value: reportData.negativeFeedBackCount,
        },
        {
          metric: 'Positive Percentage',
          value: reportData.feedbackAccpetancePct,
        },
      ]);

      // ─────────────────────────────────────────────────────────────
      // MONTHLY QUERIES SHEET
      // ─────────────────────────────────────────────────────────────

      const monthlySheet = wb.addWorksheet('Monthly Queries');

      monthlySheet.columns = [
        {header: 'Month', key: 'month', width: 20},
        {header: 'Total Queries', key: 'queries', width: 20},
      ];

      (reportData.monthlyQueries || []).forEach((item: any) => {
        monthlySheet.addRow({
          month: item.period ?? '',
          queries: item.queryCount ?? 0,
        });
      });

      // ─────────────────────────────────────────────────────────────
      // WEEKLY QUERIES SHEET
      // ─────────────────────────────────────────────────────────────

      const weeklySheet = wb.addWorksheet('Weekly Queries');

      weeklySheet.columns = [
        {header: 'Week', key: 'week', width: 20},
        {header: 'Total Queries', key: 'queries', width: 20},
      ];

      (reportData.weeklyQueries || []).forEach((item: any) => {
        weeklySheet.addRow({
          week: item.period ?? '',
          queries: item.queryCount ?? 0,
        });
      });

      // ─────────────────────────────────────────────────────────────
      // DAILY QUERIES SHEET
      // ─────────────────────────────────────────────────────────────

      const dailySheet = wb.addWorksheet('Daily Queries');

      dailySheet.columns = [
        {header: 'Date', key: 'date', width: 20},
        {header: 'Total Queries', key: 'queries', width: 20},
      ];

      (reportData.dailyQueries || []).forEach((item: any) => {
        dailySheet.addRow({
          date: item.period ?? '',
          queries: item.queryCount ?? 0,
        });
      });

      const demographicsSheet = wb.addWorksheet('Demographics');

      const addDemographicTable = (
        sheet: ExcelJS.Worksheet,
        title: string,
        headers: string[],
        data: any[],
        startRow: number,
      ) => {
        // Title
        sheet.mergeCells(`A${startRow}:B${startRow}`);

        const titleCell = sheet.getCell(`A${startRow}`);

        titleCell.value = title;

        titleCell.font = {
          bold: true,
          size: 14,
        };

        titleCell.alignment = {
          vertical: 'middle',
        };

        // Header Row
        const headerRow = sheet.getRow(startRow + 1);

        headers.forEach((header, index) => {
          const cell = headerRow.getCell(index + 1);

          cell.value = header;

          cell.font = HEADER_FONT;

          cell.fill = HEADER_FILL;

          cell.alignment = CENTER_ALIGN;

          cell.border = THIN_BORDER;
        });

        // Data Rows
        data.forEach((item, idx) => {
          const row = sheet.getRow(startRow + 2 + idx);

          row.getCell(1).value = item.label ?? '';

          row.getCell(2).value = item.count ?? 0;

          row.eachCell(cell => {
            cell.font = CELL_FONT;
            cell.alignment = WRAP_ALIGN;
            cell.border = THIN_BORDER;
          });
        });

        // Total Row
        const total = data.reduce((acc, item) => acc + (item.count ?? 0), 0);

        const totalRow = sheet.getRow(startRow + 2 + data.length);

        totalRow.getCell(2).value = `Total = ${total}`;

        totalRow.getCell(2).font = {
          italic: true,
          bold: true,
          size: 10,
        };

        return startRow + data.length + 5;
      };

      let currentRow = 1;

      currentRow = addDemographicTable(
        demographicsSheet,
        'Gender Split',
        ['Gender', 'Count'],
        reportData.genderSplit || [],
        currentRow,
      );

      currentRow = addDemographicTable(
        demographicsSheet,
        'Farming Experience',
        ['Experience', 'Number of Farmers'],
        reportData.farmingExperience || [],
        currentRow,
      );

      demographicsSheet.columns = [{width: 30}, {width: 25}];

      currentRow = addDemographicTable(
        demographicsSheet,
        'Age Group',
        ['Age', 'Count'],
        reportData.ageGroup || [],
        currentRow,
      );

      const queryCategorySheet = wb.addWorksheet('Query Categories');

      queryCategorySheet.columns = [
        {
          header: 'Query Type',
          key: 'label',
          width: 40,
        },
        {
          header: 'Unique Queries',
          key: 'unique',
          width: 20,
        },
        {
          header: 'Duplicate Queries',
          key: 'duplicate',
          width: 20,
        },
      ];

      (reportData.queryCatagoryData || []).forEach((item: any) => {
        queryCategorySheet.addRow({
          label: item.label ?? '',
          unique: item.questionCount ?? 0,
          duplicate: item.duplicateQuestionCount ?? 0,
        });
      });

      const cropsSheet = wb.addWorksheet('Top Crops');

      cropsSheet.columns = [
        {
          header: 'Crop Name',
          key: 'name',
          width: 35,
        },
        {
          header: 'Count',
          key: 'count',
          width: 15,
        },
      ];

      (reportData.topCrops?.topCrops || []).forEach((item: any) => {
        cropsSheet.addRow({
          name: item.name ?? '',
          count: item.count ?? 0,
        });
      });

      const faqSheet = wb.addWorksheet('Top FAQs');

      faqSheet.columns = [
        {
          header: 'Question',
          key: 'question',
          width: 80,
        },
        {
          header: 'Count',
          key: 'count',
          width: 15,
        },
      ];

      (reportData.topTenFaqs || []).forEach((item: any) => {
        faqSheet.addRow({
          question: item.question ?? '',
          count: item.count ?? 0,
        });
      });

      const analyticsSheet = wb.addWorksheet('District Analytics');

      analyticsSheet.columns = [
        {
          header: 'District',
          key: 'district',
          width: 35,
        },
        {
          header: 'Unique Questions',
          key: 'unique',
          width: 20,
        },
        {
          header: 'Duplicate Questions',
          key: 'duplicate',
          width: 20,
        },
        {
          header: 'Total Questions',
          key: 'total',
          width: 20,
        },
      ];

      analyticsSheet.addRow({
        district: `${state === 'All States' ? 'N/A' : state}`,
      });

      (reportData.districtAnalytics || []).forEach((item: any) => {
        analyticsSheet.addRow({
          district: item.district ?? '',
          unique: item.uniqueQuestions ?? 0,
          duplicate: item.duplicateQuestions ?? 0,
          total: item.totalQuestions ?? 0,
        });
      });

      const feedbackSheet = wb.addWorksheet('Feedback');

      const feedbackLabelMap: Record<string, string> = {
        accurate_reliable: 'Accurate and Reliable',

        clear_well_written: 'Clear and Well-Written',

        attention_to_detail: 'Attention to Detail',

        creative_solution: 'Creative Solution',

        inaccurate: 'Inaccurate or Incorrect',

        not_matched: "Didn't Match Question",

        bad_style: 'Poor Style or Tone',

        missing_image: 'Expected an Image',

        unjustified_refusal: 'Refused with Reason',

        not_helpful: 'Lacked Useful Information',
      };

      feedbackSheet.mergeCells('A1:B1');

      feedbackSheet.getCell('A1').value = 'Positive Feedback';

      feedbackSheet.getCell('A1').font = {
        bold: true,
        size: 14,
      };

      feedbackSheet.columns = [
        {
          header: 'Feedback Type',
          key: 'type',
          width: 40,
        },
        {
          header: 'Count',
          key: 'count',
          width: 15,
        },
      ];

      feedbackSheet.addRow(['Feedback Type', 'Count']);

      (reportData.positiveFeedback || []).forEach((item: any) => {
        feedbackSheet.addRow({
          type: feedbackLabelMap[item.tag] ?? item.tag,
          count: item.count ?? 0,
        });
      });

      const negativeStartRow = feedbackSheet.rowCount + 3;

      feedbackSheet.mergeCells(`A${negativeStartRow}:B${negativeStartRow}`);

      feedbackSheet.getCell(`A${negativeStartRow}`).value = 'Negative Feedback';

      feedbackSheet.getCell(`A${negativeStartRow}`).font = {
        bold: true,
        size: 14,
      };

      const negativeHeaderRow = feedbackSheet.getRow(negativeStartRow + 1);

      negativeHeaderRow.getCell(1).value = 'Feedback Type';

      negativeHeaderRow.getCell(2).value = 'Count';

      (reportData.negativeFeedback || []).forEach((item: any, idx: number) => {
        const row = feedbackSheet.getRow(negativeStartRow + 2 + idx);

        row.getCell(1).value = feedbackLabelMap[item.tag] ?? item.tag;

        row.getCell(2).value = item.count ?? 0;
      });

      // ─────────────────────────────────────────────────────────────
      // STYLE ALL SHEETS
      // ─────────────────────────────────────────────────────────────

      [
        summarySheet,
        monthlySheet,
        weeklySheet,
        dailySheet,
        demographicsSheet,
        queryCategorySheet,
        cropsSheet,
        faqSheet,
        analyticsSheet,
        feedbackSheet,
      ].forEach(sheet => {
        styleHeader(sheet);
        styleRows(sheet);
        autoWidth(sheet);
      });

      // ─────────────────────────────────────────────────────────────
      // RETURN BUFFER
      // ─────────────────────────────────────────────────────────────

      return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
    } catch (error) {
      throw new InternalServerError(
        `Failed to generate chatbot analytics Excel report: ${error}`,
      );
    }
  }

  async generateChatbotAnalyticsPdfReport(
    startDate: Date,
    endDate: Date,
    state: string,
    source = 'annam',
    userType = 'all',
    month?: string,
  ): Promise<Buffer> {
    try {
      const reportData = await this.chatbotRepository.generateChatBotData(
        startDate,
        endDate,
        30,
        source,
        userType,
        undefined,
        state,
      );


      // const inactiveUsers = await this.getInactiveUsers()
      // console.log("Inactive users list", inactiveUsers);
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
      });

      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));

      const pdfPromise = new Promise<Buffer>(resolve => {
        doc.on('end', () => {
          resolve(Buffer.concat(buffers));
        });
      });

      // ─────────────────────────────────────
      // TITLE
      // ─────────────────────────────────────

      doc.fontSize(20).text('Chatbot Analytics Report', {
        align: 'center',
      });

      doc.moveDown(2);

      // ─────────────────────────────────────
      // SUMMARY
      // ─────────────────────────────────────

      doc.fontSize(16).text('Summary', {
        underline: true,
      });

      doc.moveDown();

      doc.fontSize(12);

      doc.text(`Total Downloads: ${reportData.totalDownloads ?? 0}`);

      doc.text(
        `Average Session Duration: ${reportData.averageSession ?? 0} min`,
      );

      doc.text(`Daily Active Users: ${reportData.dau ?? 0}`);

      doc.text(`Total Feedbacks: ${reportData.feedback ?? 0}`);

      doc.text(
        `Total positive feedback: ${reportData.positiveFeedBackCount ?? 0}`,
      );

      doc.text(
        `Total negative feedback: ${reportData.negativeFeedBackCount ?? 0}`,
      );

      doc.text(
        `Average Acceptance percentage: ${reportData.feedbackAccpetancePct ?? 0}%`,
      );

      doc.moveDown(2);

      // ─────────────────────────────────────
      // MONTHLY QUERIES
      // ─────────────────────────────────────

      // doc.fontSize(16).text('Monthly Queries', {
      //   underline: true,
      // });

      // doc.moveDown();

      this.drawTable(doc, 'Monthly Queries', reportData.monthlyQueries || []);

      // doc.moveDown(2);

      // ─────────────────────────────────────
      // WEEKLY QUERIES
      // ─────────────────────────────────────

      // doc.fontSize(16).text('Weekly Queries', {
      //   underline: true,
      // });

      // doc.moveDown();

      this.drawTable(doc, 'Weekly Queries', reportData.weeklyQueries || []);

      // doc.moveDown(2);

      // ─────────────────────────────────────
      // DAILY QUERIES
      // ─────────────────────────────────────

      // doc.fontSize(16).text('Daily Queries', {
      //   underline: true,
      // });

      // doc.moveDown();

      this.drawTable(doc, 'Daily Queries', reportData.dailyQueries || []);

      // doc.moveDown(2)

      // doc.moveDown();

      this.drawTable(doc, 'Gender Split', reportData.genderSplit || []);

      // doc.moveDown(2)

      // doc.moveDown();

      this.drawTable(
        doc,
        'Farming Experience',
        reportData.farmingExperience || [],
      );

      // doc.moveDown(2)

      // doc.moveDown();

      this.drawTable(doc, 'Age Group', reportData.ageGroup || []);

      // doc.moveDown(2)

      this.drawTable(
        doc,
        'Query Catagories',
        reportData.queryCatagoryData || [],
      );

      this.drawTable(doc, 'Top Crops', reportData.topCrops.topCrops || []);

      this.drawTable(doc, 'Top Faqs', reportData.topTenFaqs || []);

      this.drawTable(
        doc,
        'District Analytics',
        reportData.districtAnalytics || [],
        state,
      );

      this.drawTable(
        doc,
        'Positive Feedback',
        reportData.positiveFeedback || [],
      );

      this.drawTable(
        doc,
        'Negative Feedback',
        reportData.negativeFeedback || [],
      );

      doc.end();

      return pdfPromise;
    } catch (error) {
      throw new InternalServerError(
        `Failed to generate chatbot analytics PDF report: ${error}`,
      );
    }
  }

  async getGrowth(
    source: string,
    userType: string,
    range: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<GrowthResponse> {
    return await this._withTransaction(async session => {
      const resolvedEndDate = endDate ? new Date(endDate) : new Date();
      const resolvedStartDate = startDate ? new Date(startDate) : new Date();
      if (source === 'whatsapp') {
        return this.getWhatsappUserGrowth(resolvedStartDate, resolvedEndDate);
      }
      if (!startDate) {
        resolvedStartDate.setDate(resolvedEndDate.getDate() - range);
      }

      const labels =
        startDate && endDate
          ? getDateLabelsBetween(resolvedStartDate, resolvedEndDate)
          : getDateRange(range);

      const [idsData, installsData, activeUsersData] = await Promise.all([
        this.chatbotRepository.getIdsCreated(
          userType,
          resolvedStartDate,
          resolvedEndDate,
          session,
        ),
        this.chatbotRepository.getInstalls(
          userType,
          resolvedStartDate,
          resolvedEndDate,
          session,
        ),
        this.chatbotRepository.getActiveUsers(
          userType,
          resolvedStartDate,
          resolvedEndDate,
          session,
        ),
      ]);
      return {
        labels,
        series: {
          idsCreated: mapToSeries(labels, idsData),
          installs: mapToSeries(labels, installsData),
          activeUsers: mapToSeries(labels, activeUsersData),
        },
      };
    });
  }

  async getDuplicateQuestions(source = 'annam') {
    try {
      return await this.chatbotRepository.getDuplicateQuestions(source);
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch duplicate questions: ${error}`,
      );
    }
  }

  async getDomainSpikes(days = 60) {
    try {
      return await this.chatbotRepository.getDomainSpikes(days);
    } catch (error) {
      throw new InternalServerError(`Failed to fetch domain spikes: ${error}`);
    }
  }

  async getDailyQuestionTrends(
    days = 30,
    source?: string,
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ) {
    try {
      return await this.chatbotRepository.getDailyQuestionTrends(
        days,
        source,
        undefined,
        userType,
        startTime,
        endTime,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch daily question trends: ${error}`,
      );
    }
  }

  async getTopFaqs(
    source = 'annam',
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ) {
    try {
      return await this.chatbotRepository.getTopFaqs(
        source,
        undefined,
        userType,
        startTime,
        endTime,
      );
    } catch (error) {
      throw new InternalServerError(`Failed to fetch top FAQs: ${error}`);
    }
  }

  async getUserById(userId: string, source: string): Promise<any> {
    return this.chatbotRepository.getUserById(userId, source);
  }

  async deleteUser(userId: string, source: string): Promise<boolean> {
    try {
      return await this.chatbotRepository.deleteUser(userId, source);
    } catch (error) {
      throw new InternalServerError(`Failed to delete user: ${error}`);
    }
  }

  async updateUser(
    userId: string,
    source: string,
    data: {
      name?: string;
      userRole?: string;
      farmerProfile?: {
        farmerName?: string;
        age?: number;
        gender?: string;
        villageName?: string;
        blockName?: string;
        district?: string;
        state?: string;
        phoneNo?: string;
        nearestKVK?: string;
        languagePreference?: string;
        yearsOfExperience?: number;
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
  ): Promise<boolean> {
    try {
      return await this.chatbotRepository.updateUser(userId, source, data);
    } catch (error) {
      throw new InternalServerError(`Failed to update user: ${error}`);
    }
  }

  async changeUserPassword(
    userId: string,
    source: string,
    newPassword: string,
    keepLoggedIn: boolean,
  ): Promise<boolean> {
    try {
      return await this.chatbotRepository.changeUserPassword(
        userId,
        source,
        newPassword,
        keepLoggedIn,
      );
    } catch (error) {
      if (error instanceof BadRequestError || error instanceof NotFoundError) {
        throw error;
      }
      throw new InternalServerError(`Failed to change user password: ${error}`);
    }
  }

  async addUser(
    source: string,
    data: {
      email: string;
      name: string;
      password: string;
      userRole?: string;
      isVerified?: boolean;
    },
  ): Promise<boolean> {
    try {
      return await this.chatbotRepository.addUser(source, data);
    } catch (error: any) {
      if (error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError(
        `Failed to add user: ${error.message || error}`,
      );
    }
  }

  // async getDailyActiveUsersTrend(
  //   source: string,
  //   userType: string,
  //   startDate?: Date,
  //   endDate?: Date,
  // ) {
  //   try {
  //     return await this.chatbotRepository.getDailyActiveUsersTrend(
  //       source,
  //       userType,
  //       startDate,
  //       endDate,
  //     );
  //   } catch (error) {
  //     throw new InternalServerError(
  //       `Failed to fetch Daily Active Users Trend: ${error}`,
  //     );
  //   }
  // }

  // async getMonthlyActiveUsersTrend(
  //   source: string,
  //   userType: string,
  //   startDate?: Date,
  //   endDate?: Date,
  // ) {
  //   try {
  //     return await this.chatbotRepository.getMonthlyActiveUsersTrend(
  //       source,
  //       userType,
  //       startDate,
  //       endDate
  //     );
  //   } catch (error) {
  //     throw new InternalServerError(
  //       `Failed to fetch Monthly Active Users Trend: ${error}`,
  //     );
  //   }
  // }

  // async getWeeklyActiveUsersTrend(
  //   source: string,
  //   userType: string,
  //   startDate?: Date,
  //   endDate?: Date,
  // ) {
  //   try {
  //     return await this.chatbotRepository.getWeeklyActiveUsersTrend(
  //       source,
  //       userType,
  //       startDate,
  //       endDate
  //     );
  //   } catch (error) {
  //     throw new InternalServerError(
  //       `Failed to fetch Weekly Active Users Trend: ${error}`,
  //     );
  //   }
  // }

  async getRetentionMetrics(
    source: string,
    userType: string,
    requestType: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    try {
      return await this.chatbotRepository.getRetentionMetrics(
        source,
        userType,
        requestType,
        startDate,
        endDate,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch Retention Metrics: ${error}`,
      );
    }
  }

  async getWhatsappUserGrowth(startDate: Date, endDate: Date) {
    const labels: string[] = [];

    const idsCreated: number[] = [];
    const installs: number[] = [];
    const activeUsers: number[] = [];

    // Generate labels
    const current = new Date(startDate);

    while (current <= endDate) {
      labels.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    const whatsAppUsers = await this.whatsappService.getAllUsers();

    for (const label of labels) {
      // IDs Created
      const createdCount = whatsAppUsers.data.filter(user =>
        user.firstMessageAt.startsWith(label),
      ).length;
      idsCreated.push(createdCount);

      // Installs
      // assuming install = first interaction
      const installsCount = whatsAppUsers.data.filter(user =>
        user.firstMessageAt.startsWith(label),
      ).length;
      installs.push(installsCount);

      // Active users
      const activeCount = whatsAppUsers.data.filter(user =>
        user.lastMessageAt.startsWith(label),
      ).length;
      activeUsers.push(activeCount);
    }

    return {
      labels,
      series: {
        idsCreated,
        installs,
        activeUsers,
      },
    };
  }

  async notifyUser(
    userEmail: string,
    messageId: string,
    message: string,
  ): Promise<any> {
    const user = await this.chatbotRepository.getUserData(userEmail, 'annam');
    const webhookPayload = {
      customMessage: message,
      userId: user.userId.toString(),
      type: 'CUSTOM',
    };
    const response = await triggerWebhook(
      appConfig.WEB_WEBHOOK_API_URL,
      appConfig.WEB_WEBHOOK_API_KEY,
      webhookPayload,
      'Browser',
    );
    if (!response?.ok || response.status < 200 || response.status >= 300) {
      throw new InternalServerError(
        `Webhook failed with status ${response?.status}, ${response.body ? `response: ${response.body}` : 'no response body'}`,
      );
    }

    return {
      success: true,
      status: response.status,
      message: response.body,
    };
  }

  async getClosedAndNotifedData(
    source?: string,
    userType?: string,
    startDateStr?: string,
    endDateStr?: string,
  ): Promise<any> {
    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

    const [
      closedVsTotalQuestions,
      notifiedVsClosed,
      closedInLastTwoHours,
      carryForward,
    ] = await Promise.all([
      this.chatbotRepository.getClosedVsTotalQuestions(
        source,
        userType,
        startDate,
        endDate,
      ),
      this.chatbotRepository.getNotifiedVsClosed(source, userType, startDate, endDate),
      this.chatbotRepository.getClosedInLastTwoHours(
        source,
        userType,
        startDate,
        endDate,
      ),
      this.chatbotRepository.getCarryForwardQuestions(source, userType),
    ]);
// console.log("closedVsTotalQuestions---", closedVsTotalQuestions); 
    return {
      closedVsTotalQuestions,
      notifiedVsClosed,
      closedInLastTwoHours,
      carryForward,
    };
  }

  async getMonthlyChurnRate(source: string, userType: string): Promise<any> {
    return await this.chatbotRepository.getMonthlyChurnRate(source, userType);
  }

  async getActiveUsersTrend(
    source: string,
    userType: string,
    requestType: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<
    {
      _id: string;
      activeUsers: number;
    }[]
  > {
    return await this.chatbotRepository.getActiveUsersTrend(
      source,
      userType,
      requestType,
      startDate,
      endDate,
    );
  }

  async getTopQuestionsFromCollection(
    source = 'annam',
    userType = 'all',
    startTime?: string,
    endTime?: string,
  ): Promise<any> {
    try {
      return await this.chatbotRepository.getTopQuestionsFromCollection(
        source,
        undefined,
        userType,
        startTime,
        endTime,
      );
    } catch (error) {
      throw new InternalServerError(`Failed to fetch top FAQs: ${error}`);
    }
  }

  async getRepeatQueryCount(
    source?: string,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<any> {
    try {
      return await this.chatbotRepository.getRepeatQueryCount(
        source,
        userType,
        startTime,
        endTime,
      );
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch repeat query count: ${error}`,
      );
    }
  }

  async getUsersMetrics(
    source?: string,
    userType?: string,
  ): Promise<{
    userDemographics: UserDemographics;
    platformInstalls: PlatformInstallEntry[];
    kccAndAgriAppUsage: KccAndAgriAppStats;
    feedbackData: FeedbackData;
  }> {
    try {
      const [
        userDemographics,
        platformInstalls,
        kccAndAgriAppUsage,
        feedbackData,
      ] = await Promise.all([
        this.chatbotRepository.getUserDemographics(source, undefined, userType),
        this.chatbotRepository.getPlatformInstalls(source, undefined, userType),
        this.chatbotRepository.getKccAndAgriAppStats(
          source,
          undefined,
          userType,
        ),
        this.chatbotRepository.getFeedbackData(source, undefined, userType),
      ]);
      return {
        userDemographics,
        platformInstalls,
        kccAndAgriAppUsage,
        feedbackData,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch users metrics: ${error}`);
    }
  }

  async getAllUnverifiedUsers(
    page: number = 1,
    limit: number = 10,
    search: string = '',
    source: string = 'annam',
  ): Promise<{
    users: UnverifiedUserEntry[];
    totalUsers: number;
    totalPages: number;
  }> {
    try {
      // Fetch unverified users using the dedicated repository method
      const data = await this.chatbotRepository.findUnverifiedUsers(
        page,
        limit,
        search,
        source,
      );
      return {
        users: data.users,
        totalUsers: data.totalUsers,
        totalPages: data.totalPages,
      };
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch unverified users: ${error}`,
      );
    }
  }

  async verifyUser(userId: string, source = 'vicharanashala',  isVerified?: boolean,  ): Promise<any> {
    try {
      if (!userId) {
        throw new NotFoundError('User ID is required');
      }

      const updatedUser = await this.chatbotRepository.verifyUser(
        userId,
        source,
        isVerified,
      );

      if (!updatedUser) {
        throw new NotFoundError(`User not found`);
      }

      const subject = 'Annam Verification Request Approved';
      const htmlMessage = ` 
      <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8" />
          <title>Account Verified</title>
        </head>
        <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
                  
                  <tr>
                    <td style="background:#16a34a;padding:24px;text-align:center;">
                      <h1 style="margin:0;color:#ffffff;font-size:28px;">
                        Account Verified
                      </h1>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:40px;">
                      <p style="font-size:16px;color:#333333;line-height:1.6;">
                        Hello <strong>${updatedUser.name}</strong>,
                      </p>

                      <p style="font-size:16px;color:#333333;line-height:1.6;">
                        Your account verification request has been approved by our administrators.
                      </p>

                      <p style="font-size:16px;color:#333333;line-height:1.6;">
                        You can now log in and access all features available on Ajrasakha.
                      </p>

                      <div style="text-align:center;margin:35px 0;">
                        <a
                          href="https://chat.annam.ai/login"
                          style="
                            display:inline-block;
                            background:#16a34a;
                            color:#ffffff;
                            text-decoration:none;
                            padding:14px 30px;
                            border-radius:8px;
                            font-size:16px;
                            font-weight:bold;
                          "
                        >
                          Login Now
                        </a>
                      </div>

                      <p style="font-size:16px;color:#333333;line-height:1.6;">
                        If you experience any issues accessing your account, please contact our support team.
                      </p>

                      <p style="font-size:16px;color:#333333;line-height:1.6;">
                        Thank you,<br />
                        <strong>Ajrasakha Team</strong>
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="background:#f8fafc;padding:20px;text-align:center;color:#64748b;font-size:12px;">
                      © ${new Date().getFullYear()} Annam.Ai
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
      if(isVerified === true){
        await sendEmailNotification(
          updatedUser.email,
          subject,
          '',
          htmlMessage
        );
      }

      return updatedUser;
    } catch (error) {
      throw new InternalServerError(
        `Failed to verify user with ID ${userId}: ${error}`,
      );
    }
  }

  async getResponseAdherenceTable(
    source?: string,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<ResponseAdherenceTable> {
    return this.chatbotRepository
      .getResponseAdherenceTable(
        undefined,
        userType,
        startTime,
        endTime,
        source,
      )
      .catch(() => ({
        date: '',
        time: '',
        timeWindow: '',
        whatsappQueriesAsked: 0,
        ajrasakhaQueriesAsked: 0,
        whatsappPushedToReviewer: 0,
        ajrasakhaPushedToReviewer: 0,
        whatsappAnsweredWithin120Min: 0,
        ajrasakhaAnsweredWithin120Min: 0,
        whatsappPassedQuestions: 0,
        ajrasakhaPassedQuestions: 0,
        whatsappMarkedDuplicate: 0,
        ajrasakhaMarkedDuplicate: 0,
        whatsappDynamicWeather: 0,
        ajrasakhaDynamicWeather: 0,
        whatsappDynamicMarket: 0,
        ajrasakhaDynamicMarket: 0,
        whatsappDynamicSchemes: 0,
        ajrasakhaDynamicSchemes: 0,
        whatsappNonGdbWithin120: 0,
        ajrasakhaNonGdbWithin120: 0,
        whatsappInReview: 0,
        ajrasakhaInReview: 0,
        whatsappOpen: 0,
        ajrasakhaOpen: 0,
        whatsappDelayed: 0,
        ajrasakhaDelayed: 0,
        whatsappAverageResponseMinutes: 0,
        ajrasakhaAverageResponseMinutes: 0,
        whatsappAdherencePct: 0,
        ajrasakhaAdherencePct: 0,
      }));
  }

  async getQuestionsByCrop(
    crop: string,
    crops?: string[],
    questionType?: QueryCategoryQuestionType,
    page?: number,
    limit?: number,
    source?: string,
    userType?: string,
    search?: string,
  ): Promise<any> {
    try {
      return this.chatbotRepository.getQuestionsByCrop(
        crop,
        crops,
        questionType,
        page,
        limit,
        source,
        undefined,
        userType,
        search,
      );
    } catch (error) {
      throw new InternalServerError(`Internal server error ${error}`);
    }
  }

  async getQuestionsByStatus(
    status: string,
    page?: number,
    limit?: number,
    source?: string,
    userType?: string,
    search?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    try {
      return this.chatbotRepository.getQuestionsByStatus(
        status,
        page,
        limit,
        source,
        undefined,
        userType,
        search,
        startDate,
        endDate,
      );
    } catch (error) {
      throw new InternalServerError(`Internal server error ${error}`);
    }
  }

  async getQuestionsClosedWithinTwoHours(page?: number, limit?: number, source?: string, userType?: string, search?: string, startDate?: Date, endDate?: Date, isPassed?: string, tag?: string): Promise<any> {
    try {
      return this.chatbotRepository.getQuestionsClosedWithinTwoHours(
        page,
        limit,
        source,
        undefined,
        userType,
        search,
        startDate,
        endDate,
        isPassed,
        tag
      )
    }catch(error){
      throw new InternalServerError(`Internal server error ${error}`)
    }
  }
  async getQuestionsByNotificationStatus(notificationType: string, page: number, limit: number, source: string, userType?: string, search?: string, startDate?: Date, endDate?: Date): Promise<any> {
      try {
      return this.chatbotRepository.getQuestionsByNotificationStatus(
        notificationType,
        page,
        limit,
        source,
        undefined,
        userType,
        search,
        startDate,
        endDate
      )
    }catch(error){
      throw new InternalServerError(`Internal server error ${error}`)
    }
  }

  async getQueriesByPeriod(period: string, page: number, limit: number, source: string, userType?: string, search?: string): Promise<any> {
    try{
      return this.chatbotRepository.getQueriesByPeriod(period, page, limit, source, undefined, userType, search)
    }catch(error){
      throw new InternalServerError(`Internal Server Error ${error}`)
    }
  }

  async getAllStatesQuestionsAndUsersData(source: string, userType: string): Promise<any> {
    try{
        // console.time("LGD");

    const allStates =
      await this.lgdService.getStates();

    // console.timeEnd("LGD");

    //   console.log("All states", allStates);
      return this.chatbotRepository.getAllStatesQuestionsAndUsersData(source, userType, allStates, undefined)
    }catch(error){
      throw new InternalServerError(`Internal Server Error ${error}`)
    }
  }
  
  async getUserProfile(userId: string){
    try{
      return this.chatbotRepository.getUserProfile(userId)
    }catch(error){
      throw new InternalServerError(`Internal Server Error ${error}`)
    }
  }

  // async getStateQuestionsAndUsersData(state: string, source: string, userType: string): Promise<any> {
  //   try {
  //     return this.chatbotRepository.getStateQuestionsAndUsersData(state, source, userType, undefined);
  //   }catch(error){
  //     throw new InternalServerError(`Internal server error ${error}`)
  //   }
  // }
  async assignUsers(userId: string, targetIds: string[]): Promise<any>{
    try{
      return this.chatbotRepository.assignUsers(userId, targetIds)
    }catch(error){
      throw new InternalServerError(`Internal Server Error ${error}`)
    }
  }
  
  async unAssignUsers(userId: string, targetIds: string[]): Promise<any>{
    try{
      return this.chatbotRepository.unAssignUsers(userId, targetIds)
    }catch(error){
      throw new InternalServerError(`Internal Server Error ${error}`)
    }
  }

  async getVillageUserCounts(state: string, district: string, source: string, userType: string): Promise<any> {
    try {
      return this.chatbotRepository.getVillageUserCounts(state, district, source, userType, undefined);
    }catch(error){
      throw new InternalServerError(`Internal Server Error ${error}`)
    }
  }

  
  async getQuestionLifecycle(questionId: string): Promise<any>{
    return this.chatbotRepository.getQuestionLifecycle(questionId);
  }

  async getLifeCycleSummary(
      status?: string,
      source?: string,
      userType?: string,
      startDate?: Date,
      endDate?: Date,
      isPassed?: string,
      tag?: string,
      notificationType?: string,
    ): Promise<any>{
      return this.chatbotRepository.getLifeCycleSummary(
        status,
        source,
        userType,
        startDate,
        endDate,
        isPassed,
        tag,
        notificationType,
      );
    }
}
