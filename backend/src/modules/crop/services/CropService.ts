import {injectable, inject} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {ICrop} from '#root/shared/interfaces/models.js';
import {CropRepository} from '#root/shared/database/providers/mongo/repositories/CropRepository.js';
import {ICropService} from '../interfaces/ICropService.js';
import {
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
} from '../classes/validators/CropValidators.js';

@injectable()
export class CropService extends BaseService implements ICropService {
  constructor(
    @inject(GLOBAL_TYPES.CropRepository)
    private readonly cropRepository: CropRepository,
    @inject(GLOBAL_TYPES.Database)
    mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async getAllCrops(
    query?: GetAllCropsQuery,
  ): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}> {
    return this.cropRepository.getAllCrops(query);
  }

  async getCropById(cropId: string): Promise<ICrop | null> {
    return this.cropRepository.getCropById(cropId);
  }

  async createCrop(dto: CreateCropDto, userId: string): Promise<ICrop> {
    return this.cropRepository.createCrop(dto.name, userId, dto.aliases);
  }

  async updateCrop(
    cropId: string,
    dto: UpdateCropDto,
    userId: string,
  ): Promise<ICrop | null> {
<<<<<<< HEAD
    try {
      // Only aliases are updatable — crop name is immutable
      return await this.cropRepository.updateCrop(
        cropId,
        {
          aliases: dto.aliases,
        },
        userId,
      );
    } catch (error: any) {
      if (error?.message?.includes('already exists') || error?.message?.includes('Cannot add alias')) {
        throw new BadRequestError(error.message);
      }
      throw error;
    }
=======
    return this.cropRepository.updateCrop(
      cropId,
      {name: dto.name, aliases: dto.aliases},
      userId,
    );
>>>>>>> ca70c346 (removed isActive, rest API protocols followed)
  }
}
