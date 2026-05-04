import {IsNumber, IsArray, ValidateNested} from 'class-validator';
import {Type, Expose} from 'class-transformer';

export class PaginationMetaDto {
  @Expose()
  @IsNumber()
  totalItems: number;

  @Expose()
  @IsNumber()
  totalPages: number;

  @Expose()
  @IsNumber()
  currentPage: number;

  @Expose()
  @IsNumber()
  limit: number;
}

export class PaginatedResponseDto<T> {
  @IsArray()
  items: T[];

  @ValidateNested()
  @Type(() => PaginationMetaDto)
  meta: PaginationMetaDto;
}
