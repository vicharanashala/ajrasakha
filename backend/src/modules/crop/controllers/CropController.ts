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
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {IUser} from '#root/shared/interfaces/models.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {
  CropIdParam,
  CreateCropDto,
  UpdateCropDto,
  GetAllCropsQuery,
} from '../classes/validators/CropValidators.js';
import {CropRepository, ICrop} from '#root/shared/database/providers/mongo/repositories/CropRepository.js';

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
    @inject(CORE_TYPES.CropRepository)
    private readonly cropRepository: CropRepository,
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
    return this.cropRepository.getAllCrops(query);
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
    const crop = await this.cropRepository.getCropById(cropId);

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
    const crop = await this.cropRepository.createCrop(
      body.cropId,
      body.name,
      userId,
      body.aliases,
    );

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

    const updated = await this.cropRepository.updateCrop(
      cropId,
      {
        cropId: body.cropId,
        name: body.name,
        aliases: body.aliases,
        isActive: body.isActive,
      },
      userId,
    );

    if (!updated) {
      throw new NotFoundError(`Crop with id "${cropId}" not found`);
    }

    return {
      success: true,
      message: `Crop "${updated.name}" updated successfully.`,
      data: updated,
    };
  }

  // ─── DELETE CROP (soft) ──────────────────────────────────────────────────

  @Delete('/:cropId')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Soft-delete a crop (admin/moderator only)'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async deleteCrop(
    @Params() params: CropIdParam,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; message: string}> {
    // Role check
    if (!WRITE_ROLES.includes(user.role)) {
      throw new ForbiddenError(
        'Only admins and moderators can delete crops.',
      );
    }

    const {cropId} = params;
    const userId = user._id.toString();

    await this.cropRepository.deleteCrop(cropId, userId);

    return {
      success: true,
      message: 'Crop has been deactivated successfully.',
    };
  }
}
