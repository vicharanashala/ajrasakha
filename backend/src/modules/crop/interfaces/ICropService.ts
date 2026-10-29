import {ICrop, ICropAlias, IQuestion} from '#root/shared/interfaces/models.js';
import {
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
  DeleteCropDto,
  GetAffectedQuestionsQuery,
} from '../classes/validators/CropValidators.js';
import {CropImportChange, CropImportEntry, CropImportResult} from '../utils/importAliases.js';

export interface ICropService {
  getAllCrops(query?: GetAllCropsQuery): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}>;
  getCropById(cropId: string): Promise<ICrop | null>;
  getEntryTypes(): Promise<string[]>;
  findExistingNames(names: string[]): Promise<{name: string; type: string; aliases: ICropAlias[]}[]>;
  bulkImport(
    type: string,
    entries: CropImportEntry[],
    userId: string,
    onProgress?: (processed: number) => void,
  ): Promise<{
    results: CropImportResult[];
    changes: CropImportChange[];
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  }>;
  createCrop(dto: CreateCropDto, userId: string): Promise<ICrop>;
  updateCrop(cropId: string, dto: UpdateCropDto, userId: string): Promise<ICrop | null>;
  getAffectedQuestions(
    cropId: string,
    options?: GetAffectedQuestionsQuery,
  ): Promise<{
    count: number;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    cropName: string;
    questions: IQuestion[];
  }>;
  deleteOrReassignCrop(
    cropId: string,
    dto: DeleteCropDto,
    userId: string,
  ): Promise<{ cropDeleted: boolean; reassignedCount: number; message: string }>;
  getAllNormalisedCrops(): Promise<ICrop[]>;
}
