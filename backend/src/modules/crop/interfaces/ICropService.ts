import {ICrop} from '#root/shared/interfaces/models.js';
import {
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
} from '../classes/validators/CropValidators.js';
import { CropResponseDto, PaginatedCropsResponseDto } from '../dtos/CropResponseDto.js';

export interface ICropService {
  getAllCrops(query?: GetAllCropsQuery): Promise<PaginatedCropsResponseDto>;
  getCropById(cropId: string): Promise<CropResponseDto | null>;
  createCrop(dto: CreateCropDto, userId: string): Promise<ICrop>;
  updateCrop(cropId: string, dto: UpdateCropDto, userId: string): Promise<ICrop | null>;
}
