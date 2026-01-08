import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {
  IAnswer,
  IQuestionMetrics,
  ISubmissionHistory,
  IReviewerHeatmapRow,
  QuestionStatus,
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from 'routing-controllers';
import {CORE_TYPES} from '../types.js';
import {AiService} from './AiService.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {dummyEmbeddings} from '../utils/questionGen.js';
import {
  IQuestionAnalysis,
  IQuestionWithAnswerTexts,
} from '../classes/validators/QuestionValidators.js';
import {QuestionService} from './QuestionService.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {INotificationRepository} from '#root/shared/database/interfaces/INotificationRepository.js';
import {notifyUser} from '#root/utils/pushNotification.js';
import {NotificationService} from './NotificationService.js';
import {
  Analytics,
  AnswerStatusOverview,
  DashboardResponse,
  ExpertPerformance,
  GetDashboardQuery,
  GetHeatMapQuery,
  GoldenDataset,
  GoldenDataViewType,
  QuestionStatusOverview,
  StatusOverview,
  UserRoleOverview,
} from '../classes/validators/DashboardValidators.js';
import {IRequestRepository} from '#root/shared/database/interfaces/IRequestRepository.js';

@injectable()
export class PerformanceService extends BaseService {
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
  ): Promise<IReviewerHeatmapRow[] | null> {
    return await this.questionSubmissionRepo.heatMapResultsForReviewer(query);
  }

  async getCurrentUserWorkLoad(currentUserId: string): Promise<{
    currentUserAnswers: any[];
    totalQuestionsCount: number;
    totalInreviewQuestionsCount: number;
  }> {
    return await this.answerRepo.getCurrentUserWorkLoad(currentUserId);
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

      let goldenDataset = {} as GoldenDataset;

      if (goldenDataViewType == 'year') {
        const {yearData, totalEntriesByType} =
          await this.questionRepo.getYearAnalytics(
            goldenDataSelectedYear,
            session,
          );
        goldenDataset = {yearData, verifiedEntries, totalEntriesByType};
      } else if (goldenDataViewType == 'month') {
        const {weeksData, totalEntriesByType} =
          await this.questionRepo.getMonthAnalytics(
            goldenDataSelectedYear,
            goldenDataSelectedMonth,
            session,
          );
        goldenDataset = {weeksData, verifiedEntries, totalEntriesByType};
      } else if (goldenDataViewType == 'week') {
        const {dailyData, totalEntriesByType} =
          await this.questionRepo.getWeekAnalytics(
            goldenDataSelectedYear,
            goldenDataSelectedMonth,
            goldenDataSelectedWeek,
            session,
          );
        goldenDataset = {dailyData, verifiedEntries, totalEntriesByType};
      } else if (goldenDataViewType == 'day') {
        const {dayHourlyData, totalEntriesByType} =
          await this.questionRepo.getDailyAnalytics(
            goldenDataSelectedYear,
            goldenDataSelectedMonth,
            goldenDataSelectedWeek,
            goldenDataSelectedDay,
            session,
          );
        goldenDataset = {dayHourlyData, verifiedEntries, totalEntriesByType};
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
}
