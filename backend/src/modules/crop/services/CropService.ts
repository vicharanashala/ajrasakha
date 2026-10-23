import { injectable, inject } from 'inversify';
import { BadRequestError } from 'routing-controllers';
import { GLOBAL_TYPES } from '#root/types.js';
import { BaseService, MongoDatabase } from '#root/shared/index.js';
import { ICrop, ICropAlias, CROP_OTHER_TYPES } from '#root/shared/interfaces/models.js';
import { ICropRepository } from '#root/shared/database/interfaces/ICropRepository.js';
import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { ICropService } from '../interfaces/ICropService.js';
import {
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
} from '../classes/validators/CropValidators.js';
import {
  CropImportEntry,
  CropImportResult,
  planAliasMerge,
} from '../utils/importAliases.js';

@injectable()
export class CropService extends BaseService implements ICropService {
  constructor(
    @inject(GLOBAL_TYPES.CropRepository)
    private readonly cropRepository: ICropRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepository: IQuestionRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepository: IUserRepository,

    @inject(GLOBAL_TYPES.Database)
    mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async getAllCrops(
    query?: GetAllCropsQuery,
  ): Promise<{ crops: ICrop[]; totalCount: number; totalPages: number }> {
    const result = await this.cropRepository.getAllCrops(query);

    // Resolve createdBy / updatedBy user ids → "firstName lastName" so the UI can show
    // the audit info without a separate (and often incomplete) users fetch.
    const ids = new Set<string>();
    for (const c of result.crops) {
      if (c.createdBy) ids.add(c.createdBy.toString());
      if (c.updatedBy) ids.add(c.updatedBy.toString());
    }
    if (ids.size > 0) {
      const users = await this.userRepository.getUsersByIds([...ids]);
      const nameById = new Map(
        users.map(u => [
          u._id!.toString(),
          `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || '',
        ]),
      );
      result.crops = result.crops.map(c => ({
        ...c,
        createdByName: c.createdBy
          ? nameById.get(c.createdBy.toString())
          : undefined,
        updatedByName: c.updatedBy
          ? nameById.get(c.updatedBy.toString())
          : undefined,
      }));
    }

    return result;
  }

  async getCropById(cropId: string): Promise<ICrop | null> {
    return this.cropRepository.getCropById(cropId);
  }

  /** Categories that get their own first-class tab: the known crop-side types
   *  (always present) plus any custom types users have created via "Other". */
  async getEntryTypes(): Promise<string[]> {
    const known = [...CROP_OTHER_TYPES];
    const seen = new Set(known.map(t => t.toLowerCase()));
    const dbTypes = await this.cropRepository.getCropSideTypes();
    const extras = dbTypes.filter(t => !seen.has(t.toLowerCase()));
    return [...known, ...extras];
  }

  async findExistingNames(names: string[]): Promise<{name: string; type: string}[]> {
    const crops = await this.cropRepository.findByNames(names);
    return crops.map(crop => ({name: crop.name, type: crop.type ?? 'crop'}));
  }

  /**
   * Imports sheet entries of one type. An entry whose name already exists gets the
   * new vernacular terms merged in; otherwise it is created. Terms that conflict
   * with another entry are skipped one by one so the rest of the entry still lands.
   */
  async bulkImport(
    type: string,
    entries: CropImportEntry[],
    userId: string,
  ): Promise<{
    results: CropImportResult[];
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  }> {
    const existingByName = new Map(
      (await this.cropRepository.findByNames(entries.map(e => e.name))).map(
        crop => [crop.name.trim().toLowerCase(), crop],
      ),
    );
    const results: CropImportResult[] = [];

    for (const entry of entries) {
      try {
        const existing = existingByName.get(entry.name.trim().toLowerCase());
        if (existing && (existing.type ?? 'crop') !== type) {
          results.push({
            name: entry.name,
            status: 'failed',
            reason: `Already exists under the "${existing.type ?? 'crop'}" type`,
          });
          continue;
        }
        results.push(await this.importEntry(type, entry, existing ?? null, userId));
      } catch (error: any) {
        results.push({
          name: entry.name,
          status: 'failed',
          reason: error?.message || 'Import failed',
        });
      }
    }

    const count = (status: CropImportResult['status']) =>
      results.filter(r => r.status === status).length;
    return {
      results,
      created: count('created'),
      updated: count('updated'),
      skipped: count('skipped'),
      failed: count('failed'),
    };
  }

  private async importEntry(
    type: string,
    entry: CropImportEntry,
    existing: ICrop | null,
    userId: string,
  ): Promise<CropImportResult> {
    const {stored, fresh, enriched, skipped} = planAliasMerge(
      entry.name,
      existing?.aliases ?? [],
      entry.aliases,
    );
    const newScientificName = !existing?.scientificName && entry.scientificName;

    if (existing && !fresh.length && !enriched && !newScientificName) {
      return {name: entry.name, status: 'skipped', reason: 'All terms and details already exist for this entry'};
    }

    // Try the whole entry first; a conflicting term falls back to one-by-one adds.
    let entryId = existing?._id?.toString();
    let current: (ICropAlias | string)[] = [...stored];
    const conflicts: string[] = [];

    try {
      if (existing) {
        await this.cropRepository.updateCrop(
          entryId!,
          {
            aliases: [...current, ...fresh],
            ...(newScientificName ? {scientificName: newScientificName} : {}),
          },
          userId,
        );
      } else {
        await this.cropRepository.createCrop(
          entry.name,
          userId,
          fresh,
          type,
          undefined,
          undefined,
          entry.scientificName,
        );
      }
      current = [...current, ...fresh];
    } catch (error: any) {
      if (!(error instanceof BadRequestError)) throw error;
      if (existing) {
        // Save the filled-in details on existing terms before adding new ones singly.
        await this.cropRepository.updateCrop(
          entryId!,
          {
            aliases: current,
            ...(newScientificName ? {scientificName: newScientificName} : {}),
          },
          userId,
        );
      } else {
        // Create the bare entry first so the terms can be added one at a time.
        const created = await this.cropRepository.createCrop(
          entry.name,
          userId,
          [],
          type,
          undefined,
          undefined,
          entry.scientificName,
        );
        entryId = created._id?.toString();
      }
      for (const alias of fresh) {
        try {
          await this.cropRepository.updateCrop(entryId!, {aliases: [...current, alias]}, userId);
          current.push(alias);
        } catch (aliasError: any) {
          if (!(aliasError instanceof BadRequestError)) throw aliasError;
          conflicts.push(alias.english_representation);
        }
      }
    }

    const added = fresh.length - conflicts.length;
    const notes = [
      added ? `${added} new term${added === 1 ? '' : 's'} added` : '',
      enriched ? `${enriched} existing term${enriched === 1 ? '' : 's'} filled with new details` : '',
      skipped ? `${skipped} term${skipped === 1 ? '' : 's'} already complete, skipped` : '',
      conflicts.length ? `${conflicts.length} term${conflicts.length === 1 ? '' : 's'} already used by another entry (${conflicts.join(', ')})` : '',
    ].filter(Boolean);

    return {
      name: entry.name,
      status: existing ? 'updated' : 'created',
      reason: notes.join('; '),
    };
  }

  async createCrop(dto: CreateCropDto, userId: string): Promise<ICrop> {
    try {
      const crop = await this.cropRepository.createCrop(
        dto.name,
        userId,
        dto.aliases,
        dto.type,
        dto.status,
        dto.crops,
        dto.scientificName,
      );

      // Backfill questions normalised_crop — only for actual crop entries, not 'other'
      if ((crop.type ?? 'crop') === 'crop') {
        await this.questionRepository.backfillNormalisedCrop(
          crop.name,
          (crop.aliases || [])
            .flatMap(a => {
              if (typeof a === 'string') return [a];
              return [a.english_representation, a.native_representation];
            })
            .filter(Boolean) as string[],
        );
      }

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
        {
          aliases: dto.aliases,
          status: dto.status,
          crops: dto.crops,
          scientificName: dto.scientificName,
          imageUrl: dto.imageUrl,
        },
        userId,
      );

      // Backfill questions normalised_crop — only for actual crop entries, not 'other'
      if (updatedCrop && (updatedCrop.type ?? 'crop') === 'crop') {
        await this.questionRepository.backfillNormalisedCrop(
          updatedCrop.name,
          (updatedCrop.aliases || [])
            .flatMap(a => {
              if (typeof a === 'string') return [a];
              return [a.english_representation, a.native_representation];
            })
            .filter(Boolean) as string[],
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