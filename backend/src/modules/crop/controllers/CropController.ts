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

  @Get('/')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get all crops (supports search, filter, sort, pagination)'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getAllCrops(
    @QueryParams() query: GetAllCropsQuery,
  ): Promise<{crops: ICrop[]; totalCount: number; totalPages: number}> {
    return this.cropService.getAllCrops(query);
  }

  // ─── GET CROP BY ID ──────────────────────────────────────────────────────

  @Get('/:cropId')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get a crop by ID'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
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

  @Post('/')
  @HttpCode(201)
  @Authorized()
  @OpenAPI({summary: 'Add a new crop (admin/moderator only)'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async createCrop(
    @Body() body: CreateCropDto,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; message: string; data: ICrop}> {
    // Role check
    if (!WRITE_ROLES.includes(user.role)) {
      throw new ForbiddenError(
        'Only admins and moderators can add crops.',
      );
    }

    const userId = user._id.toString();
    const crop = await this.cropService.createCrop(body, userId);
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.CROP_MANAGEMENT,
      action: AuditAction.ADD_CROP,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
      },
      context: {
        cropId: crop._id.toString(),
        cropName: crop.name,
      },
      changes: {
        after: {
          name: crop.name,
        },
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

  @Put('/:cropId')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Update a crop (admin/moderator only)'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
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
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.CROP_MANAGEMENT,
      action: AuditAction.UPDATE_CROP,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
      },
      context: {
        cropId,
      },
      changes: {
        after: {
          ...body,
        },
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);

    const updated = await this.cropService.updateCrop(cropId, body, userId);

    if (!updated) {
      throw new NotFoundError(`Crop with id "${cropId}" not found`);
    }

    return {
      success: true,
      message: `Crop "${updated.name}" updated successfully.`,
      data: updated,
    };
  }
}

