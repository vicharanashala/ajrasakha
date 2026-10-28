import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Put,
  Delete,
  Body,
  HttpCode,
  Params,
  QueryParams,
  Authorized,
  CurrentUser,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
  InternalServerError,
  UploadedFile,
  Res,
  ContentType,
  UseBefore,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IUser, ICrop, ICropAlias} from '#root/shared/interfaces/models.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {
  CropIdParam,
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
  DeleteCropDto,
} from '../classes/validators/CropValidators.js';
import {ICropService} from '../interfaces/ICropService.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { AuditAction, AuditCategory, ModeratorAuditTrail, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {
  CropErrorResponse,
  PaginatedCropsResponse,
  CropSingleResponse,
  CropSuccessResponse,
} from '../classes/validators/CropResponseValidators.js';
import { CsvUploadFileOptions, ImageUploadFileOptions } from '../classes/validators/fileUploadOptions.js';
import { uploadMediaFile, deleteMediaByUrl } from '#root/modules/dashboard/utils/uploadMedia.js';
import { startCropBulkProcessing, startChemicalBulkProcessing, getCropBulkJobById, getCropBulkJobs } from '#root/workers/cropWorkerManager.js';
import * as XLSX from 'xlsx';
import { FlexibleAuth } from '#root/shared/index.js';
import { randomUUID } from 'crypto';
import { CropImportChange, CropImportEntry } from '../utils/importAliases.js';
import { CropImportJob, createImportJob, getImportJob } from '../utils/importJobs.js';

/** Guards a single sheet import against an oversized payload. */
const MAX_IMPORT_ENTRIES = 5000;
/** Caps the name lists kept on an import's summary audit entry. */
const MAX_AUDIT_NAMES = 500;

// ── Allowed roles for write operations ──
const WRITE_ROLES = ['admin', 'moderator'];

@OpenAPI({
  tags: ['crops'],
  description: 'Operations for managing the crop master list',
})
@injectable()
@JsonController('/crops')
export class CropController {
  constructor(
    @inject(GLOBAL_TYPES.CropService)
    private readonly cropService: ICropService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  /**
   * Audit context for any AgriTech entry (crop / chemical / other) — one common shape:
   * `agriTechId` / `agriTechName`. The fetch (getAuditTrailsByCropId) matches this key.
   */
  private entryAuditContext(id?: string, name?: string): Record<string, any> {
    const ctx: Record<string, any> = {};
    if (id !== undefined) ctx.agriTechId = id;
    if (name !== undefined) ctx.agriTechName = name;
    return ctx;
  }

  // ─── GET ALL CROPS ───────────────────────────────────────────────────────

  @OpenAPI({
    summary: 'Get all crops (supports search, filter, sort, pagination)',
    description: 'Retrieves paginated list of crops with optional search, filtering, and sorting.',
  })
  @ResponseSchema(PaginatedCropsResponse, {
    statusCode: 200,
    description: 'Crops retrieved successfully with pagination',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid query parameters',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch crops',
  })
  @Get('/')
  @HttpCode(200)
  @Authorized()
  async getAllCrops(
    @QueryParams() query: GetAllCropsQuery,
  ): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}> {
    return this.cropService.getAllCrops(query);
  }

  // ─── BULK JOB STATUS ──────────────────────────────────────────────────────
  // IMPORTANT: these static routes must come BEFORE /:cropId to avoid being
  // swallowed by the wildcard param route.

