import { Expose, Type } from 'class-transformer';
import { IsString, IsNumber, IsBoolean, IsArray, IsOptional, IsObject, ValidateNested } from 'class-validator';

export class WorkloadResponseDto {
  @Expose()
  @IsNumber()
  currentUserAnswersCount: number;

  @Expose()
  @IsNumber()
  totalQuestionsCount: number;

  @Expose()
  @IsNumber()
  totalInreviewQuestionsCount: number;
}

export class ReviewerHeatmapRowResponseDto {
  @Expose()
  @IsString()
  reviewerId: string;

  @Expose()
  @IsString()
  reviewerName: string;

  @Expose()
  @IsObject()
  counts: Record<string, number>;
}

export class ReviewerHeatmapResponseDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewerHeatmapRowResponseDto)
  data: ReviewerHeatmapRowResponseDto[];

  @Expose()
  @IsNumber()
  total: number;
}

export class CheckInResponseDto {
  @Expose()
  @IsBoolean()
  success: boolean;

  @Expose()
  @IsString()
  lastCheckInAt: string;
}
