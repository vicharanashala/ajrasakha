import { Expose, Type } from 'class-transformer';
import { IsString, IsArray, IsOptional, IsDate, ValidateNested } from 'class-validator';

export class CropAliasDto {
  @Expose()
  @IsString()
  language: string;

  @Expose()
  @IsString()
  region: string;

  @Expose()
  @IsString()
  english_representation: string;

  @Expose()
  @IsString()
  native_representation: string;
}

export class CropResponseDto {
  @Expose()
  @IsString()
  _id: string;

  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CropAliasDto)
  aliases: (CropAliasDto | string)[];

  @Expose()
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  updatedAt: Date;
}

export class PaginatedCropsResponseDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CropResponseDto)
  crops: CropResponseDto[];

  @Expose()
  @Type(() => Number)
  totalCount: number;

  @Expose()
  @Type(() => Number)
  totalPages: number;
}
