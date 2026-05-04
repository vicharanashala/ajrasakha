import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChemicalIdParam {
  @IsString()
  @IsNotEmpty()
  chemicalId: string;
}

export class CreateChemicalDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsIn(['Restricted', 'Banned'])
  status: 'Restricted' | 'Banned';
}

export class UpdateChemicalDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @IsString()
  @IsOptional()
  @IsIn(['Restricted', 'Banned'])
  status?: 'Restricted' | 'Banned';
}

export class GetAllChemicalsQuery {
  @IsOptional()
  @Type(() => String)
  search?: string;

  @IsOptional()
  @IsIn(['newest', 'oldest', 'name_asc', 'name_desc'])
  sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

export const CHEMICAL_VALIDATORS = [
  ChemicalIdParam,
  CreateChemicalDto,
  UpdateChemicalDto,
  GetAllChemicalsQuery,
];
