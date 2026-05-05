import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Put,
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
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IUser, ICrop} from '#root/shared/interfaces/models.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {
  CropIdParam,
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
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
import { CsvUploadFileOptions } from '../classes/validators/fileUploadOptions.js';
import { startCropBulkProcessing, startChemicalBulkProcessing, getCropBulkJobById, getCropBulkJobs } from '#root/workers/cropWorkerManager.js';
import * as XLSX from 'xlsx';

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

      const uploadType = body?.type === 'chemical' ? 'chemical' : 'crop';

      const jobId = uploadType === 'chemical'
        ? startChemicalBulkProcessing(rows, userId, actor, this.auditTrailsService)
        : startCropBulkProcessing(rows, userId, actor, this.auditTrailsService);

      const label = uploadType === 'chemical' ? 'Chemicals' : 'Crops';

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
        context: {
          cropName: body.name,
        },
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
      context: {
        cropId: crop._id.toString(),
        cropName: crop.name,
      },
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
    @Body() body: UpdateCropDto,
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
          ...auditPayload.context,
          aliases: body.aliases,
          cropName: previousCrop?.name,
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
        context: {
          ...auditPayload.context,
          cropName: previousCrop?.name,
        },
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

    auditPayload = {
      ...auditPayload,
      context: {
        ...auditPayload.context,
        cropName: updated.name,
      },
      changes: {
        before: {
          aliases: previousCrop?.aliases,
          name: previousCrop?.name,
        },
        after: {
          ...body,
          name: updated.name,
        },
      },
    }
    this.auditTrailsService.createAuditTrail(auditPayload);

    return {
      success: true,
      message: `Crop "${updated.name}" updated successfully.`,
      data: updated,
    };
  }

  // ─── BULK JOB STATUS ──────────────────────────────────────────────────────

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
}

