import {inject, injectable} from 'inversify';
import {Collection, ObjectId} from 'mongodb';
import {InternalServerError, NotFoundError, ForbiddenError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {IListing, ListingStatus} from '#root/shared/interfaces/models.js';
import {IListingRepository} from '#root/shared/database/interfaces/IListingRepository.js';

@injectable()
export class ListingRepository implements IListingRepository {
  private ListingCollection: Collection<IListing>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init(): Promise<void> {
    this.ListingCollection = await this.db.getCollection<IListing>('marketplace_listings');
    await this.ensureIndexes();
  }

  private async ensureIndexes(): Promise<void> {
    try {
      await this.ListingCollection.createIndex({crop: 1});
      await this.ListingCollection.createIndex({'location.state': 1, 'location.district': 1});
      await this.ListingCollection.createIndex({farmerId: 1});
      await this.ListingCollection.createIndex({status: 1});
    } catch (error) {
      console.error('Failed to create listing indexes:', error);
    }
  }

  private static sanitize(listing: any): IListing {
    return {
      ...listing,
      _id: listing._id?.toString(),
      farmerId: listing.farmerId?.toString(),
      createdBy: listing.createdBy?.toString(),
    } as IListing;
  }

  // ─── CREATE ────────────────────────────────────────────────────────────────

  async createListing(
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
  ): Promise<IListing> {
    try {
      if (!this.ListingCollection) await this.init();

      const now = new Date();
      const payload: IListing = {
        farmerId: new ObjectId(farmerId),
        crop: data.crop.trim(),
        quantity: data.quantity,
        unit: data.unit,
        pricePerUnit: data.pricePerUnit,
        location: data.location,
        description: data.description?.trim(),
        images: data.images ?? [],
        status: 'active',
        createdBy: new ObjectId(farmerId),
        createdAt: now,
        updatedAt: now,
      };

      const {insertedId} = await this.ListingCollection.insertOne(payload as any);

      return ListingRepository.sanitize({...payload, _id: insertedId});
    } catch (error: any) {
      throw new InternalServerError(`Failed to create listing: ${error.message}`);
    }
  }

  // ─── READ (ALL / SEARCH) ───────────────────────────────────────────────────

  async getAllListings(query?: {
    crop?: string;
    state?: string;
    district?: string;
    minPrice?: number;
    maxPrice?: number;
    status?: ListingStatus;
    page?: number;
    limit?: number;
  }): Promise<{listings: IListing[]; totalCount: number; totalPages: number}> {
    try {
      if (!this.ListingCollection) await this.init();

      const page = query?.page ?? 1;
      const limit = query?.limit ?? 20;
      const skip = (page - 1) * limit;

      const filter: any = {status: query?.status ?? 'active'};

      if (query?.crop) {
        filter.crop = {$regex: query.crop, $options: 'i'};
      }
      if (query?.state) {
        filter['location.state'] = {$regex: query.state, $options: 'i'};
      }
      if (query?.district) {
        filter['location.district'] = {$regex: query.district, $options: 'i'};
      }
      if (query?.minPrice !== undefined || query?.maxPrice !== undefined) {
        filter.pricePerUnit = {};
        if (query.minPrice !== undefined) filter.pricePerUnit.$gte = query.minPrice;
        if (query.maxPrice !== undefined) filter.pricePerUnit.$lte = query.maxPrice;
      }

      const totalCount = await this.ListingCollection.countDocuments(filter);
      const listings = await this.ListingCollection.find(filter)
        .sort({createdAt: -1})
        .skip(skip)
        .limit(limit)
        .toArray();

      const totalPages = Math.ceil(totalCount / limit);

      return {
        listings: listings.map(ListingRepository.sanitize),
        totalCount,
        totalPages,
      };
    } catch (error: any) {
      throw new InternalServerError(`Failed to fetch listings: ${error.message}`);
    }
  }

  // ─── READ (BY ID) ──────────────────────────────────────────────────────────

  async getListingById(id: string): Promise<IListing | null> {
    try {
      if (!this.ListingCollection) await this.init();

      const listing = await this.ListingCollection.findOne({_id: new ObjectId(id)});
      if (!listing) return null;

      return ListingRepository.sanitize(listing);
    } catch (error: any) {
      throw new InternalServerError(`Failed to get listing: ${error.message}`);
    }
  }

  // ─── READ (BY FARMER) ──────────────────────────────────────────────────────

  async getListingsByFarmer(farmerId: string): Promise<IListing[]> {
    try {
      if (!this.ListingCollection) await this.init();

      const listings = await this.ListingCollection
        .find({farmerId: new ObjectId(farmerId)})
        .sort({createdAt: -1})
        .toArray();

      return listings.map(ListingRepository.sanitize);
    } catch (error: any) {
      throw new InternalServerError(`Failed to fetch farmer's listings: ${error.message}`);
    }
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  async updateListing(
    id: string,
    farmerId: string,
    updates: Partial<{
      quantity: number;
      pricePerUnit: number;
      description: string;
      status: ListingStatus;
      images: string[];
    }>,
  ): Promise<IListing | null> {
    try {
      if (!this.ListingCollection) await this.init();

      const existing = await this.ListingCollection.findOne({_id: new ObjectId(id)});
      if (!existing) throw new NotFoundError('Listing not found');
      if (existing.farmerId.toString() !== farmerId) {
        throw new ForbiddenError('You can only edit your own listings');
      }

      const $set: any = {...updates, updatedAt: new Date()};

      const result = await this.ListingCollection.findOneAndUpdate(
        {_id: new ObjectId(id)},
        {$set},
        {returnDocument: 'after'},
      );

      if (!result) return null;
      return ListingRepository.sanitize(result);
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) throw error;
      throw new InternalServerError(`Failed to update listing: ${error.message}`);
    }
  }

  // ─── DELETE ────────────────────────────────────────────────────────────────

  async deleteListing(id: string, farmerId: string): Promise<boolean> {
    try {
      if (!this.ListingCollection) await this.init();

      const existing = await this.ListingCollection.findOne({_id: new ObjectId(id)});
      if (!existing) throw new NotFoundError('Listing not found');
      if (existing.farmerId.toString() !== farmerId) {
        throw new ForbiddenError('You can only delete your own listings');
      }

      const result = await this.ListingCollection.deleteOne({_id: new ObjectId(id)});
      return result.deletedCount > 0;
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) throw error;
      throw new InternalServerError(`Failed to delete listing: ${error.message}`);
    }
  }
}
