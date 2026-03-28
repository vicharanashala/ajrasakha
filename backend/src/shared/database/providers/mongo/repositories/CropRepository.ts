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
    cropId: string,
    name: string,
    createdBy: string,
    aliases?: string[],
  ): Promise<ICrop> {
    try {
      await this.init();

      const existing = await this.CropCollection.findOne({
        $or: [
          {cropId},
          {name: {$regex: `^${name.trim()}$`, $options: 'i'}},
        ],
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
          {cropId: {$regex: query.search, $options: 'i'}},
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
    updates: {cropId?: string; name?: string; aliases?: string[]},
    updatedBy: string,
  ): Promise<ICrop | null> {
    try {
      await this.init();

      if (updates.cropId || updates.name) {
        const orConditions = [];
        if (updates.cropId) orConditions.push({cropId: updates.cropId.trim()});
        if (updates.name)
          orConditions.push({
            name: {$regex: `^${updates.name.trim()}$`, $options: 'i'},
          });

        const existing = await this.CropCollection.findOne({
          $or: orConditions,
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

  // ─── DELETE ────────────────────────────────────────────────────────────────

  async deleteCrop(cropId: string): Promise<{deletedCount: number}> {
    try {
      await this.init();

      const crop = await this.CropCollection.findOne({_id: new ObjectId(cropId)});
      if (!crop) {
        throw new NotFoundError(`Crop with id "${cropId}" not found.`);
      }

      // Block delete if any question references this crop
      // Handles both old string format and new ICropRef object format
      const QuestionCollection = await this.db.getCollection('questions');
      const inUse = await QuestionCollection.findOne({
        $or: [
          {'details.crop': {$regex: `^${crop.name}$`, $options: 'i'}},
          {'details.crop.cropId': crop.cropId},
        ],
      });

      if (inUse) {
        throw new BadRequestError(
          `Cannot delete crop "${crop.name}" — it is referenced by existing questions.`,
        );
      }

      const result = await this.CropCollection.deleteOne({_id: new ObjectId(cropId)});
      return {deletedCount: result.deletedCount};
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof BadRequestError)
        throw error;
      throw new InternalServerError(`Failed to delete crop: ${error.message}`);
    }
  }
}
