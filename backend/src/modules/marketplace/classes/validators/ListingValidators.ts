import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsMongoId,
  IsIn,
  IsArray,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import {JSONSchema} from 'class-validator-jsonschema';
import {Type} from 'class-transformer';

// ── Param Validators ──

class ListingIdParam {
  @JSONSchema({description: 'MongoDB ObjectId of the listing', type: 'string'})
  @IsMongoId()
  listingId: string;
}

// ── Nested DTO ──

class LocationDto {
  @IsNotEmpty()
  @IsString()
  state: string;

  @IsNotEmpty()
  @IsString()
  district: string;

  @IsOptional()
  @IsString()
  village?: string;
}

// ── Body DTOs ──

class CreateListingDto {
  @JSONSchema({description: 'Crop name', example: 'Wheat'})
  @IsNotEmpty()
  @IsString()
  crop: string;

  @JSONSchema({description: 'Quantity available'})
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @JSONSchema({description: 'Unit of quantity', example: 'quintal'})
  @IsNotEmpty()
  @IsIn(['kg', 'quintal', 'ton'])
  unit: 'kg' | 'quintal' | 'ton';

  @JSONSchema({description: 'Price per unit in INR'})
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  pricePerUnit: number;

  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({each: true})
  images?: string[];
}

class UpdateListingDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  pricePerUnit?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['active', 'sold', 'inactive'])
  status?: 'active' | 'sold' | 'inactive';

  @IsOptional()
  @IsArray()
  @IsString({each: true})
  images?: string[];
}

class GetAllListingsQuery {
  @IsOptional()
  @IsString()
  crop?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}

export {
  ListingIdParam,
  LocationDto,
  CreateListingDto,
  UpdateListingDto,
  GetAllListingsQuery,
};

export const LISTING_VALIDATORS = [
  ListingIdParam,
  LocationDto,
  CreateListingDto,
  UpdateListingDto,
  GetAllListingsQuery,
];
