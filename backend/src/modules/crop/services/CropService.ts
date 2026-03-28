import {injectable, inject} from 'inversify';
import {BadRequestError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {ICrop} from '#root/shared/interfaces/models.js';
import {CropRepository} from '#root/shared/database/providers/mongo/repositories/CropRepository.js';
import {ICropService} from '../interfaces/ICropService.js';
import {
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
} from '../classes/validators/CropValidators.js';

@injectable()
export class CropService implements ICropService {
  constructor(
    @inject(GLOBAL_TYPES.CropRepository)
    private readonly cropRepository: CropRepository,
  ) {}

  async getAllCrops(
    query?: GetAllCropsQuery,
  ): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}> {
    return this.cropRepository.getAllCrops(query);
  }

  async getCropById(cropId: string): Promise<ICrop | null> {
    return this.cropRepository.getCropById(cropId);
  }

  async createCrop(dto: CreateCropDto, userId: string): Promise<ICrop> {
    try {
      return await this.cropRepository.createCrop(
        dto.cropId,
        dto.name,
        userId,
        dto.aliases,
      );
    } catch (error: any) {
      // Re-throw duplicate as 400 instead of 500
      if (error?.message?.includes('already exists')) {
        throw new BadRequestError(error.message);
      }
      throw error;
    }
  }

  async updateCrop(
    cropId: string,
    dto: UpdateCropDto,
    userId: string,
  ): Promise<ICrop | null> {
    try {
      return await this.cropRepository.updateCrop(
        cropId,
        {
          cropId: dto.cropId,
          name: dto.name,
          aliases: dto.aliases,
        },
        userId,
      );
    } catch (error: any) {
      if (error?.message?.includes('already exists')) {
        throw new BadRequestError(error.message);
      }
      throw error;
    }
  }

  async deleteCrop(cropId: string): Promise<{deletedCount: number}> {
    return this.cropRepository.deleteCrop(cropId);
  }
}
