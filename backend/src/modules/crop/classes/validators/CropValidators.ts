import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsMongoId,
  IsInt,
  Min,
  IsIn,
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

// ── Body DTOs ──

class CreateCropDto {
  @JSONSchema({
    description: 'Unique identifier for the crop',
    example: 'CROP_001',
    type: 'string',
  })
  @IsNotEmpty({message: 'Crop ID is required'})
  @IsString()
  cropId: string;

  @JSONSchema({
    description: 'Name of the crop',
    example: 'Paddy',
    type: 'string',
  })
  @IsNotEmpty({message: 'Crop name is required'})
  @IsString()
  name: string;

  @JSONSchema({
    description: 'Alternative names for the crop',
    example: ['Rice', 'Chawal'],
    type: 'array',
    items: { type: 'string' },
  })
  @IsOptional()
  @IsString({ each: true })
  aliases?: string[];
}

class UpdateCropDto {
  @JSONSchema({
    description: 'Updated crop ID',
    example: 'CROP_001_A',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  cropId?: string;

  @JSONSchema({
    description: 'Updated name of the crop',
    example: 'Basmati Rice',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @JSONSchema({
    description: 'Updated alternative names for the crop',
    example: ['Rice', 'Chawal', 'Basmati'],
    type: 'array',
    items: { type: 'string' }
  })
  @IsOptional()
  @IsString({ each: true })
  aliases?: string[];

  @JSONSchema({
    description: 'Whether the crop is active or disabled',
    example: true,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ── Query DTOs ──

class GetAllCropsQuery {
  @JSONSchema({description: 'Search crop by name, ID, or alias', example: 'Rice', type: 'string'})
  @IsOptional()
  @IsString()
  search?: string;

  @JSONSchema({description: 'Filter by active status', example: 'true', type: 'string'})
  @IsOptional()
  @IsIn(['true', 'false', 'all'])
  isActive?: string;

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
