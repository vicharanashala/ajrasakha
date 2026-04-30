import {IsNumber, IsArray, ValidateNested} from 'class-validator';
import {Type} from 'class-transformer';

export class PaginationMetaDto {
  @IsNumber()
  totalItems: number;

  @IsNumber()
  totalPages: number;

  @IsNumber()
  currentPage: number;

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
