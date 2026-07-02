import {inject, injectable} from 'inversify';
import {
  Authorized,
  BadRequestError,
  CurrentUser,
  Get,
  HttpCode,
  JsonController,
  Param,
  QueryParam,
  QueryParams,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {AUDIT_TRAILS_TYPES} from '../types.js';
import {AuditTrailsService} from '../services/AuditTrailsService.js';
import {BadRequestErrorResponse} from '#root/shared/index.js';
// import { AuditTrailsResponse, AuditTrailUserIdParams } from "../classes/validators/AuditTrailsValidators.js";
import {AuditTrailsResponse, AuditTrailsShiftReportResponse} from '../classes/Validators/AuditTrailsValidators.js';
import { AuditFilters } from '../interfaces/IAuditTrails.js';

@OpenAPI({
  tags: ['AuditTrails'],
  description: 'Controller for managing audit trails',
})
@injectable()
@Authorized()
@JsonController('/audit-trails')
class AuditTrailsController {
  constructor(
    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: AuditTrailsService,
  ) {}

  @OpenAPI({
    summary: 'Get all audit trails',
    description: 'Retrieve a list of all audit trails in the system',
  })
  @Authorized()
  @Get('/')
  @HttpCode(200)
  @ResponseSchema(AuditTrailsResponse, {
    description: 'List of audit trails',
    statusCode: 200,
  })
  @ResponseSchema(BadRequestErrorResponse, {
    description: 'Bad Request',
    statusCode: 400,
  })
  async getAllAuditTrails(
    @CurrentUser() user: any,
    @QueryParam('page') page: number = 1,
    @QueryParam('limit') limit: number = 10,
    @QueryParam('start') startDateTime?: string,
    @QueryParam('end') endDateTime?: string,
    @QueryParam('category') category?: string | null,
    @QueryParam('action') action?: string | null,
    @QueryParam('order') order?: "asc" | "desc",
    @QueryParam('status') outComeStatus?: string,
  ) {
    let auditTrails;
    if (user.role !== 'admin') {
      auditTrails = await this.auditTrailsService.getAuditTrailsByModeratorId(
        user._id,
        page,
        limit,
        startDateTime,
        endDateTime,
        category,
        action,
        order,
        outComeStatus,
      );
    } else if(user.role === 'admin') {
      auditTrails = await this.auditTrailsService.getAuditTrails(
        page,
        limit,
        startDateTime,
        endDateTime,
        category,
        action,
        order,
        outComeStatus,
      );
    }

    return {
      message: 'Audit trails retrieved successfully',
      data: auditTrails.data,
      totalDocuments: auditTrails.totalDocuments,
      totalPages: Math.ceil(auditTrails.totalDocuments / limit),
      currentPage: page,
    };
  }

  //     @OpenAPI({
  //         summary: "Get audit trails by courseId and versionId",
  //         description: "Retrieve audit trails for a specific course and version",
  //     })
  //     @Authorized()
  //     @Get("/course/:courseId/version/:versionId")
  //     @HttpCode(200)
  //     @ResponseSchema(AuditTrailsResponse,{
  //         description: "List of audit trails for the specified course and version",
  //         statusCode: 200,
  //     })
  //     @ResponseSchema(BadRequestErrorResponse,{
  //         description: "Bad Request",
  //         statusCode: 400,
  //     })

  //     async getAuditTrailsByCourseAndVersion(@Param("courseId") courseId: string, @Param("versionId") versionId: string,   @QueryParam("page") page: number = 1, @QueryParam("limit") limit: number = 10, @QueryParam("startDate") startDate?: string, @QueryParam("endDate") endDate?: string, ){
  //         const {data, totalDocuments} = await this.auditTrailsService.getAuditTrailsByCourseAndVersion(courseId, versionId, page, limit, startDate, endDate);
  //          return {
  //     message: "Audit trails retrieved successfully",
  //     data,
  //     totalDocuments,
  //     totalPages: Math.ceil(totalDocuments / limit),
  //     currentPage: page,
  //   };
  //     }

  @OpenAPI({
    summary: 'Get all audit trails',
    description: 'Retrieve a list of all audit trails in the system',
  })
  @Authorized()
  @Get('/moderator')
  @HttpCode(200)
  @ResponseSchema(AuditTrailsResponse, {
    description: 'List of audit trails',
    statusCode: 200,
  })
  @ResponseSchema(BadRequestErrorResponse, {
    description: 'Bad Request',
    statusCode: 400,
  })
  async getAuditTrailsByModeratorId(
    @CurrentUser() user: any,
    @QueryParam('page') page: number = 1,
    @QueryParam('limit') limit: number = 10,
    @QueryParam('start') startDate?: string,
    @QueryParam('end') endDate?: string,
  ) {
    const auditTrails =
      await this.auditTrailsService.getAuditTrailsByModeratorId(
        user.id,
        page,
        limit,
        startDate,
        endDate,
      );

    return {
      message: 'Audit trails retrieved successfully',
      data: auditTrails.data,
      totalDocuments: auditTrails.totalDocuments,
      totalPages: Math.ceil(auditTrails.totalDocuments / limit),
      currentPage: page,
    };
  }

  @OpenAPI({
    summary: 'Get shift-based audit action counts',
    description: 'Retrieve counts of audit actions for a specific shift',
  })
  @Authorized()
  @Get('/shift-based-audit-action-counts')
  @HttpCode(200)
  @ResponseSchema(AuditTrailsShiftReportResponse, {
    description: 'List of audit trails shift-based report',
    statusCode: 200,
  })
  @ResponseSchema(BadRequestErrorResponse, {
    description: 'Bad Request',
    statusCode: 400,
  })
  async getShiftBasedAuditActionCounts(
    @CurrentUser() user: any,
    @QueryParam('startDate') startDate?: string,
    // @QueryParam('endDate') endDate?: string,
    @QueryParam('shift') shift?: string,
    @QueryParam('from') from?: string,
    @QueryParam('to') to?: string,
  ) {
    const actionCounts = await this.auditTrailsService.getShiftBasedAuditActionCounts(
      startDate,
      // endDate,
      shift,
      from ?? '00:00',
      to ?? '23:59'
    );

    return {
      message: 'Shift-based audit action counts retrieved successfully',
      data: actionCounts,
    };
  }

  @OpenAPI({
    summary: 'Get audit trails by question ID',
    description: 'Retrieve all audit trails related to a specific question',
  })
  @Authorized()
  @Get('/question/:questionId')
  @HttpCode(200)
  async getAuditTrailsByQuestionId(
    @Param('questionId') questionId: string,
    @QueryParam('page') page: number = 1,
    @QueryParam('limit') limit: number = 10,
    @QueryParam('action') action?: string | null,
    @QueryParam('order') order: "asc" | "desc" = "desc",
  ) {
    const result = await this.auditTrailsService.getAuditTrailsByQuestionId(
      questionId,
      page,
      limit,
      action,
      order
    );

    return {
      message: 'Audit trails retrieved successfully',
      data: result.data,
      totalDocuments: result.totalDocuments,
      totalPages: Math.ceil(result.totalDocuments / limit),
      currentPage: page,
    };
  }

}

export {AuditTrailsController};
