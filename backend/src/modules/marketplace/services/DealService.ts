import {injectable, inject} from 'inversify';
import {NotFoundError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {IDeal} from '#root/shared/interfaces/models.js';
import {IDealRepository} from '#root/shared/database/interfaces/IDealRepository.js';
import {IListingRepository} from '#root/shared/database/interfaces/IListingRepository.js';
import {IDealService} from '../interfaces/IDealService.js';
import {CreateDealDto, UpdateDealStatusDto} from '../classes/validators/DealValidators.js';

@injectable()
export class DealService implements IDealService {
  constructor(
    @inject(GLOBAL_TYPES.DealRepository)
    private readonly dealRepository: IDealRepository,

    @inject(GLOBAL_TYPES.ListingRepository)
    private readonly listingRepository: IListingRepository,
  ) {}

  async createDeal(dto: CreateDealDto, buyerId: string): Promise<IDeal> {
    const listing = await this.listingRepository.getListingById(dto.listingId);
    if (!listing) {
      throw new NotFoundError(`Listing with id "${dto.listingId}" not found`);
    }

    return this.dealRepository.createDeal(buyerId, {
      listingId: dto.listingId,
      farmerId: listing.farmerId.toString(),
      offeredPrice: dto.offeredPrice,
      quantity: dto.quantity,
    });
  }

  async getMyDeals(userId: string): Promise<IDeal[]> {
    return this.dealRepository.getDealsForUser(userId);
  }

  async getDealById(dealId: string): Promise<IDeal | null> {
    return this.dealRepository.getDealById(dealId);
  }

  async updateDealStatus(
    dealId: string,
    dto: UpdateDealStatusDto,
    userId: string,
  ): Promise<IDeal | null> {
    return this.dealRepository.updateDealStatus(dealId, userId, dto.status);
  }
}
