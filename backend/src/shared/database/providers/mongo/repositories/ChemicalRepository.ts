import {inject, injectable} from 'inversify';
import {Collection, ObjectId} from 'mongodb';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {IChemical} from '#root/shared/interfaces/models.js';
import {IChemicalRepository} from '#root/shared/database/interfaces/IChemicalRepository.js';

@injectable()
export class ChemicalRepository implements IChemicalRepository {
  private ChemicalCollection: Collection<IChemical>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init(): Promise<void> {
    this.ChemicalCollection = await this.db.getCollection<IChemical>('chemical_master');
    await this.ensureIndexes();
  }

  private async ensureIndexes(): Promise<void> {
    try {
      await this.ChemicalCollection.createIndex({name: 1}, {unique: true});
    } catch (error) {
      console.error('Failed to create chemical indexes:', error);
    }
  }

  private static escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }


  async createChemical(
    name: string,
    status: 'Restricted' | 'Banned',
    createdBy: string,
  ): Promise<IChemical> {
    try {
      if (!this.ChemicalCollection) await this.init();

      const existing = await this.ChemicalCollection.findOne({
        name: {$regex: `^${ChemicalRepository.escapeRegex(name.trim())}$`, $options: 'i'}
      });

      if (existing) {
        throw new BadRequestError(
          `Chemical with name "${name}" already exists.`,
        );
      }

      const now = new Date();
      const payload: IChemical = {
        name: name.trim(),
        status,
        createdBy: new ObjectId(createdBy),
        createdAt: now,
        updatedAt: now,
      };

      const {insertedId} = await this.ChemicalCollection.insertOne(payload);

      return {
        ...payload,
        _id: insertedId.toString(),
        createdBy: payload.createdBy?.toString(),
      } as IChemical;
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(`Failed to create chemical: ${error.message}`);
    }
  }



  async getAllChemicals(query?: {
    search?: string;
    sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
    page?: number;
    limit?: number;
  }): Promise<{chemicals: IChemical[]; totalCount: number; totalPages: number}> {
    try {
      if (!this.ChemicalCollection) await this.init();

      const page = query?.page ?? 1;
      const limit = query?.limit ?? 50;
      const skip = (page - 1) * limit;

      const filter: any = {};

      if (query?.search) {
        filter.$or = [
          {name: {$regex: query.search, $options: 'i'}},
          {status: {$regex: query.search, $options: 'i'}},
        ];
      }

      const sortMap: Record<string, Record<string, 1 | -1>> = {
        newest: {createdAt: -1},
        oldest: {createdAt: 1},
        name_asc: {name: 1},
        name_desc: {name: -1},
      };
      const sortStage = sortMap[query?.sort || 'name_asc'] || {name: 1};

      const totalCount = await this.ChemicalCollection.countDocuments(filter);
      const chemicals = await this.ChemicalCollection.find(filter)
        .sort(sortStage)
        .skip(skip)
        .limit(limit)
        .toArray();

      const totalPages = Math.ceil(totalCount / limit);

      const sanitizedChemicals: IChemical[] = chemicals.map(chemical => ({
        ...chemical,
        _id: chemical._id?.toString(),
        createdBy: chemical.createdBy?.toString(),
        updatedBy: chemical.updatedBy?.toString(),
      }));

      return {chemicals: sanitizedChemicals, totalCount, totalPages};
    } catch (error: any) {
      throw new InternalServerError(`Failed to fetch chemicals: ${error.message}`);
    }
  }


  async getChemicalById(chemicalId: string): Promise<IChemical | null> {
    try {
      if (!this.ChemicalCollection) await this.init();

      const chemical = await this.ChemicalCollection.findOne({_id: new ObjectId(chemicalId)});
      if (!chemical) return null;

      return {
        ...chemical,
        _id: chemical._id?.toString(),
        createdBy: chemical.createdBy?.toString(),
        updatedBy: chemical.updatedBy?.toString(),
      } as IChemical;
    } catch (error: any) {
      throw new InternalServerError(`Failed to get chemical: ${error.message}`);
    }
  }


  async updateChemical(
    id: string,
    updates: {name?: string; status?: 'Restricted' | 'Banned'},
    updatedBy: string,
  ): Promise<IChemical | null> {
    try {
      if (!this.ChemicalCollection) await this.init();

      const $set: any = {
        updatedAt: new Date(),
        updatedBy: new ObjectId(updatedBy),
      };

      if (updates.name !== undefined) {
        const normalizedName = updates.name.trim();

        const conflict = await this.ChemicalCollection.findOne({
          _id: {$ne: new ObjectId(id)},
          name: {$regex: `^${ChemicalRepository.escapeRegex(normalizedName)}$`, $options: 'i'},
        });

        if (conflict) {
          throw new BadRequestError(
            `Chemical with name "${normalizedName}" already exists.`,
          );
        }

        $set.name = normalizedName;
      }

      if (updates.status !== undefined) {
        $set.status = updates.status;
      }

      const result = await this.ChemicalCollection.findOneAndUpdate(
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
      } as IChemical;
    } catch (error: any) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError(`Failed to update chemical: ${error.message}`);
    }
  }


  async deleteChemical(id: string): Promise<boolean> {
    try {
      if (!this.ChemicalCollection) await this.init();

      const result = await this.ChemicalCollection.deleteOne({
        _id: new ObjectId(id),
      });

      return result.deletedCount > 0;
    } catch (error: any) {
      throw new InternalServerError(`Failed to delete chemical: ${error.message}`);
    }
  }


  async findByName(name: string): Promise<IChemical | null> {
    try {
      if (!this.ChemicalCollection) await this.init();

      const escaped = ChemicalRepository.escapeRegex(name.trim());
      const regex = new RegExp(`^${escaped}$`, 'i');

      const chemical = await this.ChemicalCollection.findOne({
        name: regex,
      });

      if (!chemical) return null;

      return {
        ...chemical,
        _id: chemical._id?.toString(),
        createdBy: chemical.createdBy?.toString(),
        updatedBy: chemical.updatedBy?.toString(),
      } as IChemical;
    } catch (error: any) {
      throw new InternalServerError(`Failed to find chemical by name: ${error.message}`);
    }
  }
}
