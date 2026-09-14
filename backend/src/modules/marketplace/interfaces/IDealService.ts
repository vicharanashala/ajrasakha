import {IDeal} from '#root/shared/interfaces/models.js';
import {CreateDealDto, UpdateDealStatusDto} from '../classes/validators/DealValidators.js';

export interface IDealService {
  createDeal(dto: CreateDealDto, buyerId: string): Promise<IDeal>;
  getMyDeals(userId: string): Promise<IDeal[]>;
  getDealById(dealId: string): Promise<IDeal | null>;
  updateDealStatus(dealId: string, dto: UpdateDealStatusDto, userId: string): Promise<IDeal | null>;
}
