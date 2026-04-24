import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {
  IReviewerHeatmapResponse,
} from '#root/shared/interfaces/models.js';
import {
  UnauthorizedError,
} from 'routing-controllers';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js'
import {
  Analytics,
  AnswerStatusOverview,
  DashboardResponse,
  ExpertPerformance,
  GetDashboardQuery,
  GetHeatMapQuery,
  GetGoldenDatasetQuery,
  GetQuestionsAnalyticsQuery,
  GoldenDataset,
  QuestionStatusOverview,
  StatusOverview,
  UserRoleOverview,
  ModeratorApprovalRate,
  QuestionContributionTrend
} from '#root/modules/dashboard/validators/DashboardValidators.js';
import {IRequestRepository} from '#root/shared/database/interfaces/IRequestRepository.js';
import { IPerformanceService } from '../interfaces/IPerformanceService.js';
import { sendStatsEmail } from '#root/utils/backupEmailService.js';
import { formatMinutesToHMS } from '#root/utils/formatMinutesToHMS.js';
import { formatSheetName } from '#root/utils/formatSheetName.js';
import ExcelJs from 'exceljs'

@injectable()
export class PerformanceService extends BaseService implements IPerformanceService {
  constructor(
    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.RequestRepository)
    private readonly requestRepository: IRequestRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async getHeatMapresults(
    query: GetHeatMapQuery,
  ): Promise<IReviewerHeatmapResponse | null> {
    return await this.questionSubmissionRepo.heatMapResultsForReviewer(query);
  }

  async getCurrentUserWorkLoad(currentUserId: string): Promise<{
    currentUserAnswersCount: number;
    totalQuestionsCount: number;
    totalInreviewQuestionsCount: number;
  }> {
    return await this.answerRepo.getCurrentUserWorkLoad(currentUserId);
  }

  async updateCheckInTime(userId: string, time: Date) {
    await this.userRepo.updateCheckInTime(userId, time);
  }

  async getOverview(currentUserId: string): Promise<{
    userRoleOverview: UserRoleOverview[];
    moderatorApprovalRate: ModeratorApprovalRate;
  }> {
    return await this._withTransaction(async (session: ClientSession) => {
      const userRoleOverview = await this.userRepo.getUserRoleCount(session);
      const moderatorApprovalRate = await this.questionRepo.getModeratorApprovalRate(
        currentUserId,
        session,
      );
      return { userRoleOverview, moderatorApprovalRate };
    });
  }

  async getGoldenDataset(query: GetGoldenDatasetQuery): Promise<GoldenDataset> {
    return await this._withTransaction(async (session: ClientSession) => {
      const { viewType, selectedYear, selectedMonth, selectedWeek, selectedDay } = query;
      const verifiedEntries = await this.questionRepo.getClosedQuestionsCount(session);
      const { todayApproved } = await this.questionRepo.getTodayApproved(session);

      let goldenDataset = {} as GoldenDataset;

      if (viewType === 'year') {
        const { yearData, totalEntriesByType, totalVerifiedByType, moderatorBreakdown } =
          await this.questionRepo.getYearAnalytics(selectedYear!, session);
        goldenDataset = { yearData, verifiedEntries, totalEntriesByType, totalVerifiedByType, todayApproved, moderatorBreakdown };
      } else if (viewType === 'month') {
        const { weeksData, totalEntriesByType, totalVerifiedByType, moderatorBreakdown } =
          await this.questionRepo.getMonthAnalytics(selectedYear!, selectedMonth!, session);
        goldenDataset = { weeksData, verifiedEntries, totalEntriesByType, totalVerifiedByType, todayApproved, moderatorBreakdown };
      } else if (viewType === 'week') {
        const { dailyData, totalEntriesByType, totalVerifiedByType, moderatorBreakdown } =
          await this.questionRepo.getWeekAnalytics(selectedYear!, selectedMonth!, selectedWeek!, session);
        goldenDataset = { dailyData, verifiedEntries, totalEntriesByType, totalVerifiedByType, todayApproved, moderatorBreakdown };
      } else if (viewType === 'day') {
        const { dayHourlyData, totalEntriesByType, totalVerifiedByType, moderatorBreakdown } =
          await this.questionRepo.getDailyAnalytics(selectedYear!, selectedMonth!, selectedWeek!, selectedDay!, session);
        goldenDataset = { dayHourlyData, verifiedEntries, totalEntriesByType, totalVerifiedByType, todayApproved, moderatorBreakdown };
      }

      return goldenDataset;
    });
  }

