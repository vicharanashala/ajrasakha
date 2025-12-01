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
} from '../classes/validators/DashboardValidators.js';

@injectable()
export class PerformanceService extends BaseService {
  constructor(
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

  async getDashboardData(
    query: GetDashboardQuery,
  ): Promise<{data: DashboardResponse}> {
    console.log('Dashboard Filters:', query);

    const response: DashboardResponse = {
      userRoleOverview: [
        {role: 'Moderator', count: 12},
        {role: 'Expert', count: 40},
      ],
      moderatorApprovalRate: {
        approvalRate: 84,
        totalReviews: 560,
      },
      goldenDataset: {
        yearData: [{date: '2025-01', entries: 200, verified: 180}],
        weeksData: [{date: 'Week 1', entries: 50, verified: 45}],
        dailyData: [{date: 'Monday', entries: 10, verified: 9}],
        dayHourlyData: {
          Mon: [{date: '10 AM', entries: 2, verified: 2}],
        },
      },
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
  }
}
