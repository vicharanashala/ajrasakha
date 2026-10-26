import {Transform, Type} from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
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

export class EditGdbFlagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  parameter: string;

  @IsString()
  @IsIn(['PASS', 'FAIL'])
  result: 'PASS' | 'FAIL';

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comment: string;
}

export class GdbSourceDto {
  @IsString()
  @MaxLength(500)
  sourceName: string;

  @IsString()
  @MaxLength(2000)
  source: string;

  @IsString()
  @MaxLength(100)
  page: string;

  @IsOptional()
  @IsIn(['hyper_local', 'state', 'central', 'district', 'other'])
  sourceType?: 'hyper_local' | 'state' | 'central' | 'district' | 'other';
}

export class SaveGdbSourcesDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({each: true})
  @Type(() => GdbSourceDto)
  sources: GdbSourceDto[];
}

export const GDB_CLEANING_VALIDATORS = [
  GdbCleaningAnswerParam,
  GetGdbCleaningListQuery,
  SaveGdbCorrectionDto,
  GdbDecisionDto,
  EditGdbFlagDto,
  GdbSourceDto,
  SaveGdbSourcesDto,
];
