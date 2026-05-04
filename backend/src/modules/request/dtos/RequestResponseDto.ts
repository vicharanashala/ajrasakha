import { Expose, Type } from 'class-transformer';
import { IsString, IsNumber, IsArray, ValidateNested, IsOptional, IsObject, IsBoolean } from 'class-validator';

export class RequestResponseDto {
  @Expose()
  @Type(() => String)
  @IsString()
  reviewedBy: string;

  @Expose()
  @IsString()
  role: string;

  @Expose()
  @IsString()
  status: string;

  @Expose()
  @IsOptional()
  @IsString()
  response?: string;

  @Expose()
  @IsOptional()
  reviewedAt?: Date;

  @Expose()
  @IsOptional()
  @IsString()
  reviewerName?: string;
}

export class RequestDto {
  @Expose({ name: '_id' })
  @Type(() => String)
  @IsString()
  _id: string;

  @Expose()
  @IsString()
  reason: string;

  @Expose()
  @Type(() => String)
  @IsString()
  requestedBy: string;

  @Expose()
  @Type(() => String)
  @IsString()
  entityId: string;

  @Expose()
  @ValidateNested({ each: true })
  @Type(() => RequestResponseDto)
  responses: RequestResponseDto[];

  @Expose()
  @IsString()
  status: string;

  @Expose()
  @IsString()
  requestType: string;

  @Expose()
  @IsOptional()
  @IsObject()
  details?: any;

  @Expose()
  @IsBoolean()
  @IsOptional()
  isDeleted?: boolean;

  @Expose()
  @IsOptional()
  createdAt?: Date;

  @Expose()
  @IsOptional()
  updatedAt?: Date;
}

export class PaginatedRequestsResponseDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequestDto)
  requests: RequestDto[];

  @Expose()
  @IsNumber()
  totalPages: number;

  @Expose()
  @IsNumber()
  totalCount: number;
}

export class RequestDiffResponseDto {
  @Expose()
  @IsObject()
  @IsOptional()
  currentDoc: any;

  @Expose()
  @IsObject()
  @IsOptional()
  existingDoc: any;

  @Expose()
  @ValidateNested({ each: true })
  @Type(() => RequestResponseDto)
  responses: RequestResponseDto[];
}
