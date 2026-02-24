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
  GoldenDataset,
  QuestionStatusOverview,
  StatusOverview
} from '#root/modules/core/classes/validators/DashboardValidators.js';
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

      const userRoleOverview = await this.userRepo.getUserRoleCount(session);
      const moderatorApprovalRate =
        await this.questionRepo.getModeratorApprovalRate(
          currentUserId,
          session,
        );

      // goldenDataset
      const closedQuestions = await this.questionRepo.getQuestionsByStatus(
        'closed',
        session,
      );

      const verifiedEntries = closedQuestions.length;

       const {todayApproved}=await this.questionRepo.getTodayApproved(session);

      let goldenDataset = {} as GoldenDataset;

      if (goldenDataViewType == 'year') {
        const {yearData, totalEntriesByType, moderatorBreakdown } =
          await this.questionRepo.getYearAnalytics(
            goldenDataSelectedYear,
            session,
          );
        goldenDataset = {yearData, verifiedEntries, totalEntriesByType,todayApproved, moderatorBreakdown };
      } else if (goldenDataViewType == 'month') {
        const {weeksData, totalEntriesByType, moderatorBreakdown } =
          await this.questionRepo.getMonthAnalytics(
            goldenDataSelectedYear,
            goldenDataSelectedMonth,
            session,
          );
        goldenDataset = {weeksData, verifiedEntries, totalEntriesByType,todayApproved, moderatorBreakdown };
      } else if (goldenDataViewType == 'week') {
        const {dailyData, totalEntriesByType, moderatorBreakdown } =
          await this.questionRepo.getWeekAnalytics(
            goldenDataSelectedYear,
            goldenDataSelectedMonth,
            goldenDataSelectedWeek,
            session,
          );
        goldenDataset = {dailyData, verifiedEntries, totalEntriesByType,todayApproved, moderatorBreakdown };
      } else if (goldenDataViewType == 'day') {
        const {dayHourlyData, totalEntriesByType, moderatorBreakdown } =
          await this.questionRepo.getDailyAnalytics(
            goldenDataSelectedYear,
            goldenDataSelectedMonth,
            goldenDataSelectedWeek,
            goldenDataSelectedDay,
            session,
          );
        goldenDataset = {dayHourlyData, verifiedEntries, totalEntriesByType,todayApproved, moderatorBreakdown };
      }

      //questionContributionTrend
      const questionContributionTrend: DashboardResponse['questionContributionTrend'] =
        await this.questionRepo.getCountBySource(sourceChartTimeRange, session);

      // statusOverview
      const questionsOverview: QuestionStatusOverview[] =
        await this.questionRepo.getQuestionOverviewByStatus(session);

      const answerOverView: AnswerStatusOverview[] =
        await this.answerRepo.getAnswerOverviewByStatus(session);

      const statusOverview: StatusOverview = {
        questions: questionsOverview,
        answers: answerOverView,
      };

      //expertPerformance
      const expertPerformance: ExpertPerformance[] =
        await this.userRepo.getExpertPerformance(session);

      let analytics = {} as Analytics;

      if (qnAnalyticsType == 'question') {
        const result = await this.questionRepo.getQuestionAnalytics(
          qnAnalyticsStartTime,
          qnAnalyticsEndTime,
          session,
        );
        analytics = result.analytics;
      } else {
        const result = await this.answerRepo.getAnswerAnalytics(
          qnAnalyticsStartTime,
          qnAnalyticsEndTime,
          session,
        );
        analytics = result.analytics;
      }

      const response: DashboardResponse = {
        userRoleOverview,
        moderatorApprovalRate,
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

  async getLevelWiseReport(): Promise<ArrayBuffer | null> {
    return await this._withTransaction(async (session: ClientSession) => {
      const result = await this.questionSubmissionRepo.getLevelWiseReport(session);
      console.log('resulltttt:', result);

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
