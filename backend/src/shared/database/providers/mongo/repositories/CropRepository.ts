import {inject, injectable} from 'inversify';
import {Collection, ObjectId} from 'mongodb';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {ICrop} from '#root/shared/interfaces/models.js';
import {ICropRepository} from '#root/shared/database/interfaces/ICropRepository.js';

@injectable()
export class CropRepository implements ICropRepository {
  private CropCollection: Collection<ICrop>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init(): Promise<void> {
    this.CropCollection = await this.db.getCollection<ICrop>('crop_master');
  }

  private static escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ─── CREATE ────────────────────────────────────────────────────────────────

  async createCrop(
    name: string,
    createdBy: string,
    aliases?: string[],
  ): Promise<ICrop> {
    try {
      if (!this.CropCollection) await this.init();

      const allNames = [name.trim(), ...(aliases || []).map(a => a.trim())];

      const orConditions: any[] = [];
      for (const n of allNames) {
        const escaped = CropRepository.escapeRegex(n);
        orConditions.push({name: {$regex: `^${escaped}$`, $options: 'i'}});
        orConditions.push({aliases: {$regex: `^${escaped}$`, $options: 'i'}});
      }

      const existing = await this.CropCollection.findOne({$or: orConditions});

      if (existing) {
        const conflictingValue = allNames.find(n => {
          const regex = new RegExp(`^${CropRepository.escapeRegex(n)}$`, 'i');
          return regex.test(existing.name) || existing.aliases?.some(a => regex.test(a));
        });
        throw new BadRequestError(
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
      if (error instanceof BadRequestError) throw error;
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
      if (!this.CropCollection) await this.init();

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
      if (!this.CropCollection) await this.init();

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

  // ─── UPDATE (only aliases — crop name is immutable) ─────────────────────────

  async updateCrop(
    id: string,
    updates: {name?: string; aliases?: string[]},
    updatedBy: string,
  ): Promise<ICrop | null> {
    try {
      if (!this.CropCollection) await this.init();

      const incomingValues: string[] = [];
      if (updates.name) incomingValues.push(updates.name.trim());
      if (updates.aliases) incomingValues.push(...updates.aliases.map(a => a.trim()));

      if (incomingValues.length > 0) {
        const orConditions: any[] = [];
        for (const v of incomingValues) {
          const escaped = CropRepository.escapeRegex(v);
          orConditions.push({name: {$regex: `^${escaped}$`, $options: 'i'}});
          orConditions.push({aliases: {$regex: `^${escaped}$`, $options: 'i'}});
        }

<<<<<<< HEAD
      // Crop name is immutable — silently ignore if sent
      delete updates.name;
=======
        const existing = await this.CropCollection.findOne({
          $or: orConditions,
          _id: {$ne: new ObjectId(id)},
        });

        if (existing) {
          const conflictingValue = incomingValues.find(v => {
            const regex = new RegExp(`^${CropRepository.escapeRegex(v)}$`, 'i');
            return regex.test(existing.name) || existing.aliases?.some(a => regex.test(a));
          });
          throw new BadRequestError(
            `Crop with name or alias "${conflictingValue}" already exists in crop "${existing.name}".`,
          );
        }
      }
>>>>>>> ca70c346 (removed isActive, rest API protocols followed)

      const $set: any = {
        updatedAt: new Date(),
        updatedBy: new ObjectId(updatedBy),
      };

      // ── Alias conflict check ──────────────────────────────
      if (updates.aliases !== undefined) {
        const normalizedAliases = updates.aliases.map(a => a.trim().toLowerCase());

        // Check each alias against all OTHER crops' names and aliases
        for (const alias of normalizedAliases) {
          const regex = new RegExp(`^${alias}$`, 'i');

          const conflict = await this.CropCollection.findOne({
            _id: {$ne: new ObjectId(id)},
            $or: [
              {name: regex},
              {aliases: regex},
            ],
          });

          if (conflict) {
            // Determine if conflict is with the name or an alias
            const isNameConflict = regex.test(conflict.name);
            const conflictType = isNameConflict ? 'a crop name' : 'an alias';
            throw new InternalServerError(
              `Cannot add alias "${alias}" — it already exists as ${conflictType} in crop "${conflict.name}".`,
            );
          }
        }

        // Also check if any alias duplicates the CURRENT crop's own name
        const currentCrop = await this.CropCollection.findOne({_id: new ObjectId(id)});
        if (currentCrop) {
          for (const alias of normalizedAliases) {
            if (alias === currentCrop.name.trim().toLowerCase()) {
              throw new InternalServerError(
                `Cannot add alias "${alias}" — it is the same as this crop's own name.`,
              );
            }
          }
        }

        $set.aliases = normalizedAliases;
      }

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
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(`Failed to update crop: ${error.message}`);
    }
  }

  // ─── FIND BY NAME OR ALIAS ─────────────────────────────────────────────────

  async findByNameOrAlias(cropName: string): Promise<ICrop | null> {
    try {
      await this.init();

      const normalized = cropName.trim().toLowerCase();
      const regex = new RegExp(`^${normalized}$`, 'i');

      const crop = await this.CropCollection.findOne({
        $or: [
          { name: regex },
          { aliases: regex },
        ],
      });

      if (!crop) return null;

      return {
        ...crop,
        _id: crop._id?.toString(),
        createdBy: crop.createdBy?.toString(),
        updatedBy: crop.updatedBy?.toString(),
      } as ICrop;
    } catch (error: any) {
      throw new InternalServerError(`Failed to find crop by name or alias: ${error.message}`);
    }
  }
}
