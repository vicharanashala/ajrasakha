import { injectable, inject } from 'inversify';
import { BadRequestError } from 'routing-controllers';
import { GLOBAL_TYPES } from '#root/types.js';
import { BaseService, MongoDatabase } from '#root/shared/index.js';
import { ICrop } from '#root/shared/interfaces/models.js';
import { ICropRepository } from '#root/shared/database/interfaces/ICropRepository.js';
import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { ICropService } from '../interfaces/ICropService.js';
import {
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
} from '../classes/validators/CropValidators.js';

@injectable()
export class CropService extends BaseService implements ICropService {
  constructor(
    @inject(GLOBAL_TYPES.CropRepository)
    private readonly cropRepository: ICropRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepository: IQuestionRepository,

    @inject(GLOBAL_TYPES.Database)
    mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async getAllCrops(
    query?: GetAllCropsQuery,
  ): Promise<{ crops: ICrop[]; totalCount: number; totalPages: number }> {
    return this.cropRepository.getAllCrops(query);
  }

  async getCropById(cropId: string): Promise<ICrop | null> {
    return this.cropRepository.getCropById(cropId);
  }

  async createCrop(dto: CreateCropDto, userId: string): Promise<ICrop> {
    try {
      const crop = await this.cropRepository.createCrop(
        dto.name,
        userId,
        dto.aliases,
      );

      //  Backfill via repository — use the DB-normalised values (trimmed + lowercased)
      await this.questionRepository.backfillNormalisedCrop(
        crop.name,
        crop.aliases || [],
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
        { aliases: dto.aliases },
        userId,
      );

      if (updatedCrop) {
        //  Backfill via repository — use the DB-normalised values (trimmed + lowercased)
        await this.questionRepository.backfillNormalisedCrop(
          updatedCrop.name,
          updatedCrop.aliases || [],
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