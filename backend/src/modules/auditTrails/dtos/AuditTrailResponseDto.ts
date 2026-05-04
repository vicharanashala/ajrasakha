import { Expose, Type } from 'class-transformer';
import { IsString, IsNumber, IsArray, IsObject, IsOptional, ValidateNested, IsEnum } from 'class-validator';
import { AuditCategory, AuditAction, OutComeStatus } from '../interfaces/IAuditTrails.js';

export class ActorDto {
  @Expose()
  @IsString()
  @IsOptional()
  id?: string;

  @Expose()
  @IsString()
  @IsOptional()
  name?: string;

  @Expose()
  @IsString()
  @IsOptional()
  email?: string;

  @Expose()
  @IsString()
  @IsOptional()
  role?: string;

  @Expose()
  @IsString()
  @IsOptional()
  avatar?: string;

  @Expose()
  @IsString()
  @IsOptional()
  source?: string;
}

export class ChangesDto {
  @Expose()
  @IsObject()
  @IsOptional()
  before?: Record<string, any>;

  @Expose()
  @IsObject()
  @IsOptional()
  after?: Record<string, any>;
}

export class OutcomeDto {
  @Expose()
  @IsEnum(OutComeStatus)
  status: OutComeStatus;

  @Expose()
  @IsString()
  @IsOptional()
  errorCode?: string;

  @Expose()
  @IsString()
  @IsOptional()
  errorMessage?: string;

  @Expose()
  @IsString()
  @IsOptional()
  errorName?: string;

  @Expose()
  @IsString()
  @IsOptional()
  errorStack?: string;
}

export class AuditTrailDto {
  @Expose()
  @Type(() => String)
  @IsString()
  _id: string;

  @Expose()
  @IsEnum(AuditCategory)
  category: AuditCategory;

  @Expose()
  @IsEnum(AuditAction)
  action: AuditAction;

  @Expose()
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @Expose()
  @IsObject()
  @IsOptional()
  context?: Record<string, any>;

  @Expose()
  @ValidateNested()
  @Type(() => ChangesDto)
  @IsOptional()
  changes?: ChangesDto;

  @Expose()
  @ValidateNested()
  @Type(() => OutcomeDto)
  @IsOptional()
  outcome?: OutcomeDto;

  @Expose()
  @IsString()
  @IsOptional()
  createdAt?: string;
}

export class AuditTrailListResponseDto {
  @Expose()
  @IsString()
  message: string;

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuditTrailDto)
  data: AuditTrailDto[];

  @Expose()
  @IsNumber()
  totalDocuments: number;

  @Expose()
  @IsNumber()
  totalPages: number;

  @Expose()
  @IsNumber()
  currentPage: number;
}
