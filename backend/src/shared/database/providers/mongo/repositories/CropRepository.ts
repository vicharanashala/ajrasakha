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
  cropId: string;
  name: string;
  aliases?: string[];
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
    cropId: string,
    name: string,
    createdBy: string,
    aliases?: string[],
  ): Promise<ICrop> {
    try {
      await this.init();

      // Check for duplicate crop ID or Name (case-insensitive)
      const existing = await this.CropCollection.findOne({
        $or: [
          { cropId },
          { name: { $regex: `^${name.trim()}$`, $options: 'i' } }
        ],
        isActive: true,
      });

      if (existing) {
        throw new InternalServerError(
          `Crop with ID "${cropId}" or name "${name}" already exists.`,
        );
      }

      const now = new Date();
      const payload: ICrop = {
        cropId: cropId.trim(),
        name: name.trim(),
        aliases: aliases || [],
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

      // Search by crop name, ID or aliases
      if (query?.search) {
        filter.$or = [
          { cropId: { $regex: query.search, $options: 'i' } },
          { name: { $regex: query.search, $options: 'i' } },
          { aliases: { $regex: query.search, $options: 'i' } }
        ];
      }

      // Sort
      const sortMap: Record<string, Record<string, 1 | -1>> = {
        newest: {createdAt: -1},
        oldest: {createdAt: 1},
        name_asc: {name: 1},
        name_desc: {name: -1},
      };
      const sortStage = sortMap[query?.sort || 'name_asc'] || {name: 1};

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
    id: string,
    updates: {cropId?: string; name?: string; aliases?: string[]; isActive?: boolean},
    updatedBy: string,
  ): Promise<ICrop | null> {
    try {
      await this.init();

      // If updating cropId or name, check for duplicates (exclude self)
      if (updates.cropId || updates.name) {
        const orConditions = [];
        if (updates.cropId) orConditions.push({ cropId: updates.cropId.trim() });
        if (updates.name) orConditions.push({ name: { $regex: `^${updates.name.trim()}$`, $options: 'i' } });

        const existing = await this.CropCollection.findOne({
          $or: orConditions,
          isActive: true,
          _id: {$ne: new ObjectId(id)},
        });

        if (existing) {
          throw new InternalServerError(
            `Crop with ID "${updates.cropId}" or name "${updates.name}" already exists.`,
          );
        }
      }

      const $set: any = {
        updatedAt: new Date(),
        updatedBy: new ObjectId(updatedBy),
      };

      if (updates.cropId !== undefined) $set.cropId = updates.cropId.trim();
      if (updates.name !== undefined) $set.name = updates.name.trim();
      if (updates.aliases !== undefined) $set.aliases = updates.aliases;
      if (updates.isActive !== undefined) $set.isActive = updates.isActive;

      const result = await this.CropCollection.findOneAndUpdate(
        {_id: new ObjectId(id)},
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
