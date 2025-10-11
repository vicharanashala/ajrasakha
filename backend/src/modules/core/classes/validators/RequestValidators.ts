import {
  IsString,
  IsOptional,
  IsEnum,
  ValidateNested,
  IsInt,
  Min,
  IsIn,
} from 'class-validator';
import {Type} from 'class-transformer';
import {ObjectId} from 'mongodb';
import {IQuestion} from '#root/shared/index.js';

type RequestStatus = 'pending' | 'rejected' | 'approved' | 'in-review';

class RequestParamsDto {
  @IsString()
  requestId!: string;
}

class RequestStatusBody {
  @IsEnum(['pending', 'rejected', 'approved', 'in-review'])
  status!: RequestStatus;
}

class ModeratorResponseDto {
  @IsString()
  moderatorId!: string | ObjectId;

  @IsEnum(['pending', 'rejected', 'approved', 'in-review'])
  status!: RequestStatus;

  @IsOptional()
  @IsString()
  response?: string;

  @IsOptional()
  reviewedAt?: Date;

  @IsOptional()
  @IsString()
  moderatorName?: string;
}

class RequestDetailsQuestionDto {
  @IsString()
  requestType!: 'question_flag';

  @ValidateNested()
  @Type(() => Object)
  details!: IQuestion | null;
}

class RequestDetailsOtherDto {
  @IsString()
  requestType!: 'others';

  @ValidateNested()
  @Type(() => Object)
  details!: Record<string, any> | null;
}

type RequestDetailsDto = RequestDetailsQuestionDto | RequestDetailsOtherDto;

class CreateRequestBodyDto {
  @IsString()
  reason!: string;

  @IsString()
  entityId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  details?: RequestDetailsDto;
}

class UpdateRequestStatusDto {
  @IsEnum(['pending', 'rejected', 'approved', 'in-review'])
  status!: RequestStatus;

  @IsOptional()
  @IsString()
  response?: string;
}

class GetAllRequestsQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsIn(['all', 'pending', 'rejected', 'approved', 'in-review'])
  status?: 'all' & RequestStatus;

  @IsOptional()
  @IsIn(['all', 'question_flag', 'others'])
  requestType?: 'all' | 'question_flag' | 'others';

  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sortOrder?: 'newest' | 'oldest';
}

export {
  UpdateRequestStatusDto,
  CreateRequestBodyDto,
  RequestDetailsDto,
  RequestDetailsOtherDto,
  RequestDetailsQuestionDto,
  ModeratorResponseDto,
  RequestStatusBody,
  RequestParamsDto,
  RequestStatus,
  GetAllRequestsQueryDto,
};
export const REQUEST_VALIDATORS = [
  UpdateRequestStatusDto,
  CreateRequestBodyDto,
  RequestDetailsOtherDto,
  RequestDetailsQuestionDto,
  ModeratorResponseDto,
  RequestStatusBody,
  RequestParamsDto,
  GetAllRequestsQueryDto,
];
