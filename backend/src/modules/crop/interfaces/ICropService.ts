import {ICrop, ICropAlias} from '#root/shared/interfaces/models.js';
import {
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
} from '../classes/validators/CropValidators.js';
import {CropImportEntry, CropImportResult} from '../utils/importAliases.js';

export interface ICropService {
  getAllCrops(query?: GetAllCropsQuery): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}>;
  getCropById(cropId: string): Promise<ICrop | null>;
  getEntryTypes(): Promise<string[]>;
  findExistingNames(names: string[]): Promise<{name: string; type: string; aliases: ICropAlias[]}[]>;
  bulkImport(
    type: string,
    entries: CropImportEntry[],
    userId: string,
  ): Promise<{
    results: CropImportResult[];
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  }>;
  createCrop(dto: CreateCropDto, userId: string): Promise<ICrop>;
  updateCrop(cropId: string, dto: UpdateCropDto, userId: string): Promise<ICrop | null>;
}
