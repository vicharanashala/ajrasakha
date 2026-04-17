import { IsString, IsBoolean, IsNumber, IsArray, IsDateString, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * When a review level has time details
 */
export class ReviewLevelTimeValue {
  @IsString()
  time!: string;

  @IsBoolean()
  yet_to_complete!: boolean;
}

/**
 * Each review level row
 */
export class ReviewLevel {
  @IsString()
  column!: string;

  /**
   * value can be:
   *  - "NA"
   *  - { time, yet_to_complete }
   */
  @IsOptional()
  @IsString()
  value?: string; // for "NA"

  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewLevelTimeValue)
  objectValue?: ReviewLevelTimeValue;
}

/**
 * Single question entry
 */
export class QuestionItem {
  @IsString()
  _id!: string;

  @IsString()
  question!: string;

  @IsString()
  status!: string;

  @IsDateString()
  createdAt!: Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewLevel)
  reviewLevels!: ReviewLevel[];
}

/**
 * Main paginated response wrapper
 */
export class QuestionLevelResponse {
  @IsNumber()
  page!: number;

  @IsNumber()
  limit!: number;

  @IsNumber()
  totalDocs!: number;

  @IsNumber()
  totalPages!: number;

  @IsBoolean()
  hasNextPage!: boolean;

  @IsBoolean()
  hasPrevPage!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionItem)
  data!: QuestionItem[];
}
