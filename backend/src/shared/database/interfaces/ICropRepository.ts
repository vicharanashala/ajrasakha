import {ICrop, ICropAlias, CropType} from '#root/shared/interfaces/models.js';

export interface ICropRepository {
   createCrop(name: string, createdBy: string, aliases?: ICropAlias[], type?: CropType, status?: string, crops?: string[],): Promise<ICrop>;
  getAllCrops(query?: {
    search?: string;
    sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
    page?: number;
    limit?: number;
    type?: CropType;
  }): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}>;
  getCropById(cropId: string): Promise<ICrop | null>;
  updateCrop(id: string, updates: {name?: string; aliases?: (ICropAlias | string)[]; status?: string; crops?: string[]; type?: CropType;}, updatedBy: string): Promise<ICrop | null>;
  deleteCrop(id: string): Promise<boolean>;
  findByNameOrAlias(cropName: string): Promise<ICrop | null>;
  findChemicalByNameOrAlias(name: string): Promise<ICrop | null>;
}
