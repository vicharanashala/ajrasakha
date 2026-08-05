import {ICrop} from '#root/shared/interfaces/models.js';
import {
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
} from '../classes/validators/CropValidators.js';

interface CropInfo {
  name_hi: string;
  sowing_time: string;
  harvesting_time: string;
}

export interface ICropService {
  getAllCrops(query?: GetAllCropsQuery): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}>;
  getCropById(cropId: string): Promise<ICrop | null>;
  createCrop(dto: CreateCropDto, userId: string): Promise<ICrop>;
  updateCrop(cropId: string, dto: UpdateCropDto, userId: string): Promise<ICrop | null>;
  getCropSowingInfo(cropName: string): CropInfo | null;
}
