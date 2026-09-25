import {IDeal, DealStatus} from '#root/shared/interfaces/models.js';

export interface IDealRepository {
  createDeal(
    buyerId: string,
    data: {listingId: string; farmerId: string; offeredPrice: number; quantity: number},
  ): Promise<IDeal>;

  getDealById(id: string): Promise<IDeal | null>;

  getDealsForUser(userId: string): Promise<IDeal[]>;

  updateDealStatus(
    id: string,
    userId: string,
    status: DealStatus,
  ): Promise<IDeal | null>;
}
