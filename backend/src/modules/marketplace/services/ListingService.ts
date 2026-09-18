import {injectable, inject} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IListing} from '#root/shared/interfaces/models.js';
import {IListingRepository} from '#root/shared/database/interfaces/IListingRepository.js';
import {IListingService} from '../interfaces/IListingService.js';
import {
  CreateListingDto,
  UpdateListingDto,
  GetAllListingsQuery,
} from '../classes/validators/ListingValidators.js';

@injectable()
export class ListingService implements IListingService {
  constructor(
    @inject(GLOBAL_TYPES.ListingRepository)
    private readonly listingRepository: IListingRepository,
  ) {}

  async getAllListings(
    query?: GetAllListingsQuery,
  ): Promise<{listings: IListing[]; totalCount: number; totalPages: number}> {
    return this.listingRepository.getAllListings(query);
  }

  async getListingById(listingId: string): Promise<IListing | null> {
    return this.listingRepository.getListingById(listingId);
  }

  async getMyListings(farmerId: string): Promise<IListing[]> {
    return this.listingRepository.getListingsByFarmer(farmerId);
  }

  async createListing(dto: CreateListingDto, farmerId: string): Promise<IListing> {
    return this.listingRepository.createListing(farmerId, dto);
  }

  async updateListing(
    listingId: string,
    dto: UpdateListingDto,
    farmerId: string,
  ): Promise<IListing | null> {
    return this.listingRepository.updateListing(listingId, farmerId, dto);
  }

  async deleteListing(listingId: string, farmerId: string): Promise<boolean> {
    return this.listingRepository.deleteListing(listingId, farmerId);
  }
}
