import { IChemical } from '#root/shared/interfaces/models.js';

export interface IChemicalService {
  createChemical(
    data: { name: string; status: 'Restricted' | 'Banned' },
    createdBy: string,
  ): Promise<IChemical>;

  getAllChemicals(query?: {
    search?: string;
    sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
    page?: number;
    limit?: number;
  }): Promise<{chemicals: IChemical[]; totalCount: number; totalPages: number}>;

  getChemicalById(chemicalId: string): Promise<IChemical | null>;

  updateChemical(
    chemicalId: string,
    updates: {name?: string; status?: 'Restricted' | 'Banned'},
    updatedBy: string,
  ): Promise<IChemical | null>;

  deleteChemical(chemicalId: string): Promise<boolean>;
}
