import {ICrop, ICropAlias, CropType, CropListSort, CropListFilters} from '#root/shared/interfaces/models.js';

export interface ICropRepository {
  createCrop(name: string, createdBy: string, aliases?: ICropAlias[], type?: CropType, status?: string, crops?: string[], scientificName?: string | null): Promise<ICrop>;
  getAllCrops(query?: {
    search?: string;
    sort?: CropListSort;
    page?: number;
    limit?: number;
    type?: CropType;
  } & CropListFilters): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}>;
  getCropById(cropId: string): Promise<ICrop | null>;
  getCropSideTypes(): Promise<string[]>;
  updateCrop(id: string, updates: {name?: string; aliases?: (ICropAlias | string)[]; status?: string; type?: CropType; crops?: string[]; scientificName?: string | null; imageUrl?: string | null}, updatedBy: string): Promise<ICrop | null>;
  deleteCrop(id: string): Promise<boolean>;
  findByNameOrAlias(cropName: string): Promise<ICrop | null>;
  findByNames(names: string[]): Promise<ICrop[]>;
  findChemicalByNameOrAlias(name: string): Promise<ICrop | null>;
}
