import {inject, injectable} from 'inversify';
import {Collection, ObjectId} from 'mongodb';
import {BadRequestError, InternalServerError, NotFoundError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {ICrop} from '#root/shared/interfaces/models.js';

@injectable()
export class CropRepository {
  private CropCollection: Collection<ICrop>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init(): Promise<void> {
    this.CropCollection = await this.db.getCollection<ICrop>('crop_master');
  }

  // ─── CREATE ────────────────────────────────────────────────────────────────

  async createCrop(
    name: string,
    createdBy: string,
    aliases?: string[],
  ): Promise<ICrop> {
    try {
      await this.init();

      // Build a list of all values to check for uniqueness (name + aliases)
      const allNames = [name.trim().toLowerCase(), ...(aliases || []).map(a => a.trim().toLowerCase())];

      // Check if any existing crop has a matching name or alias
      const orConditions: any[] = [];
      for (const n of allNames) {
        orConditions.push({name: {$regex: `^${n}$`, $options: 'i'}});
        orConditions.push({aliases: {$regex: `^${n}$`, $options: 'i'}});
      }

      const existing = await this.CropCollection.findOne({
        $or: orConditions,
      });

      if (existing) {
        // Find which value conflicted
        const conflictingValue = allNames.find(n => {
          const regex = new RegExp(`^${n}$`, 'i');
          return regex.test(existing.name) || existing.aliases?.some(a => regex.test(a));
        });
        throw new InternalServerError(
          `Crop with name or alias "${conflictingValue}" already exists in crop "${existing.name}".`,
        );
      }

      const now = new Date();
      const payload: ICrop = {
        name: name.trim().toLowerCase(),
        aliases: (aliases || []).map(a => a.trim().toLowerCase()),
        createdBy: new ObjectId(createdBy),
        createdAt: now,
        updatedAt: now,
      };

      const {insertedId} = await this.CropCollection.insertOne(payload);

      return {_id: insertedId, ...payload} as ICrop;
    } catch (error: any) {
      if (error instanceof InternalServerError) throw error;
      throw new InternalServerError(`Failed to create crop: ${error.message}`);
    }
  }

  // ─── READ (ALL) ────────────────────────────────────────────────────────────

  async getAllCrops(query?: {
    search?: string;
    sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
    page?: number;
    limit?: number;
  }): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}> {
    try {
      await this.init();

      const page = query?.page ?? 1;
      const limit = query?.limit ?? 50;
      const skip = (page - 1) * limit;

      const filter: any = {};

      if (query?.search) {
        filter.$or = [
          {name: {$regex: query.search, $options: 'i'}},
          {aliases: {$regex: query.search, $options: 'i'}},
        ];
      }

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

  async getCropById(cropId: string): Promise<ICrop | null> {
    try {
      await this.init();

      const crop = await this.CropCollection.findOne({_id: new ObjectId(cropId)});
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

  async updateCrop(
    id: string,
    updates: {name?: string; aliases?: string[]},
    updatedBy: string,
  ): Promise<ICrop | null> {
    try {
      await this.init();

      if (updates.name) {
        const existing = await this.CropCollection.findOne({
          name: {$regex: `^${updates.name.trim().toLowerCase()}$`, $options: 'i'},
          _id: {$ne: new ObjectId(id)},
        });

        if (existing) {
          throw new InternalServerError(
            `Crop with name "${updates.name}" already exists.`,
          );
        }
      }

      const $set: any = {
        updatedAt: new Date(),
        updatedBy: new ObjectId(updatedBy),
      };

      if (updates.name !== undefined) $set.name = updates.name.trim().toLowerCase();
      if (updates.aliases !== undefined) $set.aliases = updates.aliases.map(a => a.trim().toLowerCase());

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
}

