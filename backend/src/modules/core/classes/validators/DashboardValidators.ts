import {IsIn, IsOptional, IsString, IsDateString} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';

export class GetDashboardQuery {
  @JSONSchema({example: 'year', description: 'View type for Golden Dataset'})
  @IsString()
  @IsIn(['year', 'month', 'week', 'day'])
  goldenDataViewType!: 'year' | 'month' | 'week' | 'day';

  @JSONSchema({
    example: 'January',
    description: 'Selected month for Golden Dataset',
  })
  @IsOptional()
  @IsString()
  goldenDataSelectedMonth?: string;

  @JSONSchema({
    example: 'Week 1',
    description: 'Selected week for Golden Dataset',
  })
  @IsOptional()
  @IsString()
  goldenDataSelectedWeek?: string;

  @JSONSchema({example: 'Mon', description: 'Selected day for Golden Dataset'})
  @IsOptional()
  @IsString()
  goldenDataSelectedDay?: string;

  @JSONSchema({example: '90d', description: 'Time range for Sources Chart'})
  @IsString()
  sourceChartTimeRange!: string;

  @JSONSchema({
    example: '2025-12-01T00:00:00.000Z',
    description: 'Start date for Questions Analytics',
  })
  @IsOptional()
  @IsDateString()
  qnAnalyticsStartTime?: string;

  @JSONSchema({
    example: '2025-12-31T23:59:59.999Z',
    description: 'End date for Questions Analytics',
  })
  @IsOptional()
  @IsDateString()
  qnAnalyticsEndTime?: string;
}

export class UserRoleOverview {
  @JSONSchema({description: 'Role name of the user', example: 'Moderator'})
  role!: string;

  @JSONSchema({description: 'Number of users with this role', example: 12})
  count!: number;
}

export class ModeratorApprovalRate {
  @JSONSchema({description: 'Percentage of approved questions', example: 80})
  approvalRate!: number;

  @JSONSchema({description: 'Total number of reviews done', example: 100})
  totalReviews!: number;
}

export class GoldenDatasetEntry {
  @JSONSchema({description: 'Date of the entry', example: '2025-12-01'})
  date!: string;

  @JSONSchema({description: 'Number of verified entries', example: 20})
  entries!: number;

  @JSONSchema({description: 'Number of verified entries', example: 18})
  verified!: number;
}

export class GoldenDataset {
  @JSONSchema({description: 'Yearly data breakdown'})
  yearData?: GoldenDatasetEntry[];

  @JSONSchema({description: 'Weekly data breakdown'})
  weeksData?: GoldenDatasetEntry[];

  @JSONSchema({description: 'Daily data breakdown'})
  dailyData?: GoldenDatasetEntry[];

  @JSONSchema({description: 'Hourly data breakdown by day'})
  dayHourlyData?: Record<string, GoldenDatasetEntry[]>;
}

export class QuestionContributionTrend {
  @JSONSchema({description: 'Date of contribution', example: '2025-12-01'})
  date!: string;

  @JSONSchema({description: 'Number of contributions by Ajraskha', example: 5})
  Ajraskha!: number;

  @JSONSchema({description: 'Number of contributions by Moderator', example: 3})
  Moderator!: number;
}

export class QuestionStatus {
  @JSONSchema({description: 'Status of the question', example: 'pending'})
  status!: string;

  @JSONSchema({
    description: 'Number of questions with this status',
    example: 10,
  })
  value!: number;
}

export class AnswerStatus {
  @JSONSchema({description: 'Status of the answer', example: 'accepted'})
  status!: string;

  @JSONSchema({description: 'Number of answers with this status', example: 15})
  value!: number;
}

export class StatusOverview {
  @JSONSchema({description: 'Overview of question statuses'})
  questions!: QuestionStatus[];

  @JSONSchema({description: 'Overview of answer statuses'})
  answers!: AnswerStatus[];
}

export class ExpertPerformance {
  @JSONSchema({description: 'Expert name', example: 'John Doe'})
  expert!: string;

  @JSONSchema({description: 'Reputation points of expert', example: 120})
  reputation!: number;

  @JSONSchema({description: 'Incentives earned by expert', example: 50})
  incentive!: number;

  @JSONSchema({description: 'Penalty points for expert', example: 5})
  penalty!: number;
}

export class DashboardResponse {
  @JSONSchema({description: 'Overview of users by role'})
  userRoleOverview!: UserRoleOverview[];

  @JSONSchema({description: 'Moderator approval rate overview'})
  moderatorApprovalRate!: ModeratorApprovalRate;

  @JSONSchema({description: 'Golden dataset analytics'})
  goldenDataset!: GoldenDataset;

  @JSONSchema({description: 'Question contribution trends'})
  questionContributionTrend!: {
    date: string;
    Ajraskha: number;
    Moderator: number;
  }[];

  @JSONSchema({description: 'Question status overview'})
  statusOverview!: StatusOverview;

  @JSONSchema({description: 'Expert performance overview'})
  expertPerformance!: ExpertPerformance[];
}
