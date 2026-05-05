import {ICrop, ICropAlias, CropType} from '#root/shared/interfaces/models.js';

export interface ICropRepository {
  createCrop(name: string, createdBy: string, aliases?: ICropAlias[], type?: CropType, status?: 'Restricted' | 'Banned'): Promise<ICrop>;
  getAllCrops(query?: {
    search?: string;
    sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
    page?: number;
    limit?: number;
    type?: CropType;
  }): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}>;
  getCropById(cropId: string): Promise<ICrop | null>;
  updateCrop(id: string, updates: {name?: string; aliases?: (ICropAlias | string)[]; status?: 'Restricted' | 'Banned'; type?: CropType}, updatedBy: string): Promise<ICrop | null>;
  deleteCrop(id: string): Promise<boolean>;
  findByNameOrAlias(cropName: string): Promise<ICrop | null>;
}
