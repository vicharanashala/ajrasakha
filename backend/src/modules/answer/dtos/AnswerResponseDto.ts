import {Expose, Type} from 'class-transformer';
import {IsString, IsBoolean, IsNumber, IsOptional, ValidateNested, IsArray, IsDateString} from 'class-validator';
import {PaginationMetaDto} from '#root/shared/dtos/PaginationDto.js';

export class AnswerSourceDto {
  @Expose()
  @IsString()
  source: string;

  @Expose()
  @IsNumber()
  @IsOptional()
  page?: number;
}

export class BaseAnswerDto {
  @Expose()
  @IsString()
  _id: string;

  @Expose()
  @IsString()
  answer: string;

  @Expose()
  @IsBoolean()
  isFinalAnswer: boolean;

  @Expose()
  @IsString()
  @IsOptional()
  status?: string;

  @Expose()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => AnswerSourceDto)
  @IsOptional()
  sources?: AnswerSourceDto[];

  @Expose()
  @IsString()
  @IsOptional()
  questionId?: string;

  @Expose()
  @IsString()
  @IsOptional()
  authorId?: string;

  @Expose()
  @IsDateString()
  @IsOptional()
  createdAt?: string | Date;

  @Expose()
  @IsDateString()
  @IsOptional()
  updatedAt?: string | Date;
}

export class AnswerSubmissionResponseDto {
  @Expose()
  @IsString()
  id: string;

  @Expose()
  @IsString()
  text: string;

  @Expose()
  @IsDateString()
  createdAt: string;

  @Expose()
  @IsDateString()
  updatedAt: string;

  @Expose()
  @IsNumber()
  totalAnwersCount: number;

  @Expose()
  @IsString()
  @IsOptional()
  questionStatus?: string;

  @Expose()
  @ValidateNested()
  @Type(() => BaseAnswerDto)
  @IsOptional()
  response?: BaseAnswerDto;
}

export class PaginatedSubmissionsResponseDto {
  @Expose()
  @ValidateNested({each: true})
  @Type(() => AnswerSubmissionResponseDto)
  submissions: AnswerSubmissionResponseDto[];

  @Expose()
  @ValidateNested()
  @Type(() => PaginationMetaDto)
  meta: PaginationMetaDto;
}

export class FinalizedAnswerResponseDto {
  @Expose()
  @ValidateNested({each: true})
  @Type(() => AnswerSubmissionResponseDto)
  finalizedSubmissions: AnswerSubmissionResponseDto[];
}

export class GoldenFaqItemDto {
  @Expose()
  @IsString()
  _id: string;

  @Expose()
  @IsString()
  answer: string;

  @Expose()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => AnswerSourceDto)
  sources: AnswerSourceDto[];

  @Expose()
  @IsOptional()
  question?: any; // Reusing logic for now, but should be more specific if possible

  @Expose()
  @IsDateString()
  createdAt: string;
}

export class GoldenFaqResponseDto {
  @Expose()
  @ValidateNested({each: true})
  @Type(() => GoldenFaqItemDto)
  faqs: GoldenFaqItemDto[];

  @Expose()
  @IsNumber()
  totalFaqs: number;
}
