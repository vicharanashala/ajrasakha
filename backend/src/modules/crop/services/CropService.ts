import {injectable, inject} from 'inversify';
import {BadRequestError} from 'routing-controllers';
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

  // Backfill normalised_crop in questions (OPTIMIZED)
  private async backfillNormalisedCropForSingleCrop(
    name: string,
    aliases: string[],
  ): Promise<void> {
    const questionsCollection = await (this.cropRepository as any).db.getCollection('questions');

    const allValues = [name, ...(aliases || [])].map((v) =>
      v.toLowerCase().trim(),
    );

    const conditions = allValues.map((val) => ({
      'details.crop': { $regex: `^${val}$`, $options: 'i' },
    }));

    const result = await questionsCollection.updateMany(
      {
        $and: [
          { $or: conditions },
          {
            $or: [
              { 'details.normalised_crop': { $exists: false } },
              { 'details.normalised_crop': null },
            ],
          },
        ],
      },
      {
        $set: {
          'details.normalised_crop': name.toLowerCase(),
        },
      },
    );

    console.log(
      `✅ Backfilled ${result.modifiedCount} questions for crop: ${name}`,
    );
  }

  async createCrop(dto: CreateCropDto, userId: string): Promise<ICrop> {
    try {
      const crop = await this.cropRepository.createCrop(
        dto.name,
        userId,
        dto.aliases,
      );

      // Trigger backfill after creation
      await this.backfillNormalisedCropForSingleCrop(
        dto.name,
        dto.aliases,
      );

      return crop;
    } catch (error: any) {
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
      const updatedCrop = await this.cropRepository.updateCrop(
        cropId,
        {aliases: dto.aliases},
        userId,
      );

      if (updatedCrop) {
        // Trigger backfill after alias update
        await this.backfillNormalisedCropForSingleCrop(
          updatedCrop.name,
          dto.aliases,
        );
      }

      return updatedCrop;
    } catch (error: any) {
      if (
        error?.message?.includes('already exists') ||
        error?.message?.includes('Cannot add alias')
      ) {
        throw new BadRequestError(error.message);
      }
      throw error;
    }
  }
}