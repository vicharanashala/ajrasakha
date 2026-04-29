import {
  IsNotEmpty,
  IsString,
  IsArray,
  IsOptional,
  IsMongoId,
  IsInt,
  Min,
  Max,
  IsIn,
  ValidateNested,
} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';
import {Type} from 'class-transformer';

// ── Param Validators ──

class CropIdParam {
  @JSONSchema({
    description: 'MongoDB ObjectId of the crop',
    example: '650e9c0f5f1b2c002f4d9e00',
    type: 'string',
  })
  @IsMongoId()
  cropId: string;
}

// ── Nested DTO ──

class CropAliasDto {
  @JSONSchema({ description: 'BCP-47 language code', example: 'te-IN' })
  @IsNotEmpty()
  @IsString()
  language: string;

  @JSONSchema({ description: 'Region/state where alias is used', example: 'Andhra and Telangana' })
  @IsNotEmpty()
  @IsString()
  region: string;

  @JSONSchema({ description: 'Romanised / English representation', example: 'vari' })
  @IsNotEmpty()
  @IsString()
  english_representation: string;

  @JSONSchema({ description: 'Native script representation', example: 'వరి' })
  @IsNotEmpty()
  @IsString()
  native_representation: string;
}

// ── Body DTOs ──

class CreateCropDto {
  @JSONSchema({
    description: 'Unique name of the crop',
    example: 'Paddy',
    type: 'string',
  })
  @IsNotEmpty({message: 'Crop name is required'})
  @IsString()
  name: string;

  @JSONSchema({
    description: 'Structured aliases for the crop across languages',
    example: [{ language: 'te-IN', region: 'Andhra and Telangana', english_representation: 'vari', native_representation: 'వరి' }],
    type: 'array',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CropAliasDto)
  aliases?: CropAliasDto[];
}

class UpdateCropDto {
  @JSONSchema({
    description: 'Updated aliases — accepts both legacy strings and new structured objects',
    example: [{ language: 'hi-IN', region: 'North India', english_representation: 'dhan', native_representation: 'धान' }],
    type: 'array',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CropAliasDto)
  aliases?: (CropAliasDto | string)[];
}

// ── Query DTOs ──

class GetAllCropsQuery {
  @JSONSchema({description: 'Search crop by name or alias', example: 'Rice', type: 'string'})
  @IsOptional()
  @IsString()
  search?: string;

  @JSONSchema({description: 'Sort order', example: 'newest', type: 'string'})
  @IsOptional()
  @IsIn(['newest', 'oldest', 'name_asc', 'name_desc'])
  sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';

  @JSONSchema({description: 'Page number', example: 1, type: 'number'})
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @JSONSchema({description: 'Items per page', example: 20, type: 'number'})
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(500)
  limit?: number;
}

export {
  CropIdParam,
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
};

export const CROP_VALIDATORS = [
  CropIdParam,
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
];
