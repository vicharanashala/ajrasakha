import {IsNotEmpty, IsNumber, IsOptional, IsMongoId, IsIn, Min} from 'class-validator';

// ── Param Validators ──

class DealIdParam {
  @IsMongoId()
  dealId: string;
}

// ── Body DTOs ──

class CreateDealDto {
  @IsNotEmpty()
  @IsMongoId()
  listingId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  offeredPrice: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  quantity: number;
}

class UpdateDealStatusDto {
  @IsNotEmpty()
  @IsIn(['accepted', 'rejected', 'completed', 'cancelled'])
  status: 'accepted' | 'rejected' | 'completed' | 'cancelled';
}

export {DealIdParam, CreateDealDto, UpdateDealStatusDto};

export const DEAL_VALIDATORS = [DealIdParam, CreateDealDto, UpdateDealStatusDto];
