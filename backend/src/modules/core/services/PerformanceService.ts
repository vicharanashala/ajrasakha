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
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from 'routing-controllers';
import {
  ReviewAnswerBody,
  SubmissionResponse,
  UpdateAnswerBody,
} from '../classes/validators/AnswerValidators.js';
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
  DashboardResponse,
  GetDashboardQuery,
  GoldenDataset,
  GoldenDataViewType,
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

  async getHeatMapresults(): Promise<IReviewerHeatmapRow[] | null> {
    return await this.questionSubmissionRepo.heatMapResultsForReviewer();
  }

  async getCurrentUserWorkLoad(currentUserId: string): Promise<{
    currentUserAnswers: any[];
    totalQuestionsCount: number;
    totalInreviewQuestionsCount: number;
  }> {
    return await this.answerRepo.getCurrentUserWorkLoad(currentUserId);
  }

  async getGoldenDatasetData(): Promise<GoldenDataset> {
    const closedStatus = 'closed';
    const closedQuestions = await this.questionRepo.getQuestionsByStatus(
      closedStatus,
      session,
    );

    if (viewType === 'year') {
      const selectedYearNum = Number(goldenDataSelectedYear);

      const startDate = new Date(selectedYearNum, 0, 1);
      const endDate = new Date(selectedYearNum + 1, 0, 1);

      const yearData = await this.questionRepo.aggregate([
        {
          $match: {
            status: 'closed',
            closedAt: {$gte: startDate, $lt: endDate},
          },
        },
        {
          $group: {
            _id: {month: {$month: '$closedAt'}},
            totalClosed: {$sum: 1},
          },
        },
        {$sort: {'_id.month': 1}},
      ]);

      const formattedMonths = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];

      const formattedData = Array.from({length: 12}, (_, i) => {
        const match = yearData.find(m => m._id.month === i + 1);
        return {
          month: formattedMonths[i],
          entries: 0,
          verified: match?.totalClosed ?? 0,
        };
      });

      return {yearData: formattedData};
    }

    // if (viewType === 'month') {
    //   const weeksData = await this.questionRepo.getMonthAnalytics(
    //     closedQuestions,
    //   );
    //   return {weeksData};
    // }

    // if (viewType === 'week') {
    //   const dailyData = await this.questionRepo.getWeekAnalytics(
    //     closedQuestions,
    //   );
    //   return {dailyData};
    // }

    // if (viewType === 'day') {
    //   const dayHourlyData = await this.questionRepo.getDayAnalytics(
    //     closedQuestions,
    //   );
    //   return {dayHourlyData};
    // }

    throw new InternalServerError('Invalid Golden Dataset Type');
  }

  async getDashboardData(
    currentUserId: string,
    query: GetDashboardQuery,
  ): Promise<{data: DashboardResponse}> {
    await this._withTransaction(async (session: ClientSession) => {
      const {
        goldenDataViewType,
        goldenDataSelectedYear,
        goldenDataSelectedMonth,
        goldenDataSelectedWeek,
        goldenDataSelectedDay,
        sourceChartTimeRange,
        qnAnalyticsEndTime,
        qnAnalyticsStartTime,
      } = query;

      const user = await this.userRepo.findById(currentUserId, session);
      if (!user || user.role == 'expert')
        throw new UnauthorizedError(
          "You don't have permission to access this data",
        );

      const userRoleOverview = await this.userRepo.getUserRoleCount(session);
      const moderatorApprovalRate =
        await this.answerRepo.getModeratorApprovalRate(currentUserId, session);

      // goldenDataset
      let goldenDataset = {} as GoldenDataset;

      if (goldenDataViewType == 'year') {
        const {yearData} = await this.questionRepo.getYearAnalytics(
          goldenDataSelectedYear,
          session,
        );
        goldenDataset = {yearData};
      } else if (goldenDataViewType == 'month') {
        const {weeksData} = await this.questionRepo.getMonthAnalytics(
          goldenDataSelectedYear,
          goldenDataSelectedMonth,
          session,
        );
        goldenDataset = {weeksData};
      } else if (goldenDataViewType == 'week') {
        const {dailyData} = await this.questionRepo.getWeekAnalytics(
          goldenDataSelectedYear,
          goldenDataSelectedMonth,
          goldenDataSelectedWeek,
          session,
        );
        goldenDataset = {dailyData};
      } else if (goldenDataViewType == 'day') {
        const {dayHourlyData} = await this.questionRepo.getDailyAnalytics(
          goldenDataSelectedYear,
          goldenDataSelectedMonth,
          goldenDataSelectedWeek,
          goldenDataSelectedDay,
          session,
        );
        goldenDataset = {dayHourlyData};
      }

      const response: DashboardResponse = {
        userRoleOverview,
        moderatorApprovalRate,
        goldenDataset,

        questionContributionTrend: [
          {date: '2025-01-01', Ajraskha: 5, Moderator: 2},
        ],

        statusOverview: {
          questions: [
            {status: 'pending', value: 40},
            {status: 'completed', value: 100},
          ],
          answers: [
            {status: 'accepted', value: 80},
            {status: 'rejected', value: 20},
          ],
        },
        expertPerformance: [
          {expert: 'John', reputation: 120, incentive: 50, penalty: 2},
        ],
      };

      return {data: response};
    });
  }
}
