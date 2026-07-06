import { IsOptional, IsIn, IsInt, IsString, Min, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

export class DashboardQueryDto {
  @JSONSchema({ example: 30, description: 'Number of days to look back' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days: number = 30;

  @JSONSchema({ example: 'annam', description: 'Data source to query' })
  @IsOptional()
  @IsIn([ 'annam', 'whatsapp'])
  source: 'annam' | 'whatsapp'= 'annam';

  @JSONSchema({ example: 'all', description: 'Filter by user type: all, external (username starts with rup), or internal' })
  @IsOptional()
  @IsIn(['all', 'external', 'internal'])
  userType: 'all' | 'external' | 'internal' = 'all';

  @JSONSchema({ example: '2026-05-18T10:00:00Z', description: 'Filter start time (ISO string)' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @JSONSchema({ example: '2026-05-19T10:00:00Z', description: 'Filter end time (ISO string)' })
  @IsOptional()
  @IsString()
  endTime?: string;
}

export class SourceQueryDto {
  @JSONSchema({ example: 'annam', description: 'Data source to query' })
  @IsOptional()
  @IsIn([ 'annam', 'whatsapp'])
  source: 'annam' | 'whatsapp' = 'annam';

  @JSONSchema({ example: 'all', description: 'Filter by user type: all, external (username starts with rup), or internal' })
  @IsOptional()
  @IsIn(['all', 'external', 'internal'])
  userType: 'all' | 'external' | 'internal' = 'all';
}

export class QueryAnalyticsQueryDto extends SourceQueryDto {
  @JSONSchema({ example: 'daily', description: 'Analytics period: daily, weekly, or monthly' })
  @IsIn(['daily', 'weekly', 'monthly'])
  period: 'daily' | 'weekly' | 'monthly' = 'daily';

  @JSONSchema({ example: '2026-05', description: 'Month filter for daily and weekly analytics (YYYY-MM)' })
  @IsOptional()
  @IsString()
  month?: string;

  @JSONSchema({ example: 2026, description: 'Year filter for monthly analytics' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  year?: number;

  @JSONSchema({ example: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @JSONSchema({ example: 10, description: 'Results per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;
}

export class QueryCategoryQuestionsQueryDto extends SourceQueryDto {
  @JSONSchema({ example: 'Disease Management', description: 'Category/domain label to list questions for' })
  @IsString()
  category: string;

  @JSONSchema({ example: 'all', description: 'Question filter: all, unique, or duplicate' })
  @IsOptional()
  @IsIn(['all', 'unique', 'duplicate'])
  questionType: 'all' | 'unique' | 'duplicate' = 'all';

  @JSONSchema({ example: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @JSONSchema({ example: 10, description: 'Results per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;
}

export class WeatherConcernAnalyticsQueryDto extends SourceQueryDto {
  @JSONSchema({ example: 'Kharif', description: 'Filter by season' })
  @IsOptional()
  @IsString()
  season?: string;

  @JSONSchema({ example: 'Punjab', description: 'Filter by farmer state' })
  @IsOptional()
  @IsString()
  state?: string;

  @JSONSchema({ example: 'Rupnagar', description: 'Filter by farmer district' })
  @IsOptional()
  @IsString()
  district?: string;

  @JSONSchema({ example: 'Erattupetta', description: 'Filter by farmer block' })
  @IsOptional()
  @IsString()
  block?: string;

  @JSONSchema({ example: 'Poonjar', description: 'Filter by farmer village' })
  @IsOptional()
  @IsString()
  village?: string;

  @JSONSchema({ example: '2026-07-01T00:00:00.000Z', description: 'Filter weather queries from this date/time' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @JSONSchema({ example: '2026-07-31T23:59:59.999Z', description: 'Filter weather queries through this date/time' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class WeatherConcernQueriesQueryDto extends WeatherConcernAnalyticsQueryDto {
  @JSONSchema({ example: 'Rain', description: 'The concern label to fetch queries for' })
  @IsNotEmpty()
  @IsString()
  concern!: string;

  @JSONSchema({ example: 1, description: 'Page number for pagination' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @JSONSchema({ example: 10, description: 'Results per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @JSONSchema({ example: 'rain', description: 'Search by name, email, question text, or message ID' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class DemographicUsersQueryDto {
  @JSONSchema({ example: 'age', description: 'Demographic category to filter by' })
  @IsNotEmpty()
  @IsString()
  category!: string;

  @JSONSchema({ example: '16-30', description: 'Demographic value to filter by' })
  @IsNotEmpty()
  @IsString()
  value!: string;

  @JSONSchema({ example: 'annam', description: 'Data source to query' })
  @IsOptional()
  @IsIn(['annam', 'whatsapp'])
  source: 'annam' | 'whatsapp' = 'annam';

  @JSONSchema({ example: 'all', description: 'Filter by user type: all, external (username starts with rup), or internal' })
  @IsOptional()
  @IsIn(['all', 'external', 'internal'])
  userType: 'all' | 'external' | 'internal' = 'all';

  @JSONSchema({ example: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @JSONSchema({ example: 10, description: 'Results per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @JSONSchema({ example: 'john', description: 'Search by name, username, or email' })
  @IsOptional()
  @IsString()
  search: string = '';

  @JSONSchema({ example: 'name', description: 'Sort by field: name, farmerName, email, or createdAt' })
  @IsOptional()
  @IsIn(['name', 'farmerName', 'email', 'createdAt'])
  sortBy: 'name' | 'farmerName' | 'email' | 'createdAt' = 'createdAt';

  @JSONSchema({ example: 'asc', description: 'Sort order: asc or desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class UserDetailsQueryDto {
  @JSONSchema({ example: '2025-01-01', description: 'Filter start date (ISO string)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @JSONSchema({ example: '2025-12-31', description: 'Filter end date (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @JSONSchema({ example: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @JSONSchema({ example: 10, description: 'Results per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @JSONSchema({ example: 'john', description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  search: string = '';

  @JSONSchema({ example: 'annam', description: 'Data source to query' })
  @IsOptional()
  @IsIn([ 'annam', 'whatsapp'])
  source: 'annam' | 'whatsapp'= 'annam';

  @JSONSchema({ example: 'rice', description: 'Filter by crop (matches cropsCultivated, primaryCrop, secondaryCrop)' })
  @IsOptional()
  @IsString()
  crop: string = '';

  @JSONSchema({ example: 'rice,wheat', description: 'Comma-separated primary crop filters' })
  @IsOptional()
  @IsString()
  primaryCrops: string = '';

  @JSONSchema({ example: 'maize,cotton', description: 'Comma-separated secondary crop filters' })
  @IsOptional()
  @IsString()
  secondaryCrops: string = '';

  @JSONSchema({ example: 'Poonjar', description: 'Filter by village name' })
  @IsOptional()
  @IsString()
  village: string = '';

  @JSONSchema({ example: 'Kerala', description: 'Filter by farmer state' })
  @IsOptional()
  @IsString()
  state: string = '';

  @JSONSchema({ example: 'Kottayam', description: 'Filter by farmer district' })
  @IsOptional()
  @IsString()
  district: string = '';

  @JSONSchema({ example: 'Erattupetta', description: 'Filter by farmer block' })
  @IsOptional()
  @IsString()
  block: string = '';

  @JSONSchema({ example: 'yes', description: 'Filter by farmer profile completion: yes, no, or all' })
  @IsOptional()
  @IsIn(['yes', 'no', 'all'])
  profileCompleted: 'yes' | 'no' | 'all' = 'all';

  @JSONSchema({ example: 'false', description: 'If true, return only users with zero questions in the date range' })
  @IsOptional()
  @IsString()
  inactiveOnly?: string;

  @JSONSchema({ example: 'false', description: 'If true, return only users who have never given any feedback' })
  @IsOptional()
  @IsString()
  lowFeedbackOnly?: string;

  @JSONSchema({ example: 'all', description: 'Filter by user type: all, external (username starts with rup), or internal' })
  @IsOptional()
  @IsIn(['all', 'external', 'internal'])
  userType: 'all' | 'external' | 'internal' = 'all';

  @JSONSchema({ example: 'FARMER,INTERNAL', description: 'Comma-separated role filters' })
  @IsOptional()
  @IsString()
  roles: string = '';

  @JSONSchema({ example: 'false', description: 'If true, filter users by lastActiveAt is today and has farmerProfile' })
  @IsOptional()
  @IsString()
  activeTodayByProfile?: string;

  @JSONSchema({ example: 'totalQuestions', description: 'Sort by field: totalQuestions, name, farmerName, email, or createdAt' })
  @IsOptional()
  @IsIn(['totalQuestions', 'name', 'farmerName', 'email', 'createdAt'])
  sortBy: 'totalQuestions' | 'name' | 'farmerName' | 'email' | 'createdAt' = 'totalQuestions';

  @JSONSchema({ example: 'desc', description: 'Sort order: asc or desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  @JSONSchema({ example: 'age', description: 'Filter by users missing a specific demographic field in farmerProfile' })
  @IsOptional()
  @IsString()
  missingDemographicField?: string;

   @JSONSchema({ example: 'true', description: 'If true, return only users who are verified' })
  @IsOptional()
  @IsString()
  isVerified?: string;

  @JSONSchema({ example: 'loggedIn', description: 'Filter by login status: all, loggedIn, or loggedOut' })
  @IsOptional()
  @IsIn(['all', 'loggedIn', 'loggedOut'])
  loginStatus: 'all' | 'loggedIn' | 'loggedOut' = 'all';
}
