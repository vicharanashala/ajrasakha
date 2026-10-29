import {
  IsNotEmpty,
  IsBoolean,
  IsString,
  IsArray,
  IsOptional,
  IsMongoId,
  IsInt,
  Min,
  Max,
  IsIn,
  IsISO8601,
  ValidateNested,
} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';
import {Type, Transform} from 'class-transformer';
import type { CropType, CropListSort } from '#root/shared/interfaces/models.js';
import { CROP_LIST_SORTS } from '#root/shared/interfaces/models.js';

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

  @JSONSchema({ description: 'Source URL reference', example: 'https://agritech.tnau.ac.in/...' })
  @IsOptional()
  @IsString()
  source_link?: string;

  @JSONSchema({ description: 'Page number reference', example: '45' })
  @IsOptional()
  @IsString()
  page_number?: string;

  @JSONSchema({ description: 'Expert who verified this term' })
  @IsOptional()
  @IsString()
  agri_expert?: string;

  @JSONSchema({ description: 'Free-text note about this term' })
  @IsOptional()
  @IsString()
  remark?: string;
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
    description: 'Type of entry — crop (default), weed, pest, disease, chemical, or any custom type (from the "Other" tab)',
    example: 'crop',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  type?: CropType;

  @JSONSchema({
    description: 'Optional scientific (binomial) name, e.g. "Oryza sativa"',
    example: 'Oryza sativa',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  scientificName?: string;

  @JSONSchema({
    description: 'Status — only for type=chemical, any custom string',
    example: 'Restricted',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @JSONSchema({
    description: 'Structured aliases across languages',
    example: [{ language: 'te-IN', region: 'Andhra and Telangana', english_representation: 'vari', native_representation: 'వరి', source_link: 'https://agritech.tnau.ac.in/...', page_number: '45' }],
    type: 'array',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CropAliasDto)
  aliases?: CropAliasDto[];

  @JSONSchema({ description: 'Associated crops for chemicals', type: 'array', items: { type: 'string' } })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  crops?: string[];
}

class UpdateCropDto {
  @JSONSchema({
    description: 'Updated aliases — accepts both legacy strings and new structured objects',
    example: [{ language: 'hi-IN', region: 'North India', english_representation: 'dhan', native_representation: 'धान', source_link: 'https://agritech.tnau.ac.in/...', page_number: '45' }],
    type: 'array',
  })
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => value)
  aliases?: (CropAliasDto | string)[];

  @JSONSchema({
    description: 'Optional scientific (binomial) name, e.g. "Oryza sativa". Send an empty string to clear.',
    example: 'Oryza sativa',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  scientificName?: string;

  @JSONSchema({
    description: 'Status update — only applicable for chemical entries, any custom string',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @JSONSchema({ description: 'Updated associated crops', type: 'array', items: { type: 'string' } })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  crops?: string[];

  @JSONSchema({
    description:
      "Public URL of the entry's image. Set by the server after uploading an image file; " +
      'send null to remove the existing image.',
    type: 'string',
  })
  @IsOptional()
  imageUrl?: string | null;
}

// ── Query DTOs ──

class GetAllCropsQuery {
  @JSONSchema({description: 'Search by name or alias', example: 'Rice', type: 'string'})
  @IsOptional()
  @IsString()
  search?: string;

  @JSONSchema({description: 'Filter by entry type', example: 'crop', type: 'string'})
  @IsOptional()
  @IsString()
  type?: CropType;

  @JSONSchema({description: 'Sort order', example: 'newest', type: 'string', enum: [...CROP_LIST_SORTS]})
  @IsOptional()
  @IsIn([...CROP_LIST_SORTS])
  sort?: CropListSort;

  @JSONSchema({description: 'Only entries with / without aliases', example: 'without', type: 'string', enum: ['with', 'without']})
  @IsOptional()
  @IsIn(['with', 'without'])
  aliases?: 'with' | 'without';

  @JSONSchema({description: 'Only entries with / without an image', example: 'with', type: 'string', enum: ['with', 'without']})
  @IsOptional()
  @IsIn(['with', 'without'])
  image?: 'with' | 'without';

  @JSONSchema({description: 'Filter by status (chemicals)', example: 'Banned', type: 'string'})
  @IsOptional()
  @IsString()
  status?: string;

  @JSONSchema({description: 'Only entries with an alias in this language', example: 'te-IN', type: 'string'})
  @IsOptional()
  @IsString()
  language?: string;

  @JSONSchema({description: 'Only entries with an alias for this region', example: 'Andhra and Telangana', type: 'string'})
  @IsOptional()
  @IsString()
  region?: string;

  @JSONSchema({description: 'Updated on or after this ISO timestamp', example: '2026-10-01T00:00:00.000Z', type: 'string'})
  @IsOptional()
  @IsISO8601()
  updatedFrom?: string;

  @JSONSchema({description: 'Updated on or before this ISO timestamp', example: '2026-10-31T23:59:59.999Z', type: 'string'})
  @IsOptional()
  @IsISO8601()
  updatedTo?: string;

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

class GetAffectedQuestionsQuery {
  @JSONSchema({ description: 'Page number', example: 1, type: 'number' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @JSONSchema({ description: 'Items per page', example: 10, type: 'number' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @JSONSchema({ description: 'Search questions by text, crop or location', example: 'tomato', type: 'string' })
  @IsOptional()
  @IsString()
  search?: string;
}

class DeleteCropDto {
  @JSONSchema({
    description: 'MongoDB ObjectId of the replacement crop from crop_master (required if reassigning questions)',
    example: '650e9c0f5f1b2c002f4d9e00',
    type: 'string',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') return value;
    if (value && value.buffer && Array.isArray(value.buffer.data)) {
      return Buffer.from(value.buffer.data).toString('hex');
    }
    if (value && typeof value === 'object') {
      if (value.$oid) return String(value.$oid);
      if (value.toString && typeof value.toString === 'function' && value.toString() !== '[object Object]') {
        return value.toString();
      }
    }
    return String(value || '');
  })
  @IsMongoId()
  replacementCropId?: string;

  @JSONSchema({
    description: 'Array of question IDs whose normalised_crop should be replaced',
    example: ['650e9c0f5f1b2c002f4d9e01'],
    type: 'array',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    return value.map((v: any) => {
      if (typeof v === 'string') return v;
      if (v && v.buffer && Array.isArray(v.buffer.data)) {
        return Buffer.from(v.buffer.data).toString('hex');
      }
      if (v && typeof v === 'object') {
        if (v.$oid) return String(v.$oid);
        if (v.toString && typeof v.toString === 'function' && v.toString() !== '[object Object]') {
          return v.toString();
        }
      }
      return String(v);
    });
  })
  @IsArray()
  @IsString({ each: true })
  questionIds?: string[];

  @JSONSchema({
    description: 'Set true to reassign all questions for this crop directly on MongoDB without passing individual IDs',
    example: true,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  reassignAll?: boolean;
}

export {
  CropIdParam,
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
  DeleteCropDto,
  GetAffectedQuestionsQuery,
};

export const CROP_VALIDATORS = [
  CropIdParam,
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
  DeleteCropDto,
  GetAffectedQuestionsQuery,
];
