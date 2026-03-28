import {inject, injectable} from 'inversify';
import {Collection, ObjectId} from 'mongodb';
import {InternalServerError, NotFoundError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';

/**
 * ICrop interface — should match the one your colleague adds in models.ts.
 * Duplicated here so this file compiles independently until models.ts is updated.
 */
export interface ICrop {
  _id?: string | ObjectId;
  cropName: string;
  cropType?: string;
  isActive: boolean;
  createdBy: ObjectId | string;
  updatedBy?: ObjectId | string;
  createdAt: Date;
  updatedAt: Date;
}

@injectable()
export class CropRepository {
  private CropCollection: Collection<ICrop>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  /**
   * Lazy-initialize the collection reference.
   * Called at the start of every public method (same pattern as RequestRepository).
   */
  private async init(): Promise<void> {
    this.CropCollection = await this.db.getCollection<ICrop>('crop_master');
  }

  // ─── CREATE ────────────────────────────────────────────────────────────────

  /**
   * Insert a new crop into the crop_master collection.
   */
  async createCrop(
    cropName: string,
    createdBy: string,
    cropType?: string,
  ): Promise<ICrop> {
    try {
      await this.init();

      // Check for duplicate crop name (case-insensitive)
      const existing = await this.CropCollection.findOne({
        cropName: {$regex: `^${cropName.trim()}$`, $options: 'i'},
        isActive: true,
      });

      if (existing) {
        throw new InternalServerError(
          `Crop with name "${cropName}" already exists.`,
        );
      }

      const now = new Date();
      const payload: ICrop = {
        cropName: cropName.trim(),
        cropType: cropType?.trim() || undefined,
        isActive: true,
        createdBy: new ObjectId(createdBy),
        createdAt: now,
        updatedAt: now,
      };

      const {insertedId} = await this.CropCollection.insertOne(payload);

      return {
        _id: insertedId,
        ...payload,
      } as ICrop;
    } catch (error: any) {
      if (error instanceof InternalServerError) throw error;
      throw new InternalServerError(`Failed to create crop: ${error.message}`);
    }
  }

  // ─── READ (ALL) ────────────────────────────────────────────────────────────

  /**
   * Get all crops with optional search, filter, sort, and pagination.
   */
  async getAllCrops(query?: {
    search?: string;
    cropType?: string;
    isActive?: string;
    sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
    page?: number;
    limit?: number;
  }): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}> {
    try {
      await this.init();

      const page = query?.page ?? 1;
      const limit = query?.limit ?? 50;
      const skip = (page - 1) * limit;

      // Build filter
      const filter: any = {};

      // Active filter (defaults to only active)
      if (!query?.isActive || query.isActive === 'true') {
        filter.isActive = true;
      } else if (query.isActive === 'false') {
        filter.isActive = false;
      }
      // 'all' → no isActive filter

      // Search by crop name
      if (query?.search) {
        filter.cropName = {$regex: query.search, $options: 'i'};
      }

      // Filter by crop type
      if (query?.cropType) {
        filter.cropType = {$regex: `^${query.cropType}$`, $options: 'i'};
      }

      // Sort
      const sortMap: Record<string, Record<string, 1 | -1>> = {
        newest: {createdAt: -1},
        oldest: {createdAt: 1},
        name_asc: {cropName: 1},
        name_desc: {cropName: -1},
      };
      const sortStage = sortMap[query?.sort || 'name_asc'] || {cropName: 1};

      const totalCount = await this.CropCollection.countDocuments(filter);

      const crops = await this.CropCollection.find(filter)
        .sort(sortStage)
        .skip(skip)
        .limit(limit)
        .toArray();

      const totalPages = Math.ceil(totalCount / limit);

      // Sanitize ObjectIds to strings for the response
      const sanitizedCrops: ICrop[] = crops.map(crop => ({
        ...crop,
        _id: crop._id?.toString(),
        createdBy: crop.createdBy?.toString(),
        updatedBy: crop.updatedBy?.toString(),
      }));

      return {crops: sanitizedCrops, totalCount, totalPages};
    } catch (error: any) {
      throw new InternalServerError(`Failed to fetch crops: ${error.message}`);
    }
  }

  // ─── READ (BY ID) ──────────────────────────────────────────────────────────

  /**
   * Get a single crop by its ObjectId.
   */
  async getCropById(cropId: string): Promise<ICrop | null> {
    try {
      await this.init();

      const crop = await this.CropCollection.findOne({
        _id: new ObjectId(cropId),
      });

      if (!crop) return null;

      return {
        ...crop,
        _id: crop._id?.toString(),
        createdBy: crop.createdBy?.toString(),
        updatedBy: crop.updatedBy?.toString(),
      } as ICrop;
    } catch (error: any) {
      throw new InternalServerError(`Failed to get crop: ${error.message}`);
    }
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  /**
   * Update crop fields (cropName, cropType, isActive).
   */
  async updateCrop(
    cropId: string,
    updates: {cropName?: string; cropType?: string; isActive?: boolean},
    updatedBy: string,
  ): Promise<ICrop | null> {
    try {
      await this.init();

      // If updating cropName, check for duplicates (exclude self)
      if (updates.cropName) {
        const existing = await this.CropCollection.findOne({
          cropName: {$regex: `^${updates.cropName.trim()}$`, $options: 'i'},
          isActive: true,
          _id: {$ne: new ObjectId(cropId)},
        });

        if (existing) {
          throw new InternalServerError(
            `Crop with name "${updates.cropName}" already exists.`,
          );
        }
      }

      const $set: any = {
        updatedAt: new Date(),
        updatedBy: new ObjectId(updatedBy),
      };

      if (updates.cropName !== undefined) $set.cropName = updates.cropName.trim();
      if (updates.cropType !== undefined) $set.cropType = updates.cropType.trim();
      if (updates.isActive !== undefined) $set.isActive = updates.isActive;

      const result = await this.CropCollection.findOneAndUpdate(
        {_id: new ObjectId(cropId)},
        {$set},
        {returnDocument: 'after'},
      );

      if (!result) return null;

      return {
        ...result,
        _id: result._id?.toString(),
        createdBy: result.createdBy?.toString(),
        updatedBy: result.updatedBy?.toString(),
      } as ICrop;
    } catch (error: any) {
      if (error instanceof InternalServerError) throw error;
      throw new InternalServerError(`Failed to update crop: ${error.message}`);
    }
  }

  // ─── SOFT DELETE ───────────────────────────────────────────────────────────

  /**
   * Soft-delete a crop by setting isActive = false.
   */
  async deleteCrop(
    cropId: string,
    deletedBy: string,
  ): Promise<{modifiedCount: number}> {
    try {
      await this.init();

      const result = await this.CropCollection.updateOne(
        {
          _id: new ObjectId(cropId),
          isActive: true,
        },
        {
          $set: {
            isActive: false,
            updatedAt: new Date(),
            updatedBy: new ObjectId(deletedBy),
          },
        },
      );

      if (result.modifiedCount === 0) {
        throw new NotFoundError(
          `Crop with id "${cropId}" not found or already inactive.`,
        );
      }

      return {modifiedCount: result.modifiedCount};
    } catch (error: any) {
      if (error instanceof NotFoundError) throw error;
      throw new InternalServerError(`Failed to delete crop: ${error.message}`);
    }
  }
}
