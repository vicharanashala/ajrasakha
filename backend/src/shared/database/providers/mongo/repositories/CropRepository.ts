import {inject, injectable} from 'inversify';
import {Collection, ObjectId} from 'mongodb';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {ICrop, ICropAlias} from '#root/shared/interfaces/models.js';
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
    await this.ensureIndexes();
  }

  private async ensureIndexes(): Promise<void> {
    try {
      await this.CropCollection.createIndex({name: 1}, {unique: true});
      // Drop old flat-string aliases index if it exists (schema migration)
      try { await this.CropCollection.dropIndex('aliases_1'); } catch { /* already gone */ }
      // Index english_representation for fast search queries
      await this.CropCollection.createIndex({'aliases.english_representation': 1}, {sparse: true});
    } catch (error) {
      console.error('Failed to create crop indexes:', error);
    }
  }

  private static escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Extract the searchable English string from either a legacy string alias or a new ICropAlias object */
  private static getEnRepr(alias: any): string {
    return typeof alias === 'string' ? alias : (alias?.english_representation ?? '');
  }

  // ─── CREATE ────────────────────────────────────────────────────────────────

  async createCrop(
    name: string,
    createdBy: string,
    aliases?: ICropAlias[],
  ): Promise<ICrop> {
    try {
      if (!this.CropCollection) await this.init();

      // Collect all english_representation values + the crop name for conflict checking
      const allNames = [name.trim(), ...(aliases || []).map(a => a.english_representation.trim())];

      const orConditions: any[] = [];
      for (const n of allNames) {
        const escaped = CropRepository.escapeRegex(n);
        orConditions.push({name: {$regex: `^${escaped}$`, $options: 'i'}});
        orConditions.push({aliases: {$regex: `^${escaped}$`, $options: 'i'}});                        // legacy string aliases
        orConditions.push({'aliases.english_representation': {$regex: `^${escaped}$`, $options: 'i'}}); // new object aliases
      }

      const existing = await this.CropCollection.findOne({$or: orConditions});

      if (existing) {
        const conflictingValue = allNames.find(n => {
          const regex = new RegExp(`^${CropRepository.escapeRegex(n)}$`, 'i');
          return regex.test(existing.name) || existing.aliases?.some(a => regex.test(CropRepository.getEnRepr(a)));
        });
        throw new BadRequestError(
          `Crop with name or alias "${conflictingValue}" already exists in crop "${existing.name}".`,
        );
      }

      const now = new Date();
      const payload: ICrop = {
        name: name.trim().toLowerCase(),
        aliases: (aliases || []).map(a => ({
          language: a.language.trim(),
          region: a.region.trim(),
          english_representation: a.english_representation.trim().toLowerCase(),
          native_representation: a.native_representation.trim(),
        })),
        createdBy: new ObjectId(createdBy),
        createdAt: now,
        updatedAt: now,
      };

      const {insertedId} = await this.CropCollection.insertOne(payload);

      return {
        ...payload,
        _id: insertedId.toString(),
        createdBy: payload.createdBy?.toString(),
      } as ICrop;
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
          {aliases: {$regex: query.search, $options: 'i'}},                                      // legacy string aliases
          {'aliases.english_representation': {$regex: query.search, $options: 'i'}},             // new format
          {'aliases.native_representation': {$regex: query.search, $options: 'i'}},              // new format
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

  // ─── UPDATE (only aliases — crop name is immutable) ────────────────────────

  async updateCrop(
    id: string,
    updates: {name?: string; aliases?: (ICropAlias | string)[]},
    updatedBy: string,
  ): Promise<ICrop | null> {
    try {
      if (!this.CropCollection) await this.init();

      // Crop name is immutable — silently ignore if sent
      const $set: any = {
        updatedAt: new Date(),
        updatedBy: new ObjectId(updatedBy),
      };

      // ── Alias conflict check ──────────────────────────────────────────────
      if (updates.aliases !== undefined) {
        // Normalize: preserve legacy strings, fully normalize new objects
        const normalizedAliases = updates.aliases.map(a => {
          if (typeof a === 'string') return a.trim().toLowerCase();
          return {
            language: (a.language ?? '').trim(),
            region: (a.region ?? '').trim(),
            english_representation: (a.english_representation ?? '').trim().toLowerCase(),
            native_representation: (a.native_representation ?? '').trim(),
          };
        });

        for (const alias of normalizedAliases) {
          const enRepr = CropRepository.getEnRepr(alias);
          if (!enRepr) continue;
          const escaped = CropRepository.escapeRegex(enRepr);
          const regex = new RegExp(`^${escaped}$`, 'i');

          const conflict = await this.CropCollection.findOne({
            _id: {$ne: new ObjectId(id)},
            $or: [
              {name: regex},
              {aliases: regex},                                    // legacy string format
              {'aliases.english_representation': regex},           // new object format
            ],
          });

          if (conflict) {
            const conflictType = regex.test(conflict.name) ? 'a crop name' : 'an alias';
            throw new BadRequestError(
              `Cannot add alias "${enRepr}" — it already exists as ${conflictType} in crop "${conflict.name}".`,
            );
          }
        }

        const currentCrop = await this.CropCollection.findOne({_id: new ObjectId(id)});
        if (currentCrop) {
          for (const alias of normalizedAliases) {
            const enRepr = CropRepository.getEnRepr(alias);
            if (enRepr === currentCrop.name.trim().toLowerCase()) {
              throw new BadRequestError(
                `Cannot add alias "${enRepr}" — it is the same as this crop's own name.`,
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
      if (!this.CropCollection) await this.init();

      const escaped = CropRepository.escapeRegex(cropName.trim());
      const regex = new RegExp(`^${escaped}$`, 'i');

      const crop = await this.CropCollection.findOne({
        $or: [
          {name: regex},
          {aliases: regex},                                  // legacy string format
          {'aliases.english_representation': regex},         // new format
          {'aliases.native_representation': regex},          // new format
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
