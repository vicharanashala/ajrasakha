import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { IChemical, ICropAlias } from '#root/shared/interfaces/models.js';
import { ICropRepository } from '#root/shared/database/interfaces/ICropRepository.js';
import { IChemicalService } from '../interfaces/IChemicalService.js';

// Maps a crop_master document (type='chemical') to the IChemical shape expected by the controller
function toChemical(crop: any): IChemical {
  return {
    _id: crop._id,
    name: crop.name,
    status: crop.status,
    aliases: crop.aliases,
    createdBy: crop.createdBy,
    createdAt: crop.createdAt,
    updatedAt: crop.updatedAt,
  };
}

@injectable()
export class ChemicalService implements IChemicalService {
  constructor(
    @inject(GLOBAL_TYPES.CropRepository)
    private readonly cropRepository: ICropRepository,
  ) {}

  async createChemical(
    data: { name: string; status: 'Restricted' | 'Banned'; aliases?: ICropAlias[] },
    createdBy: string,
  ): Promise<IChemical> {
    const crop = await this.cropRepository.createCrop(
      data.name,
      createdBy,
      data.aliases,
      'chemical',
      data.status,
    );
    return toChemical(crop);
  }

  async getAllChemicals(query?: {
    search?: string;
    sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
    page?: number;
    limit?: number;
  }): Promise<{chemicals: IChemical[]; totalCount: number; totalPages: number}> {
    const result = await this.cropRepository.getAllCrops({ ...query, type: 'chemical' });
    return {
      chemicals: result.crops.map(toChemical),
      totalCount: result.totalCount,
      totalPages: result.totalPages,
    };
  }

  async getChemicalById(chemicalId: string): Promise<IChemical | null> {
    const crop = await this.cropRepository.getCropById(chemicalId);
    if (!crop) return null;
    return toChemical(crop);
  }

  async updateChemical(
    chemicalId: string,
    updates: {name?: string; status?: 'Restricted' | 'Banned'},
    updatedBy: string,
  ): Promise<IChemical | null> {
    const crop = await this.cropRepository.updateCrop(chemicalId, updates, updatedBy);
    if (!crop) return null;
    return toChemical(crop);
  }

  async deleteChemical(chemicalId: string): Promise<boolean> {
    return this.cropRepository.deleteCrop(chemicalId);
  }
}
