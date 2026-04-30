import { IsNotEmpty, IsString, IsNumber, IsBoolean, IsArray, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

// ─── Error Response ───────────────────────────────────────────────────────────

export class CropErrorResponse {
  @JSONSchema({
    description: 'The error message',
    example: 'Crop not found',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

// ─── Crop Entry ───────────────────────────────────────────────────────────────

export class CropEntryResponse {
  @JSONSchema({
    description: 'Unique crop identifier',
    example: '64adf92e9e7c3b1234567890',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  _id?: string;

  @JSONSchema({
    description: 'Name of the crop',
    example: 'Paddy',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @JSONSchema({
    description: 'Structured aliases for the crop across languages',
    example: [{ language: 'te-IN', region: 'Andhra and Telangana', english_representation: 'vari', native_representation: 'వరి' }],
    type: 'array',
    readOnly: true,
  })
  @IsArray()
  aliases: Record<string, string>[];

  @JSONSchema({
    description: 'User ID who created the crop',
    example: '64adf92e9e7c3b1234567891',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @JSONSchema({
    description: 'User ID who last updated the crop',
    example: '64adf92e9e7c3b1234567891',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  updatedBy?: string;

  @JSONSchema({
    description: 'Timestamp when crop was created',
    example: '2025-01-15T10:30:00Z',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  createdAt?: string;

  @JSONSchema({
    description: 'Timestamp when crop was last updated',
    example: '2025-01-15T10:30:00Z',
    type: 'string',
    readOnly: true,
  })
  @IsOptional()
  @IsString()
  updatedAt?: string;
}

// ─── Paginated Crops Response ─────────────────────────────────────────────────

export class PaginatedCropsResponse {
  @JSONSchema({
    description: 'Array of crops',
    type: 'array',
    items: { type: 'object' },
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CropEntryResponse)
  crops: CropEntryResponse[];

  @JSONSchema({
    description: 'Total number of crops matching the query',
    example: 50,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalCount: number;

  @JSONSchema({
    description: 'Total number of pages',
    example: 5,
    type: 'number',
    readOnly: true,
  })
  @IsNumber()
  totalPages: number;
}

// ─── Crop Success Response (Single Crop with Message) ──────────────────────────

export class CropSuccessResponse {
  @JSONSchema({
    description: 'Success status indicator',
    example: true,
    type: 'boolean',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  success: boolean;

  @JSONSchema({
    description: 'Success message',
    example: 'Crop "Paddy" added successfully.',
    type: 'string',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;

  @JSONSchema({
    description: 'The crop data',
    type: 'object',
    readOnly: true,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => CropEntryResponse)
  data: CropEntryResponse;
}

// ─── Crop Single Response (for get by ID) ───────────────────────────────────

export class CropSingleResponse {
  @JSONSchema({
    description: 'Success status indicator',
    example: true,
    type: 'boolean',
    readOnly: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  success: boolean;

  @JSONSchema({
    description: 'The crop data',
    type: 'object',
    readOnly: true,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => CropEntryResponse)
  data: CropEntryResponse;
}

// ─── Export all validators ────────────────────────────────────────────────────

export const CROP_RESPONSE_VALIDATORS = [
  CropErrorResponse,
  CropEntryResponse,
  PaginatedCropsResponse,
  CropSuccessResponse,
  CropSingleResponse,
];
