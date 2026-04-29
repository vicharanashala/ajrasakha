import { inject, injectable } from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IChemical} from '#root/shared/interfaces/models.js';
import {IChemicalRepository} from '#root/shared/database/interfaces/IChemicalRepository.js';
import {IChemicalService} from '../interfaces/IChemicalService.js';

@injectable()
export class ChemicalService implements IChemicalService {
  constructor(
    @inject(GLOBAL_TYPES.ChemicalRepository)
    private readonly chemicalRepository: IChemicalRepository,
  ) {}

  async createChemical(
    data: { name: string; status: 'Restricted' | 'Banned' },
    createdBy: string,
  ): Promise<IChemical> {
    return this.chemicalRepository.createChemical(
      data.name,
      data.status,
      createdBy,
    );
  }

  async getAllChemicals(query?: {
    search?: string;
    sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
    page?: number;
    limit?: number;
  }): Promise<{chemicals: IChemical[]; totalCount: number; totalPages: number}> {
    return this.chemicalRepository.getAllChemicals(query);
  }

  async getChemicalById(chemicalId: string): Promise<IChemical | null> {
    return this.chemicalRepository.getChemicalById(chemicalId);
  }

  async updateChemical(
    chemicalId: string,
    updates: {name?: string; status?: 'Restricted' | 'Banned'},
    updatedBy: string,
  ): Promise<IChemical | null> {
    return this.chemicalRepository.updateChemical(chemicalId, updates, updatedBy);
  }

  async deleteChemical(chemicalId: string): Promise<boolean> {
    return this.chemicalRepository.deleteChemical(chemicalId);
  }
}
