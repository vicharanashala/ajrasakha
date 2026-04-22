import { IsNotEmpty, IsString, IsInt, IsNumber, IsArray, IsBoolean, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

// ─── Error Response ───────────────────────────────────────────────────────────

export class ChatbotErrorResponse {
  @JSONSchema({
    description: 'The error message',
    example: 'Failed to fetch dashboard data: Database connection error',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── KPI Response ─────────────────────────────────────────────────────────────

export class KpiSummaryResponse {
  @JSONSchema({
    description: 'Total number of users (all time)',
    example: 15234,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  dau: number;

  @JSONSchema({
    description: 'Percentage change in new users: this month vs last month',
    example: 15,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  dauLastMonthPct: number;

  @JSONSchema({
    description: 'Number of queries today',
    example: 847,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  dailyQueries: number;

  @JSONSchema({
    description: 'Average session duration in minutes',
    example: 4.5,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  avgSessionDurationMin: number;

  @JSONSchema({
    description: 'Customer satisfaction rating (0-5 scale)',
    example: 4.2,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  csatRating: number;

  @JSONSchema({
    description: 'Percentage of repeat queries',
    example: 12.5,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  repeatQueryRatePct: number;

  @JSONSchema({
    description: 'Percentage of voice usage share',
    example: 35.2,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  voiceUsageSharePct: number;
}

// ─── Daily Active Users Entry ─────────────────────────────────────────────────

export class DailyActiveUsersEntryResponse {
  @JSONSchema({
    description: 'Date in YYYY-MM-DD format',
    example: '2025-01-15',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  day: string;

  @JSONSchema({
    description: 'Number of active users on this day',
    example: 1234,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  count: number;
}

// ─── Channel Split Entry ──────────────────────────────────────────────────────

export class ChannelSplitEntryResponse {
  @JSONSchema({
    description: 'Channel name (voice, text, kcc_agent, ivrs)',
    example: 'voice',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  channel: string;

  @JSONSchema({
    description: 'Percentage of sessions on this channel',
    example: 35.5,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  pct: number;
}

// ─── Voice Accuracy Entry ─────────────────────────────────────────────────────

export class VoiceAccuracyEntryResponse {
  @JSONSchema({
    description: 'Language code',
    example: 'hi',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  lang: string;

  @JSONSchema({
    description: 'Voice recognition accuracy percentage',
    example: 87.3,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  pct: number;
}

// ─── Geo State Entry ──────────────────────────────────────────────────────────

export class GeoStateEntryResponse {
  @JSONSchema({
    description: 'State name or abbreviation',
    example: 'KA',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  state: string;

  @JSONSchema({
    description: 'Number of sessions from this state',
    example: 5234,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  count: number;
}

// ─── Query Category Entry ─────────────────────────────────────────────────────

export class QueryCategoryEntryResponse {
  @JSONSchema({
    description: 'Category label',
    example: 'Crop Disease',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  label: string;

  @JSONSchema({
    description: 'Percentage of queries in this category',
    example: 28.5,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  pct: number;
}

// ─── Weekly Session Duration Entry ──────────────────────────────────────────────

export class WeeklySessionDurationEntryResponse {
  @JSONSchema({
    description: 'ISO week string (e.g., 2025-W03)',
    example: '2025-W03',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  week: string;

  @JSONSchema({
    description: 'Average session duration in minutes for this week',
    example: 5.2,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  avgSessionDurationMin: number;
}

// ─── Daily Query Count Entry ──────────────────────────────────────────────────

export class DailyQueryCountEntryResponse {
  @JSONSchema({
    description: 'Date in YYYY-MM-DD format',
    example: '2025-01-15',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  day: string;

  @JSONSchema({
    description: 'Number of queries on this day',
    example: 523,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  count: number;
}

// ─── Weekly Query Count Entry ─────────────────────────────────────────────────

export class WeeklyQueryCountEntryResponse {
  @JSONSchema({
    description: 'ISO week string (e.g., 2025-W03)',
    example: '2025-W03',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  week: string;

  @JSONSchema({
    description: 'Number of queries in this week',
    example: 3456,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  count: number;
}

// ─── User Detail Entry ────────────────────────────────────────────────────────

export class UserDetailEntryResponse {
  @JSONSchema({
    description: 'User unique identifier',
    example: '64a1b2c3d4e5f6g7h8i9j0k1',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  userId: string;

  @JSONSchema({
    description: 'User display name',
    example: 'John Smith',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  name: string;

  @JSONSchema({
    description: 'User email address',
    example: 'john.smith@example.com',
    type: 'string',
    readOnly: true,
  })
  @IsString()
  email: string;

  @JSONSchema({
    description: 'Total number of questions asked by this user',
    example: 23,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalQuestions: number;

  @JSONSchema({
    description: 'Farmer profile details (present only if the user has filled their profile)',
    type: 'object',
    nullable: true,
    readOnly: true,
  })
  farmerProfile?: Record<string, any>;
}

// ─── Paginated User Details ───────────────────────────────────────────────────

export class PaginatedUserDetailsResponse {
  @JSONSchema({
    description: 'Array of user details',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserDetailEntryResponse)
  users: UserDetailEntryResponse[];

  @JSONSchema({
    description: 'Total number of users matching the filter',
    example: 15234,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalUsers: number;

  @JSONSchema({
    description: 'Total number of pages available',
    example: 1524,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalPages: number;

  @JSONSchema({
    description: 'Number of active users (users with at least one question)',
    example: 8945,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  activeUsers: number;

  @JSONSchema({
    description: 'Total number of questions across all users',
    example: 45678,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalQuestions: number;
}

// ─── Dashboard Response ─────────────────────────────────────────────────────────

export class DashboardResponseSchema {
  @JSONSchema({
    description: 'KPI summary metrics',
    type: 'object',
    readOnly: true,
  })
  @ValidateNested()
  @Type(() => KpiSummaryResponse)
  kpi: KpiSummaryResponse;

  @JSONSchema({
    description: 'Daily active users trend over the specified period',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyActiveUsersEntryResponse)
  dau: DailyActiveUsersEntryResponse[];

  @JSONSchema({
    description: 'Channel split percentages',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelSplitEntryResponse)
  channelSplit: ChannelSplitEntryResponse[];

  @JSONSchema({
    description: 'Voice accuracy by language',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VoiceAccuracyEntryResponse)
  voiceAccuracy: VoiceAccuracyEntryResponse[];

  @JSONSchema({
    description: 'Geographic distribution of sessions by state',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeoStateEntryResponse)
  geo: GeoStateEntryResponse[];

  @JSONSchema({
    description: 'Query category breakdown with percentages',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueryCategoryEntryResponse)
  queryCategories: QueryCategoryEntryResponse[];

  @JSONSchema({
    description: 'Weekly average session duration trend',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklySessionDurationEntryResponse)
  weeklySessionDuration: WeeklySessionDurationEntryResponse[];

  @JSONSchema({
    description: 'Daily query counts over the specified period',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyQueryCountEntryResponse)
  dailyQueries: DailyQueryCountEntryResponse[];

  @JSONSchema({
    description: 'Weekly query counts (all-time)',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklyQueryCountEntryResponse)
  weeklyQueries: WeeklyQueryCountEntryResponse[];
}

// ─── Export all validators ────────────────────────────────────────────────────

export class DemographicEntryResponse {
  @JSONSchema({ description: 'Bucket label', example: '26-35', type: 'string', readOnly: true })
  @IsString()
  label: string;

  @JSONSchema({ description: 'Raw count', example: 120, type: 'number', readOnly: true })
  @IsNumber()
  count: number;

  @JSONSchema({ description: 'Percentage of total', example: 28, type: 'number', readOnly: true })
  @IsNumber()
  pct: number;
}

export class UserDemographicsResponse {
  @JSONSchema({ description: 'Age group distribution', type: 'array', items: { type: 'object' }, readOnly: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DemographicEntryResponse)
  ageGroups: DemographicEntryResponse[];

  @JSONSchema({ description: 'Gender split', type: 'array', items: { type: 'object' }, readOnly: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DemographicEntryResponse)
  genderSplit: DemographicEntryResponse[];

  @JSONSchema({ description: 'Farming experience distribution', type: 'array', items: { type: 'object' }, readOnly: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DemographicEntryResponse)
  farmingExperience: DemographicEntryResponse[];
}

export const CHATBOT_RESPONSE_VALIDATORS = [
  ChatbotErrorResponse,
  KpiSummaryResponse,
  DailyActiveUsersEntryResponse,
  ChannelSplitEntryResponse,
  VoiceAccuracyEntryResponse,
  GeoStateEntryResponse,
  QueryCategoryEntryResponse,
  WeeklySessionDurationEntryResponse,
  DailyQueryCountEntryResponse,
  WeeklyQueryCountEntryResponse,
  UserDetailEntryResponse,
  PaginatedUserDetailsResponse,
  DashboardResponseSchema,
  DemographicEntryResponse,
  UserDemographicsResponse,
];
