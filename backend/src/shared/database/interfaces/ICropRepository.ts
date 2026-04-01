import {ICrop} from '#root/shared/interfaces/models.js';

export interface ICropRepository {
  createCrop(name: string, createdBy: string, aliases?: string[]): Promise<ICrop>;
  getAllCrops(query?: {
    search?: string;
    sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
    page?: number;
    limit?: number;
  }): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}>;
  getCropById(cropId: string): Promise<ICrop | null>;
  updateCrop(id: string, updates: {name?: string; aliases?: string[]}, updatedBy: string): Promise<ICrop | null>;
  findByNameOrAlias(cropName: string): Promise<ICrop | null>;
}
