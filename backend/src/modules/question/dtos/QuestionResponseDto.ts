import { Expose, Type, Transform } from 'class-transformer';
import { IsString, IsEmail, IsBoolean, IsNumber, IsOptional, ValidateNested, IsObject, IsArray, IsEnum, IsDate } from 'class-validator';
import { IQuestionPriority, ICropRef, QuestionStatus, QuestionSource } from '#shared/interfaces/models.js';
import { PaginationMetaDto } from '#root/shared/dtos/PaginationDto.js';

export class QuestionDetailsDto {
  @Expose()
  @IsString()
  state: string;

  @Expose()
  @IsString()
  district: string;

  @Expose()
  @IsString()
  crop: string;

  @Expose()
  @IsString()
  season: string;

  @Expose()
  @IsString()
  domain: string;

  @Expose()
  @IsOptional()
  @IsString()
  normalised_crop?: string;
}

export class UpdatedByDto {
  @Expose()
  @Transform(({ value }) => value?.toString())
  @IsString()
  _id: string;

  @Expose()
  @IsString()
  userName: string;

  @Expose()
  @IsString()
  @IsOptional()
  avatar?: string;
}

export class AnswerDetailsDto {
  @Expose()
  @Transform(({ value }) => value?.toString())
  @IsString()
  _id: string;

  @Expose()
  @IsString()
  answer: string;

  @Expose()
  @IsNumber()
  approvalCount: number;

  @Expose()
  @IsArray()
  @IsString({ each: true })
  sources: string[];
}

export class HistoryItemDto {
  @Expose()
  @ValidateNested()
  @Type(() => UpdatedByDto)
  updatedBy: UpdatedByDto;

  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => AnswerDetailsDto)
  answer?: AnswerDetailsDto;

  @Expose()
  @IsOptional()
  @IsEnum(['approved', 'rejected', 'in-review'])
  status?: 'approved' | 'rejected' | 'in-review';

  @Expose()
  @IsOptional()
  @IsString()
  reasonForRejection?: string;

  @Expose()
  @IsOptional()
  @IsString()
  approvedAnswer?: string;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}

export class QuestionResponseDto {
  @Expose()
  @Transform(({ value, obj }) => value?.toString() || obj._id?.toString() || obj.id?.toString())
  id: string;

  @Expose()
  @Transform(({ value, obj }) => value?.toString() || obj._id?.toString() || obj.id?.toString())
  _id: string;

  @Expose()
  @Transform(({ value, obj }) => value || obj.question || obj.text)
  text: string;

  @Expose()
  @Transform(({ value, obj }) => value || obj.question || obj.text)
  question: string;

  @Expose()
  @IsEnum(['low', 'medium', 'high'])
  @IsOptional()
  priority?: IQuestionPriority;

  @Expose()
  @IsDate()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @IsDate()
  @Type(() => Date)
  updatedAt: Date;

  @Expose()
  @IsNumber()
  totalAnswersCount: number;

  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionDetailsDto)
  details?: QuestionDetailsDto;

  @Expose()
  @Transform(({ value }) => value?.toString())
  @IsString()
  userId?: string;

  @Expose()
  @IsEnum(['open', 'answered', 'closed'])
  @IsOptional()
  status?: QuestionStatus;

  @Expose()
  @IsEnum(['AJRASAKHA', 'AGRI_EXPERT', 'WHATSAPP', 'OUTREACH'])
  source: QuestionSource;

  @Expose()
  @IsOptional()
  @IsArray()
  currentAnswers?: { answer: string; id: string; isFinalAnswer: boolean }[];

  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistoryItemDto)
  history?: HistoryItemDto[];

  @Expose()
  @IsOptional()
  @IsString()
  aiInitialAnswer?: string;

  @Expose()
  @IsOptional()
  @IsArray()
  aiApprovedSources?: any[];

  @Expose()
  @IsOptional()
  @IsString()
  aiApprovedAnswer?: string;

  @Expose()
  @IsOptional()
  @IsBoolean()
  isAutoAllocate?: boolean;

  @Expose()
  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  @Expose()
  @IsOptional()
  @IsBoolean()
  isOnHold?: boolean;

  @Expose()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  closedAt?: Date;

  @Expose()
  @IsOptional()
  @IsString()
  review_level_number?: string | number;
}

export class PaginatedQuestionsResponseDto {
  @Expose()
  @ValidateNested({ each: true })
  @Type(() => QuestionResponseDto)
  questions: QuestionResponseDto[];

  @Expose()
  @ValidateNested()
  @Type(() => PaginationMetaDto)
  meta: PaginationMetaDto;
}