  // Extensible crop-side categories (weed/pest/disease/…) the UI renders dynamically.
  // Declared before '/:cropId' so it isn't swallowed by the wildcard param route.
  @Get('/entry-types')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'List the crop-side entry categories (known + custom) for the UI.' })
  async getEntryTypes(): Promise<{ types: string[] }> {
    return { types: await this.cropService.getEntryTypes() };
  }

  // All normalized crops from crop_master (for replacement / selection)
  @Get('/normalised-list')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'List all normalized crops from crop_master collection for replacement selection' })
  async getAllNormalisedCrops(): Promise<{ crops: ICrop[] }> {
    const crops = await this.cropService.getAllNormalisedCrops();
    return { crops };
  }

  // Which of the given names already exist, so the import preview can flag them.
  @Post('/import/duplicates')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Find which of the given names already exist' })
  async findImportDuplicates(
    @Body() data: { names: string[] },
  ): Promise<{ entries: { name: string; type: string; aliases: ICropAlias[] }[] }> {
    if (!Array.isArray(data?.names)) throw new BadRequestError('No names to check');
    if (data.names.length > MAX_IMPORT_ENTRIES) {
      throw new BadRequestError(`A single import is limited to ${MAX_IMPORT_ENTRIES} entries`);
    }
    return { entries: await this.cropService.findExistingNames(data.names) };
  }

  // Starts importing entries parsed from a sheet in the background and returns a job id;
  // the client polls GET /crops/import/:jobId for progress and the result.
  @Post('/import')
  @HttpCode(202)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Start a bulk import of AgriTech entries from a parsed sheet' })
  async importEntries(
    @Body() data: { type: string; entries: CropImportEntry[]; fileName?: string },
    @CurrentUser() user: IUser,
  ): Promise<{ jobId: string; total: number }> {
    const type = data?.type?.trim().toLowerCase();
    if (!type || type === 'chemical') throw new BadRequestError('Invalid entry type');
    if (!Array.isArray(data?.entries) || data.entries.length === 0) {
      throw new BadRequestError('No entries to import');
    }
    if (data.entries.length > MAX_IMPORT_ENTRIES) {
      throw new BadRequestError(`A single import is limited to ${MAX_IMPORT_ENTRIES} entries`);
    }
    const entries = data.entries.filter(
      e => typeof e?.name === 'string' && e.name.trim() && Array.isArray(e.aliases),
    );
    if (!entries.length) throw new BadRequestError('No valid entries to import');

    const actor = {
      id: user._id.toString(),
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      avatar: user?.avatar || '',
    };
    // One id ties the summary entry to every per-entry entry of this import.
    const importContext = {
      importId: randomUUID(),
      source: 'sheet_import',
      fileName: typeof data?.fileName === 'string' ? data.fileName.trim().slice(0, 200) : undefined,
      type,
    };
    const totalAliases = entries.reduce((sum, e) => sum + e.aliases.length, 0);

    const job = createImportJob(user._id.toString(), entries.length);
    void this.runImportJob(job, type, entries, actor, importContext, totalAliases);
    return { jobId: job.id, total: job.total };
  }

  // Progress and, once finished, the result of an import started by this user.
  @Get('/import/:jobId')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Status and result of a sheet import job' })
  getImportStatus(@Params() params: { jobId: string }, @CurrentUser() user: IUser) {
    const job = getImportJob(params.jobId);
    if (!job || (job.userId !== user._id.toString() && user.role !== 'admin')) {
      throw new NotFoundError('Import job not found');
    }
    const { userId: _owner, ...status } = job;
    return status;
  }

  /** Runs an import job to completion, keeping its progress and audit trail up to date. */
  private async runImportJob(
    job: CropImportJob,
    type: string,
    entries: CropImportEntry[],
    actor: ModeratorAuditTrail['actor'],
    importContext: Record<string, any>,
    totalAliases: number,
  ): Promise<void> {
    try {
      const { changes, ...summary } = await this.cropService.bulkImport(
        type,
        entries,
        String(actor.id),
        processed => { job.processed = processed; },
      );
      job.result = summary;
      job.status = 'completed';
      this.auditImport(actor, importContext, entries.length, totalAliases, changes).catch(err =>
        console.error('Failed to write AgriTech import audit trail:', err),
      );
    } catch (err: any) {
      job.status = 'failed';
      job.error = 'Import failed. Please try again.';
      console.error('AgriTech import job failed:', err);
      this.auditTrailsService
        .createAuditTrail({
          category: AuditCategory.CROP_MANAGEMENT,
          action: AuditAction.CROP_BULK_CREATE,
          actor,
          context: { ...importContext, totalEntries: entries.length, totalAliases },
          outcome: {
            status: OutComeStatus.FAILED,
            errorCode: err?.errorCode || 'INTERNAL_ERROR',
            errorMessage: err?.message || 'Import failed',
            errorName: err?.name || 'Error',
            errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n'),
          },
        })
        .catch(auditErr => console.error('Failed to audit failed AgriTech import:', auditErr));
    } finally {
      job.finishedAt = new Date();
    }
  }

  /**
   * Records an import in the audit trail: one entry per created, updated or failed
   * document (so it shows in that entry's own history, with the aliases before and
   * after), plus one summary entry. All of them share the same importId.
   */
  private async auditImport(
    actor: ModeratorAuditTrail['actor'],
    importContext: Record<string, any>,
    totalEntries: number,
    totalAliases: number,
    changes: CropImportChange[],
  ): Promise<void> {
    const createdAt = new Date();
    const entryAudits: ModeratorAuditTrail[] = changes
      .filter(change => change.status !== 'skipped')
      .map(change => {
        const isFailed = change.status === 'failed';
        const hasConflicts = change.conflicts.length > 0;
        const before = {
          ...(change.filledBefore.length && { aliases: change.filledBefore }),
          ...(change.scientificName && { scientificName: change.scientificName.before }),
        };
        const after = {
          ...(change.operation === 'create' && !isFailed && { name: change.name, type: importContext.type }),
          ...((change.filledAfter.length || change.addedAliases.length) && {
            aliases: [...change.filledAfter, ...change.addedAliases],
          }),
          ...(change.scientificName && { scientificName: change.scientificName.after }),
        };
        return {
          category: AuditCategory.CROP_MANAGEMENT,
          action: change.operation === 'create' ? AuditAction.ADD_CROP : AuditAction.UPDATE_CROP,
          actor,
          context: {
            ...this.entryAuditContext(change.entryId, change.name),
            ...importContext,
            addedAliases: change.addedAliases.length,
            filledAliases: change.filledAfter.length,
            ...(hasConflicts && { conflictingAliases: change.conflicts }),
          },
          ...(!isFailed && {
            changes: {
              ...(Object.keys(before).length && { before }),
              ...(Object.keys(after).length && { after }),
            },
          }),
          outcome: isFailed
            ? { status: OutComeStatus.FAILED, errorMessage: change.reason }
            : { status: hasConflicts ? OutComeStatus.PARTIAL : OutComeStatus.SUCCESS },
          createdAt,
        };
      });

    const namesWith = (status: CropImportChange['status']) =>
      changes.filter(c => c.status === status).map(c => c.name).slice(0, MAX_AUDIT_NAMES);
    const failures = changes
      .filter(c => c.status === 'failed')
      .slice(0, MAX_AUDIT_NAMES)
      .map(c => ({ name: c.name, reason: c.reason }));
    const count = (status: CropImportChange['status']) => changes.filter(c => c.status === status).length;
    const failedCount = count('failed');

    const summaryAudit: ModeratorAuditTrail = {
      category: AuditCategory.CROP_MANAGEMENT,
      action: AuditAction.CROP_BULK_CREATE,
      actor,
      context: {
        ...importContext,
        totalEntries,
        totalAliases,
        created: count('created'),
        updated: count('updated'),
        skipped: count('skipped'),
        failed: failedCount,
        aliasesAdded: changes.reduce((sum, c) => sum + c.addedAliases.length, 0),
        aliasesFilled: changes.reduce((sum, c) => sum + c.filledAfter.length, 0),
        createdNames: namesWith('created'),
        updatedNames: namesWith('updated'),
        skippedNames: namesWith('skipped'),
        ...(failures.length && { failures }),
      },
      outcome: {
        status:
          failedCount === 0
            ? OutComeStatus.SUCCESS
            : failedCount === changes.length
              ? OutComeStatus.FAILED
              : OutComeStatus.PARTIAL,
      },
      createdAt,
    };

    await this.auditTrailsService.createAuditTrails([...entryAudits, summaryAudit]);
  }

  @Get('/bulk-status')
  @HttpCode(200)
  @Authorized()
  getBulkJobs(): any {
    return getCropBulkJobs();
  }

  @Get('/bulk-status/:jobId')
  @HttpCode(200)
  @Authorized()
  getBulkJobById(@Params() params: { jobId: string }): any {
    const job = getCropBulkJobById(params.jobId);
    if (!job) throw new NotFoundError(`Bulk job "${params.jobId}" not found`);
    return job;
  }

  // ─── DOWNLOAD CROPS AS EXCEL ─────────────────────────────────────────────

  @OpenAPI({ summary: 'Download the AgriTech Management list as Excel (optionally filtered by type)' })
  @Get('/download')
  @HttpCode(200)
  @Authorized()
  @ContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async downloadCrops(
    @QueryParams() query: { type?: string },
    @Res() response: any,
  ): Promise<Buffer> {
    // No type → download everything (all AgriTech entries across every type).
    const type = query.type && query.type.trim() ? query.type.trim() : undefined;
    const { crops } = await this.cropService.getAllCrops({ limit: 100000, sort: 'name_asc', type });

    const HEADERS = [
      'Name', 'Type', 'Scientific Name', 'Status', 'Crops',
      'Language', 'Region', 'English Name', 'Native Name',
    ];
    // Crop-level columns (the first 5) are merged vertically across an entry's alias rows.
    const MERGE_COLS = 5;

    const cropLevel = (crop: any, first: boolean): Record<string, string> => ({
      Name: first ? crop.name : '',
      Type: first ? (crop.type ?? 'crop') : '',
      'Scientific Name': first ? (crop.scientificName ?? '') : '',
      Status: first ? (crop.status ?? '') : '',
      Crops: first ? (crop.crops ?? []).join(', ') : '',
    });

    const rows: Record<string, string>[] = [];
    const merges: XLSX.Range[] = [];
    // row 0 in the sheet is the header; data rows start at index 1
    let currentDataRow = 1;

    for (const crop of crops) {
      const aliases = crop.aliases ?? [];
      const startRow = currentDataRow;

      if (aliases.length === 0) {
        rows.push({ ...cropLevel(crop, true), Language: '', Region: '', 'English Name': '', 'Native Name': '' });
        currentDataRow++;
      } else {
        for (let i = 0; i < aliases.length; i++) {
          const alias = aliases[i];
          const row: Record<string, string> = { ...cropLevel(crop, i === 0) };

          if (typeof alias === 'string') {
            row['Language'] = '';
            row['Region'] = '';
            row['English Name'] = alias;
            row['Native Name'] = '';
          } else {
            row['Language'] = alias.language ?? '';
            row['Region'] = alias.region ?? '';
            row['English Name'] = alias.english_representation ?? '';
            row['Native Name'] = alias.native_representation ?? '';
          }

          rows.push(row);
          currentDataRow++;
        }

        // Merge crop-level columns vertically across all alias rows for this crop
        if (aliases.length > 1) {
          for (let c = 0; c < MERGE_COLS; c++) {
            merges.push({ s: { r: startRow, c }, e: { r: currentDataRow - 1, c } });
          }
        }
      }
    }

    const label = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'AgriTech';
    const sheetName = label.slice(0, 31);
    const filename = type ? `${type}_list.xlsx` : 'agritech_management.xlsx';
    const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
    if (merges.length > 0) ws['!merges'] = merges;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ─── GET CROP BY ID ──────────────────────────────────────────────────────

  @OpenAPI({
    summary: 'Get a crop by ID',
    description: 'Retrieves a specific crop by its MongoDB ObjectId.',
  })
  @ResponseSchema(CropSingleResponse, {
    statusCode: 200,
    description: 'Crop retrieved successfully',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid crop ID format',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 404,
    description: 'Not found - Crop with specified ID not found',
  })
  @Get('/get-all-crops-client')
  @HttpCode(200)
  @UseBefore(FlexibleAuth)
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  @OpenAPI({ summary: 'Get All crops data' })
  async getCropsForClient(){
    // Only real crops (not chemicals, pests, etc.), without the default 50 item page limit.
    const result = await this.cropService.getAllCrops({ type: 'crop', limit: 100000, sort: 'name_asc' });
    // "All" is a placeholder entry, not a real crop, so clients never receive it.
    const crops = result.crops.filter(crop => crop.name?.trim().toLowerCase() !== 'all');
    return {
      ...result,
      crops,
      totalCount: result.totalCount - (result.crops.length - crops.length),
    };
  }


  @Get('/:cropId')
  @HttpCode(200)
  @Authorized()
  async getCropById(
    @Params() params: CropIdParam,
  ): Promise<{success: boolean; data: ICrop}> {
    const {cropId} = params;
    const crop = await this.cropService.getCropById(cropId);

    if (!crop) {
      throw new NotFoundError(`Crop with id "${cropId}" not found`);
    }

    return {success: true, data: crop};
  }

  // ─── CREATE CROP ─────────────────────────────────────────────────────────

  @OpenAPI({
    summary: 'Add a new crop (admin/moderator only)',
    description: 'Creates a new crop with name and optional aliases. Only admins and moderators can perform this operation.',
  })
  @ResponseSchema(CropSuccessResponse, {
    statusCode: 201,
    description: 'Crop created successfully - Returns the created crop data',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid crop data or crop already exists',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Only admins and moderators can add crops',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to create crop',
  })
  @Post('/')
  @HttpCode(201)
  @Authorized()
  async createCrop(
    @UploadedFile('file', { options: CsvUploadFileOptions, required: false }) file: Express.Multer.File | undefined,
    @Body({ validate: false }) body: CreateCropDto,
    @CurrentUser() user: IUser,
  ): Promise<any> {
    // Role check
    if (!WRITE_ROLES.includes(user.role)) {
      throw new ForbiddenError('Only admins and moderators can add crops.');
    }

    const userId = user._id.toString();
    const actor = {
      id: userId,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      avatar: user?.avatar || '',
    };

    // ── BULK UPLOAD (CSV) ────────────────────────────────────────────────────
    if (file) {
      let rows: any[] = [];
      try {
        const csvString = file.buffer.toString('utf8');
        const workbook = XLSX.read(csvString, { type: 'string' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(worksheet);

        if (!rows.length) {
          throw new BadRequestError('CSV file is empty or has no valid rows');
        }
      } catch (err: any) {
        throw new BadRequestError(err?.message || 'Failed to parse CSV file');
      }

      const isChemical = body?.type === 'chemical';
      // Crop-side uploads keep whatever type the tab sent (crop/weed/pest/disease or a
      // custom "Other" type); default to 'crop' when none was provided.
      const cropType =
        body?.type && body.type.trim() ? body.type : 'crop';

      const jobId = isChemical
        ? startChemicalBulkProcessing(rows, userId, actor, this.auditTrailsService)
        : startCropBulkProcessing(rows, userId, actor, this.auditTrailsService, cropType);

      const label = isChemical
        ? 'Chemicals'
        : cropType === 'crop'
          ? 'Crops'
          : 'Entries';

      return {
        success: true,
        message: `Processing ${rows.length} CSV rows in the background. ${label} will be created/updated shortly.`,
        jobId,
        count: rows.length,
        isBulkUpload: true,
      };
    }

    // ── SINGLE CROP CREATE ───────────────────────────────────────────────────
    if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) {
      throw new BadRequestError('Crop name is required');
    }


    let crop;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.CROP_MANAGEMENT,
      action: AuditAction.ADD_CROP,
      actor,
    };
    try{
      crop = await this.cropService.createCrop(body, userId);
    } catch(err: any) {
      auditPayload = {
        ...auditPayload,
        context: this.entryAuditContext(undefined, body.name),
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to create crop',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      }
      this.auditTrailsService.createAuditTrail(auditPayload);
      if(err instanceof InternalServerError){
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to create crop');
    }
    auditPayload = {
      ...auditPayload,
      context: this.entryAuditContext(crop._id.toString(), crop.name),
      changes: {
        after: { name: crop.name },
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);
    return {
      success: true,
      message: `Crop "${crop.name}" added successfully.`,
      data: crop,
    };
  }

  // ─── UPDATE CROP ─────────────────────────────────────────────────────────

  @OpenAPI({
    summary: 'Update a crop (admin/moderator only)',
    description: 'Updates an existing crop\'s aliases. Only admins and moderators can perform this operation.',
  })
  @ResponseSchema(CropSuccessResponse, {
    statusCode: 200,
    description: 'Crop updated successfully - Returns the updated crop data',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid crop data, crop already exists, or cannot add alias',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(CropErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to update crop',
  })
  @Put('/:cropId')
  @HttpCode(200)
  @Authorized()
  async updateCrop(
    @Params() params: CropIdParam,
    // Image upload is folded into the crop update: the request is multipart/form-data with
    // the crop fields in a JSON `payload` field plus an optional `image` file and a
    // `removeImage` flag. (A plain JSON body still works — then rawBody IS the payload.)
    @UploadedFile('image', { options: ImageUploadFileOptions, required: false })
    image: Express.Multer.File | undefined,
    @Body({ validate: false }) rawBody: any,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; message: string; data: ICrop}> {
    // Role check
    if (!WRITE_ROLES.includes(user.role)) {
      throw new ForbiddenError(
        'Only admins and moderators can update crops.',
      );
    }

    const {cropId} = params;
    const userId = user._id.toString();

    // Crop fields come as a JSON string in `payload` on multipart requests; fall back to the
    // raw body for a plain JSON request.
    const body: UpdateCropDto =
      rawBody && typeof rawBody.payload === 'string'
        ? JSON.parse(rawBody.payload)
        : (rawBody ?? {});

    // New image uploaded → store its public URL, naming the object after the crop for a
    // human-readable URL. `removeImage` → clear the existing image.
    if (image) {
      const existing = await this.cropService.getCropById(cropId);
      body.imageUrl = await uploadMediaFile(image, 'crops', existing?.name);
      // Replaced an existing image → remove the old object from storage (best-effort).
      if (existing?.imageUrl) await deleteMediaByUrl(existing.imageUrl);
    } else if (rawBody?.removeImage === 'true' || rawBody?.removeImage === true) {
      const existing = await this.cropService.getCropById(cropId);
      if (existing?.imageUrl) await deleteMediaByUrl(existing.imageUrl);
      body.imageUrl = null;
    }
    let updated;
    let previousCrop;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.CROP_MANAGEMENT,
      action: AuditAction.UPDATE_CROP,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        cropId,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try{
      previousCrop = await this.cropService.getCropById(cropId);
      updated = await this.cropService.updateCrop(cropId, body, userId);
    } catch(err: any) {
      auditPayload = {
        ...auditPayload,
        context: {
          ...this.entryAuditContext(cropId, previousCrop?.name),
          aliases: body.aliases,
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to update crop',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      }
      this.auditTrailsService.createAuditTrail(auditPayload);
      if(err instanceof InternalServerError){
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to update crop',
      );
    }

    if (!updated) {
      auditPayload = {
        ...auditPayload,
        context: this.entryAuditContext(cropId, previousCrop?.name),
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: 'NOT_FOUND',
          errorMessage: `Crop with id "${cropId}" not found`,
          errorName: 'NotFoundError',
          errorStack: 'No stack trace available',
        },
      }
      this.auditTrailsService.createAuditTrail(auditPayload);
      throw new NotFoundError(`Crop with id "${cropId}" not found`);
    }

    // The lumped UPDATE_CROP success entry is intentionally NOT recorded — alias changes
    // are captured as separate CREATE_ALIAS / UPDATE_ALIAS / DELETE_ALIAS entries below.
    // (Failure UPDATE_CROP entries above are kept so errors are still traceable.)

    // ── Granular alias audit trails: one entry per created / updated / deleted alias.
    // Aliases have no stable id AND some (e.g. chemical trade names) share the same
    // language/region, so a full-snapshot MULTISET diff is used to find exact additions /
    // removals. Removed and added are then paired by a MEANINGFUL identity (non-empty
    // language|region) to classify a text edit as UPDATE; anything unpaired is CREATE/DELETE.
    const aliasSnapshot = (a: any): string =>
      typeof a === 'string'
        ? `legacy::${a}`
        : JSON.stringify({
            language: a?.language ?? '',
            region: a?.region ?? '',
            english_representation: a?.english_representation ?? '',
            native_representation: a?.native_representation ?? '',
          });
    const aliasIdentity = (a: any): string =>
      typeof a === 'string' ? '' : `${a?.language ?? ''}||${a?.region ?? ''}`;

    const prevList = (previousCrop?.aliases as any[]) ?? [];
    const nextList = (updated?.aliases as any[]) ?? [];

    // Group by exact snapshot so identical duplicates are counted, not collapsed.
    const prevSnaps = new Map<string, any[]>();
    for (const a of prevList) {
      const k = aliasSnapshot(a);
      (prevSnaps.get(k) ?? prevSnaps.set(k, []).get(k)!).push(a);
    }
    const nextSnaps = new Map<string, any[]>();
    for (const a of nextList) {
      const k = aliasSnapshot(a);
      (nextSnaps.get(k) ?? nextSnaps.set(k, []).get(k)!).push(a);
    }

    // Exact removals / additions (multiset difference by snapshot).
    const removed: any[] = [];
    for (const [k, arr] of prevSnaps) {
      const keep = nextSnaps.get(k)?.length ?? 0;
      for (let i = keep; i < arr.length; i++) removed.push(arr[i]);
    }
    const added: any[] = [];
    for (const [k, arr] of nextSnaps) {
      const keep = prevSnaps.get(k)?.length ?? 0;
      for (let i = keep; i < arr.length; i++) added.push(arr[i]);
    }

    // Pair a removed + added sharing a meaningful identity → an UPDATE (text edit).
    const updates: { before: any; after: any }[] = [];
    const usedAdded = new Set<number>();
    const pairedRemoved = new Set<any>();
    for (const r of removed) {
      const rid = aliasIdentity(r);
      if (!rid || rid === '||') continue;
      const idx = added.findIndex(
        (a, i) => !usedAdded.has(i) && aliasIdentity(a) === rid,
      );
      if (idx >= 0) {
        usedAdded.add(idx);
        pairedRemoved.add(r);
        updates.push({ before: r, after: added[idx] });
      }
    }
    const creates = added.filter((_, i) => !usedAdded.has(i));
    const deletes = removed.filter(r => !pairedRemoved.has(r));

    const aliasAuditBase = {
      category: AuditCategory.CROP_MANAGEMENT,
      actor: auditPayload.actor,
      context: this.entryAuditContext(cropId, updated.name),
      outcome: { status: OutComeStatus.SUCCESS },
    };

    for (const alias of creates) {
      this.auditTrailsService.createAuditTrail({
        ...aliasAuditBase,
        action: AuditAction.CREATE_ALIAS,
        changes: { after: { alias } },
      } as ModeratorAuditTrail);
    }
    for (const u of updates) {
      this.auditTrailsService.createAuditTrail({
        ...aliasAuditBase,
        action: AuditAction.UPDATE_ALIAS,
        changes: { before: { alias: u.before }, after: { alias: u.after } },
      } as ModeratorAuditTrail);
    }
    for (const alias of deletes) {
      this.auditTrailsService.createAuditTrail({
        ...aliasAuditBase,
        action: AuditAction.DELETE_ALIAS,
        changes: { before: { alias } },
      } as ModeratorAuditTrail);
    }

    return {
      success: true,
      message: `Crop "${updated.name}" updated successfully.`,
      data: updated,
    };
  }

  // ─── GET AFFECTED QUESTIONS ──────────────────────────────────────────────

  @OpenAPI({
    summary: 'Get all questions affected by a crop',
    description: 'Retrieves all questions where details.normalised_crop matches the given crop name.',
  })
  @Get('/:cropId/affected-questions')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  async getAffectedQuestions(
    @Params() { cropId }: CropIdParam,
  ): Promise<{ count: number; questions: any[] }> {
    return this.cropService.getAffectedQuestions(cropId);
  }

  // ─── DELETE / REASSIGN CROP ──────────────────────────────────────────────

  @OpenAPI({
    summary: 'Delete a crop and optionally reassign its affected questions',
    description: 'Deletes a crop from crop_master if all questions are reassigned or none exist. Otherwise reassigns selected questions.',
  })
  @Delete('/:cropId')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  async deleteCrop(
    @Params() { cropId }: CropIdParam,
    @Body({ required: false }) dto: DeleteCropDto,
    @CurrentUser() currentUser: IUser,
  ): Promise<{ success: boolean; message: string; cropDeleted: boolean; reassignedCount: number }> {
    const existing = await this.cropService.getCropById(cropId);
    if (!existing) {
      throw new NotFoundError(`Crop with ID "${cropId}" not found`);
    }

    const result = await this.cropService.deleteOrReassignCrop(
      cropId,
      dto || {},
      currentUser._id!.toString(),
    );

    // Audit trail logging
    const action = result.cropDeleted
      ? AuditAction.DELETE_CROP
      : AuditAction.REASSIGN_CROP_QUESTIONS;

    this.auditTrailsService.createAuditTrail({
      category: AuditCategory.CROP_MANAGEMENT,
      action,
      actor: {
        id: currentUser._id!.toString(),
        name: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.email || 'User',
        email: currentUser.email,
        role: currentUser.role,
        avatar: currentUser?.avatar || '',
      },
      outcome: { status: OutComeStatus.SUCCESS },
      context: {
        ...this.entryAuditContext(cropId, existing.name),
        replacementCropId: dto?.replacementCropId,
        reassignedCount: result.reassignedCount,
        cropDeleted: result.cropDeleted,
      },
      changes: {
        before: { crop: existing },
        after: {
          cropDeleted: result.cropDeleted,
          reassignedCount: result.reassignedCount,
          replacementCropId: dto?.replacementCropId,
        },
      },
    } as ModeratorAuditTrail);

    return {
      success: true,
      ...result,
    };
  }
}

