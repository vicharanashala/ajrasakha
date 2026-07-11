import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class DashboardFigureDto {
  @IsString()
  label: string;

  @IsString()
  value: string;
}

class DashboardBlockDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  heading: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardFigureDto)
  figures?: DashboardFigureDto[];

  @IsOptional()
  @IsNumber()
  order?: number;
}

export class UpdateDashboardContentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardBlockDto)
  blocks: DashboardBlockDto[];
}

export const DASHBOARD_CONTENT_VALIDATORS = [
  DashboardFigureDto,
  DashboardBlockDto,
  UpdateDashboardContentDto,
];
