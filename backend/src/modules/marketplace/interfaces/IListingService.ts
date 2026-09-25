import {IListing} from '#root/shared/interfaces/models.js';
import {
  CreateListingDto,
  UpdateListingDto,
  GetAllListingsQuery,
} from '../classes/validators/ListingValidators.js';

export interface IListingService {
  getAllListings(
    query?: GetAllListingsQuery,
  ): Promise<{listings: IListing[]; totalCount: number; totalPages: number}>;
  getListingById(listingId: string): Promise<IListing | null>;
  getMyListings(farmerId: string): Promise<IListing[]>;
  createListing(dto: CreateListingDto, farmerId: string): Promise<IListing>;
  updateListing(
    listingId: string,
    dto: UpdateListingDto,
    farmerId: string,
  ): Promise<IListing | null>;
  deleteListing(listingId: string, farmerId: string): Promise<boolean>;
}
