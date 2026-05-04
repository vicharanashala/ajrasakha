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
import {GLOBAL_TYPES} from '#root/types.js';
import {IUser, IChemical} from '#root/shared/interfaces/models.js';
import {
  ChemicalIdParam,
  CreateChemicalDto,
  UpdateChemicalDto,
  GetAllChemicalsQuery,
} from '../classes/validators/ChemicalValidators.js';
import {IChemicalService} from '../interfaces/IChemicalService.js';
import {
  ChemicalErrorResponse,
  PaginatedChemicalsResponse,
  ChemicalSingleResponse,
  ChemicalSuccessResponse,
} from '../classes/validators/ChemicalResponseValidators.js';

// ── Allowed roles for write operations ──
const WRITE_ROLES = ['admin', 'moderator'];

@OpenAPI({
  tags: ['chemicals'],
  description: 'Operations for managing the chemical master list',
})
@injectable()
@JsonController('/chemicals')
export class ChemicalController {
  constructor(
    @inject(GLOBAL_TYPES.ChemicalService)
    private readonly chemicalService: IChemicalService,
  ) {}

  @OpenAPI({
    summary: 'Get all chemicals (supports search, filter, sort, pagination)',
    description: 'Retrieves paginated list of chemicals with optional search, filtering, and sorting.',
  })
  @ResponseSchema(PaginatedChemicalsResponse, {
    statusCode: 200,
    description: 'Chemicals retrieved successfully with pagination',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid query parameters',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch chemicals',
  })
  @Get('/')
  @HttpCode(200)
  @Authorized()
  async getAllChemicals(
    @QueryParams() query: GetAllChemicalsQuery,
  ): Promise<{chemicals: IChemical[]; totalCount: number; totalPages: number}> {
    return this.chemicalService.getAllChemicals(query);
  }


  @OpenAPI({
    summary: 'Get a chemical by ID',
    description: 'Retrieves a specific chemical by its MongoDB ObjectId.',
  })
  @ResponseSchema(ChemicalSingleResponse, {
    statusCode: 200,
    description: 'Chemical retrieved successfully',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid chemical ID format',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 404,
    description: 'Not found - Chemical with specified ID not found',
  })
  @Get('/:chemicalId')
  @HttpCode(200)
  @Authorized()
  async getChemicalById(
    @Params() params: ChemicalIdParam,
  ): Promise<{success: boolean; data: IChemical}> {
    const {chemicalId} = params;
    const chemical = await this.chemicalService.getChemicalById(chemicalId);

    if (!chemical) {
      throw new NotFoundError(`Chemical with id "${chemicalId}" not found`);
    }

    return {success: true, data: chemical};
  }


  @OpenAPI({
    summary: 'Add a new chemical (admin/moderator only)',
    description: 'Creates a new chemical with name and status. Only admins and moderators can perform this operation.',
  })
  @ResponseSchema(ChemicalSuccessResponse, {
    statusCode: 201,
    description: 'Chemical created successfully - Returns the created chemical data',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid chemical data or chemical already exists',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Only admins and moderators can add chemicals',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to create chemical',
  })
  @Post('/')
  @HttpCode(201)
  @Authorized()
  async createChemical(
    @Body() body: CreateChemicalDto,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; message: string; data: IChemical}> {
    // Role check
    if (!WRITE_ROLES.includes(user.role)) {
      throw new ForbiddenError(
        'Only admins and moderators can add chemicals.',
      );
    }

    const userId = user._id.toString();
    const chemical = await this.chemicalService.createChemical(body, userId);

    return {
      success: true,
      message: `Chemical "${chemical.name}" added successfully.`,
      data: chemical,
    };
  }



  @OpenAPI({
    summary: 'Update a chemical (admin/moderator only)',
    description: 'Updates an existing chemical\'s name and/or status. Only admins and moderators can perform this operation.',
  })
  @ResponseSchema(ChemicalSuccessResponse, {
    statusCode: 200,
    description: 'Chemical updated successfully - Returns the updated chemical data',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid chemical data or chemical already exists',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Only admins and moderators can update chemicals',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 404,
    description: 'Not found - Chemical with specified ID not found',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to update chemical',
  })
  @Put('/:chemicalId')
  @HttpCode(200)
  @Authorized()
  async updateChemical(
    @Params() params: ChemicalIdParam,
    @Body() body: UpdateChemicalDto,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; message: string; data: IChemical}> {
    // Role check
    if (!WRITE_ROLES.includes(user.role)) {
      throw new ForbiddenError(
        'Only admins and moderators can update chemicals.',
      );
    }

    const {chemicalId} = params;
    const userId = user._id.toString();

    const updated = await this.chemicalService.updateChemical(chemicalId, body, userId);

    if (!updated) {
      throw new NotFoundError(`Chemical with id "${chemicalId}" not found`);
    }

    return {
      success: true,
      message: `Chemical "${updated.name}" updated successfully.`,
      data: updated,
    };
  }


  @OpenAPI({
    summary: 'Delete a chemical (admin/moderator only)',
    description: 'Deletes an existing chemical. Only admins and moderators can perform this operation.',
  })
  @ResponseSchema(ChemicalSuccessResponse, {
    statusCode: 200,
    description: 'Chemical deleted successfully',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Only admins and moderators can delete chemicals',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 404,
    description: 'Not found - Chemical with specified ID not found',
  })
  @ResponseSchema(ChemicalErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to delete chemical',
  })
  @Delete('/:chemicalId')
  @HttpCode(200)
  @Authorized()
  async deleteChemical(
    @Params() params: ChemicalIdParam,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; message: string}> {
    // Role check
    if (!WRITE_ROLES.includes(user.role)) {
      throw new ForbiddenError(
        'Only admins and moderators can delete chemicals.',
      );
    }

    const {chemicalId} = params;
    
    const deleted = await this.chemicalService.deleteChemical(chemicalId);

    if (!deleted) {
      throw new NotFoundError(`Chemical with id "${chemicalId}" not found`);
    }

    return {
      success: true,
      message: `Chemical deleted successfully.`,
    };
  }
}
