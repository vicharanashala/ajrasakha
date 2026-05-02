import {ICrop, ICropAlias} from '#root/shared/interfaces/models.js';
import { CropResponseDto, PaginatedCropsResponseDto } from '#root/modules/crop/dtos/CropResponseDto.js';

export interface ICropRepository {
  createCrop(name: string, createdBy: string, aliases?: ICropAlias[]): Promise<ICrop>;
  getAllCrops(query?: {
    search?: string;
    sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
    page?: number;
    limit?: number;
  }): Promise<PaginatedCropsResponseDto>;
  getCropById(cropId: string): Promise<CropResponseDto | null>;
  updateCrop(id: string, updates: {name?: string; aliases?: (ICropAlias | string)[]}, updatedBy: string): Promise<ICrop | null>;
  findByNameOrAlias(cropName: string): Promise<ICrop | null>;
}
