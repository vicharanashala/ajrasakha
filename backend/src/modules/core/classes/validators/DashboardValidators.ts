import {
  IsIn,
  IsOptional,
  IsString,
  IsDateString,
  IsInt,
  IsArray,
  IsEnum,
} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';

export type GoldenDataViewType = 'year' | 'month' | 'week' | 'day';
export class GetDashboardQuery {
  @JSONSchema({example: 'year', description: 'View type for Golden Dataset'})
  @IsString()
  @IsIn(['year', 'month', 'week', 'day'])
  goldenDataViewType!: GoldenDataViewType;

  @JSONSchema({
    example: '2026',
    description: 'Selected year for Golden Dataset',
  })
  @IsOptional()
  @IsString()
  goldenDataSelectedYear?: string;

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

  @JSONSchema({
    example: 'question',
    description: 'Type of analytics to fetch',
  })
  @IsEnum(['question', 'answer'], {
    message: 'qnAnalyticsType must be either "question" or "answer"',
  })
  qnAnalyticsType!: 'question' | 'answer';
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
  @JSONSchema({description: 'Week name', example: 'Week 1'})
  week?: string;

  @JSONSchema({description: 'Month name', example: 'Jan'})
  month?: string;

  @JSONSchema({description: 'Day of week', example: 'Mon'})
  day?: string;

  @JSONSchema({description: 'Hour of the day', example: '09:00'})
  hour?: string;

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

export class QuestionStatusOverview {
  @JSONSchema({description: 'Status of the question', example: 'pending'})
  status!: string;

  @JSONSchema({
    description: 'Number of questions with this status',
    example: 10,
  })
  value!: number;
}

export class AnswerStatusOverview {
  @JSONSchema({description: 'Status of the answer', example: 'accepted'})
  status!: string;

  @JSONSchema({description: 'Number of answers with this status', example: 15})
  value!: number;
}

export class StatusOverview {
  @JSONSchema({description: 'Overview of question statuses'})
  questions!: QuestionStatusOverview[];

  @JSONSchema({description: 'Overview of answer statuses'})
  answers!: AnswerStatusOverview[];
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

export class AnalyticsItem {
  @JSONSchema({description: 'Name of the crop/state/domain', example: 'Rice'})
  @IsString()
  name!: string;

  @JSONSchema({description: 'Count for this item', example: 245})
  @IsInt()
  count!: number;
}

export class Analytics {
  @JSONSchema({description: 'Crop wise analytics'})
  @IsArray()
  cropData!: AnalyticsItem[];

  @JSONSchema({description: 'State wise analytics'})
  @IsArray()
  stateData!: AnalyticsItem[];

  @JSONSchema({description: 'Domain wise analytics'})
  @IsArray()
  domainData!: AnalyticsItem[];
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

  @JSONSchema({description: 'Questions analytics overview'})
  analytics!: Analytics;
}
