import { Expose, Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsOptional, IsNumber, IsObject } from 'class-validator';

/**
 * Standard success message response
 */
export class ReRouteMessageResponseDto {
  @Expose()
  @IsNotEmpty()
  @IsString()
  message: string;
}

/**
 * Standard error response
 */
export class ReRouteErrorResponseDto {
  @Expose()
  @IsNotEmpty()
  @IsString()
  message: string;
}

/**
 * Reroute history entry
 */
export class RerouteHistoryEntryDto {
  @Expose()
  @IsString()
  reroutedBy: string;

  @Expose()
  @IsString()
  reroutedTo: string;

  @Expose()
  @IsString()
  reroutedAt: string;

  @Expose()
  @IsOptional()
  @IsString()
  answerId?: string;

  @Expose()
  @IsString()
  status: string;

  @Expose()
  @IsOptional()
  @IsString()
  moderatorRejectionReason?: string;

  @Expose()
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @Expose()
  @IsOptional()
  @IsString()
  comment?: string;

  @Expose()
  @IsString()
  updatedAt: string;
}

/**
 * Response containing an array of reroute history entries
 */
export class RerouteHistoryResponseDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RerouteHistoryEntryDto)
  history: RerouteHistoryEntryDto[];
}

/**
 * Allocated question entry
 */
export class AllocatedQuestionDto {
  @Expose()
  @IsString()
  id: string;

  @Expose()
  @IsString()
  text: string;

  @Expose()
  @IsString()
  status: string;

  @Expose()
  @IsString()
  priority: string;

  @Expose()
  @IsString()
  source: string;

  @Expose()
  @IsNumber()
  totalAnswersCount: number;

  @Expose()
  @IsOptional()
  @IsString()
  createdAt?: string;

  @Expose()
  @IsOptional()
  @IsString()
  updatedAt?: string;
}

/**
 * Response containing an array of allocated questions
 */
export class AllocatedQuestionsResponseDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocatedQuestionDto)
  questions: AllocatedQuestionDto[];
}

/**
 * Question details (state, district, crop, etc.)
 */
export class QuestionDetailsDto {
  @Expose()
  @IsOptional()
  @IsString()
  state?: string;

  @Expose()
  @IsOptional()
  @IsString()
  district?: string;

  @Expose()
  @IsOptional()
  @IsString()
  crop?: string;

  @Expose()
  @IsOptional()
  @IsString()
  season?: string;

  @Expose()
  @IsOptional()
  @IsString()
  domain?: string;
}

/**
 * Detailed question response
 */
export class QuestionDetailedResponseDto {
  @Expose()
  @IsString()
  id: string;

  @Expose()
  @IsString()
  text: string;

  @Expose()
  @IsString()
  source: string;

  @Expose()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => QuestionDetailsDto)
  details?: QuestionDetailsDto;

  @Expose()
  @IsString()
  status: string;

  @Expose()
  @IsString()
  priority: string;

  @Expose()
  @IsString()
  aiInitialAnswer: string;

  @Expose()
  @IsString()
  createdAt: string;

  @Expose()
  @IsString()
  updatedAt: string;

  @Expose()
  @IsNumber()
  totalAnswersCount: number;

  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RerouteHistoryEntryDto)
  history?: RerouteHistoryEntryDto[];
}