  async getContributionTrend(timeRange: string): Promise<QuestionContributionTrend[]> {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.questionRepo.getCountBySource(timeRange, session);
    });
  }

  async getStatusOverview(): Promise<StatusOverview> {
    return await this._withTransaction(async (session: ClientSession) => {
      const questionsOverview = await this.questionRepo.getQuestionOverviewByStatus(session);
      const answerOverView = await this.answerRepo.getAnswerOverviewByStatus(session);
      return {
        questions: questionsOverview,
        answers: answerOverView,
      };
    });
  }

  async getExpertPerformance(): Promise<ExpertPerformance[]> {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.userRepo.getExpertPerformance(session);
    });
  }

  async getQuestionsAnalytics(query: GetQuestionsAnalyticsQuery): Promise<Analytics> {
    return await this._withTransaction(async (session: ClientSession) => {
      const { type, startTime, endTime } = query;
      if (type === 'question') {
        const result = await this.questionRepo.getQuestionAnalytics(startTime, endTime, session);
        return result.analytics;
      } else {
        const result = await this.answerRepo.getAnswerAnalytics(startTime, endTime, session);
        return result.analytics;
      }
    });
  }

  async getDashboardData(
    currentUserId: string,
    query: GetDashboardQuery,
  ): Promise<{data: DashboardResponse}> {
    return await this._withTransaction(async (session: ClientSession) => {
      const {
        goldenDataViewType,
        goldenDataSelectedYear,
        goldenDataSelectedMonth,
        goldenDataSelectedWeek,
        goldenDataSelectedDay,
        sourceChartTimeRange,
        qnAnalyticsEndTime,
        qnAnalyticsStartTime,
        qnAnalyticsType,
      } = query;

      const user = await this.userRepo.findById(currentUserId, session);
      if (!user || user.role == 'expert')
        throw new UnauthorizedError(
          "You don't have permission to access this data",
        );

      const [
        overview,
        goldenDataset,
        questionContributionTrend,
        statusOverview,
        expertPerformance,
        analytics
      ] = await Promise.all([
        this.getOverview(currentUserId),
        this.getGoldenDataset({
          viewType: goldenDataViewType,
          selectedYear: goldenDataSelectedYear,
          selectedMonth: goldenDataSelectedMonth,
          selectedWeek: goldenDataSelectedWeek,
          selectedDay: goldenDataSelectedDay
        }),
        this.getContributionTrend(sourceChartTimeRange),
        this.getStatusOverview(),
        this.getExpertPerformance(),
        this.getQuestionsAnalytics({
          type: qnAnalyticsType,
          startTime: qnAnalyticsStartTime,
          endTime: qnAnalyticsEndTime
        })
      ]);

      const response: DashboardResponse = {
        userRoleOverview: overview.userRoleOverview,
        moderatorApprovalRate: overview.moderatorApprovalRate,
        goldenDataset,
        questionContributionTrend,
        statusOverview,
        expertPerformance,
        analytics,
      };

      return {data: response};
    });
  }

  async sendCronSnapshotEmail(currentUserId: string) {
    return await this._withTransaction(async (session) => {
      const user = await this.userRepo.findById(currentUserId, session);

      if (!user || user.role !== "admin") {
        throw new UnauthorizedError(
          "Only admins can send cron snapshot report",
        );
      }
      if (!user.email) {
        throw new Error("Target admin user does not have an email address defined.");
      }

      await sendStatsEmail(user.email);
    });
  }

  async getLevelWiseReport(startDate:string,endDate:string): Promise<ArrayBuffer | null> {
    return await this._withTransaction(async (session: ClientSession) => {
      const result = await this.questionSubmissionRepo.getLevelWiseReport(startDate, endDate, session);
      
      if(result.length === 0 ) return null

      //Create Excel workbook
      const workbook = new ExcelJs.Workbook();

      // Loop each month
      result.forEach(monthEntry => {
        const sheetName = formatSheetName(monthEntry.month);
        const sheet = workbook.addWorksheet(sheetName);
        sheet.columns = [
          {header: 'Level', key: 'level', width: 25},
          {header: 'Approved Count', key: 'approved', width: 25},
          {header: 'Approved Count(%)', key: 'approvedPercentage', width: 25},
          {header: 'Rejected Count', key: 'rejected', width: 25},
          {header: 'Rejected Count(%)', key: 'rejectedPercentage', width: 25},
          {header: 'Modified Count', key: 'modified', width: 25},
          {header: 'Modified Count(%)', key: 'modifiedPercentage', width: 25},
          {header: 'Avg Review Time', key: 'avgTime', width: 25},
        ];
        // Loop data array inside each month
        monthEntry.data.forEach(stat => {
          sheet.addRow({
            level: stat.level,
            approved: stat.approvedCount,
            approvedPercentage: `${stat.approvedPercentage}%`,
            rejected: stat.rejectedCount,
            rejectedPercentage: `${stat.rejectedPercentage}%`,
            modified: stat.modifiedCount,
            modifiedPercentage: `${stat.modifiedPercentage}%`,
            avgTime: formatMinutesToHMS(stat.avgTimeTakenMinutes),
          });
        });

        // Style header
        const headerRow = sheet.getRow(1);
        headerRow.font = {bold: true};
        headerRow.alignment = {horizontal: 'center', vertical: 'middle'};
        // Align Cells
        sheet.eachRow(row => {
          row.eachCell(cell => {
            cell.alignment = {
              horizontal: 'center',
              vertical: 'middle',
            };
          });
        });
      });

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as ArrayBuffer;
    });
  }

}
