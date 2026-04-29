import { IsOptional, IsIn, IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

export class DashboardQueryDto {
  @JSONSchema({ example: 30, description: 'Number of days to look back' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days: number = 30;

  @JSONSchema({ example: 'vicharanashala', description: 'Data source to query' })
  @IsOptional()
  @IsIn(['vicharanashala', 'annam'])
  source: 'vicharanashala' | 'annam' = 'vicharanashala';
}

export class SourceQueryDto {
  @JSONSchema({ example: 'vicharanashala', description: 'Data source to query' })
  @IsOptional()
  @IsIn(['vicharanashala', 'annam'])
  source: 'vicharanashala' | 'annam' = 'vicharanashala';
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

  @JSONSchema({ example: 'vicharanashala', description: 'Data source to query' })
  @IsOptional()
  @IsIn(['vicharanashala', 'annam'])
  source: 'vicharanashala' | 'annam' = 'vicharanashala';

  @JSONSchema({ example: 'rice', description: 'Filter by crop (matches cropsCultivated, primaryCrop, secondaryCrop)' })
  @IsOptional()
  @IsString()
  crop: string = '';

  @JSONSchema({ example: 'Poonjar', description: 'Filter by village name' })
  @IsOptional()
  @IsString()
  village: string = '';

  @JSONSchema({ example: 'yes', description: 'Filter by farmer profile completion: yes, no, or all' })
  @IsOptional()
  @IsIn(['yes', 'no', 'all'])
  profileCompleted: 'yes' | 'no' | 'all' = 'all';

  @JSONSchema({ example: 'false', description: 'If true, return only users with zero questions in the date range' })
  @IsOptional()
  @IsString()
  inactiveOnly?: string;

  @JSONSchema({ example: 'all', description: 'Filter by farmer type: all, internal, or external' })
  @IsOptional()
  @IsIn(['all', 'internal', 'external'])
  farmerType: 'all' | 'internal' | 'external' = 'all';
}
