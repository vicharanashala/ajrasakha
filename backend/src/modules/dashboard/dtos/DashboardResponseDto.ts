import { Expose, Type } from 'class-transformer';
import { IsString, IsNumber, IsArray, ValidateNested, IsOptional, IsInt, IsEnum } from 'class-validator';

export class UserRoleOverviewDto {
  @Expose()
  @IsString()
  role: string;

  @Expose()
  @IsNumber()
  count: number;
}

export class ModeratorApprovalRateDto {
  @Expose()
  @IsNumber()
  approvalRate: number;

  @Expose()
  @IsNumber()
  pending: number;

  @Expose()
  @IsNumber()
  approved: number;
}

export class GoldenDatasetEntryDto {
  @Expose()
  @IsOptional()
  @IsString()
  week?: string;

  @Expose()
  @IsOptional()
  @IsString()
  month?: string;

  @Expose()
  @IsOptional()
  @IsString()
  day?: string;

  @Expose()
  @IsOptional()
  @IsString()
  hour?: string;

  @Expose()
  @IsNumber()
  entries: number;

  @Expose()
  @IsNumber()
  verified: number;
}

export class GoldenDatasetDto {
  @Expose()
  @IsNumber()
  verifiedEntries: number;

  @Expose()
  @IsNumber()
  totalEntriesByType: number;

  @Expose()
  @IsNumber()
  totalVerifiedByType: number;

  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoldenDatasetEntryDto)
  yearData?: GoldenDatasetEntryDto[];

  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoldenDatasetEntryDto)
  weeksData?: GoldenDatasetEntryDto[];

  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoldenDatasetEntryDto)
  dailyData?: GoldenDatasetEntryDto[];

  @Expose()
  @IsOptional()
  dayHourlyData?: Record<string, GoldenDatasetEntryDto[]>;

  @Expose()
  @IsOptional()
  @IsNumber()
  todayApproved?: number;

  @Expose()
  @IsOptional()
  @IsArray()
  moderatorBreakdown?: { moderatorName: string; count: number }[];
}

export class QuestionContributionTrendDto {
  @Expose()
  @IsString()
  date: string;

  @Expose()
  @IsNumber()
  Ajrasakha: number;

  @Expose()
  @IsNumber()
  Moderator: number;
}

export class QuestionStatusOverviewDto {
  @Expose()
  @IsString()
  status: string;

  @Expose()
  @IsNumber()
  value: number;
}

export class AnswerStatusOverviewDto {
  @Expose()
  @IsString()
  status: string;

  @Expose()
  @IsNumber()
  value: number;
}

export class StatusOverviewDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionStatusOverviewDto)
  questions: QuestionStatusOverviewDto[];

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerStatusOverviewDto)
  answers: AnswerStatusOverviewDto[];
}

export class ExpertPerformanceDto {
  @Expose()
  @IsString()
  expert: string;

  @Expose()
  @IsNumber()
  reputation: number;

  @Expose()
  @IsNumber()
  incentive: number;

  @Expose()
  @IsNumber()
  penalty: number;
}

export class AnalyticsItemDto {
  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsInt()
  count: number;
}

export class AnalyticsDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnalyticsItemDto)
  cropData: AnalyticsItemDto[];

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnalyticsItemDto)
  stateData: AnalyticsItemDto[];

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnalyticsItemDto)
  domainData: AnalyticsItemDto[];
}

export class DashboardResponseDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserRoleOverviewDto)
  userRoleOverview: UserRoleOverviewDto[];

  @Expose()
  @ValidateNested()
  @Type(() => ModeratorApprovalRateDto)
  moderatorApprovalRate: ModeratorApprovalRateDto;

  @Expose()
  @ValidateNested()
  @Type(() => GoldenDatasetDto)
  goldenDataset: GoldenDatasetDto;

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionContributionTrendDto)
  questionContributionTrend: QuestionContributionTrendDto[];

  @Expose()
  @ValidateNested()
  @Type(() => StatusOverviewDto)
  statusOverview: StatusOverviewDto;

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpertPerformanceDto)
  expertPerformance: ExpertPerformanceDto[];

  @Expose()
  @ValidateNested()
  @Type(() => AnalyticsDto)
  analytics: AnalyticsDto;
}

export class OverviewResponseDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserRoleOverviewDto)
  userRoleOverview: UserRoleOverviewDto[];

  @Expose()
  @ValidateNested()
  @Type(() => ModeratorApprovalRateDto)
  moderatorApprovalRate: ModeratorApprovalRateDto;
}
