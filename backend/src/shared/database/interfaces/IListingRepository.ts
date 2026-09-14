import {IListing, ListingStatus} from '#root/shared/interfaces/models.js';

export interface IListingRepository {
  createListing(
    farmerId: string,
    data: {
      crop: string;
      quantity: number;
      unit: 'kg' | 'quintal' | 'ton';
      pricePerUnit: number;
      location: {state: string; district: string; village?: string};
      description?: string;
      images?: string[];
    },
  ): Promise<IListing>;

  getAllListings(query?: {
    crop?: string;
    state?: string;
    district?: string;
    minPrice?: number;
    maxPrice?: number;
    status?: ListingStatus;
    page?: number;
    limit?: number;
  }): Promise<{listings: IListing[]; totalCount: number; totalPages: number}>;

  getListingById(id: string): Promise<IListing | null>;

  getListingsByFarmer(farmerId: string): Promise<IListing[]>;

  updateListing(
    id: string,
    farmerId: string,
    updates: Partial<{
      quantity: number;
      pricePerUnit: number;
      description: string;
      status: ListingStatus;
      images: string[];
    }>,
  ): Promise<IListing | null>;

  deleteListing(id: string, farmerId: string): Promise<boolean>;
}
