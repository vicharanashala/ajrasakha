import {Transform, Type} from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const STATUSES = ['pending', 'clean', 'todo', 'fixed', 'dismissed'];

// a filter is sent as a repeated parameter, for example states=Punjab&states=Haryana,
// and a single value still has to end up as a list
const toList = ({value}: {value: unknown}) =>
  value === undefined || Array.isArray(value) ? value : [value];

export class GdbCleaningAnswerParam {
  @IsString()
  @IsNotEmpty()
  answerId: string;
}

export class GetGdbCleaningListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(toList)
  @IsString({each: true})
  states?: string[];

  @IsOptional()
  @Transform(toList)
  @IsString({each: true})
  crops?: string[];

  @IsOptional()
  @Transform(toList)
  @IsString({each: true})
  flags?: string[];

  @IsOptional()
  @Transform(toList)
  @IsIn(STATUSES, {each: true})
  statuses?: ('pending' | 'clean' | 'todo' | 'fixed' | 'dismissed')[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SaveGdbCorrectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  correctedAnswer: string;
}

export class GdbDecisionDto {
  @IsString()
  @IsIn(['accept', 'dismiss'])
  action: 'accept' | 'dismiss';

  // an accepted answer can carry an edited correction
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  correctedAnswer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export const GDB_CLEANING_VALIDATORS = [
  GdbCleaningAnswerParam,
  GetGdbCleaningListQuery,
  SaveGdbCorrectionDto,
  GdbDecisionDto,
];
