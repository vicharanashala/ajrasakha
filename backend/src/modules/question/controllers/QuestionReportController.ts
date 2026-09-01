import 'reflect-metadata';
import {
  JsonController,
  Get,
  QueryParams,
  Authorized,
  CurrentUser,
  ContentType,
  Res,
  BadRequestError,
  InternalServerError,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { IUser } from '#root/shared/interfaces/models.js';
import { IQuestionService } from '../interfaces/IQuestionService.js';
import {
  AuditAction,
  AuditCategory,
  ModeratorAuditTrail,
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { roleAuditActor } from './helpers/questionAuditHelper.js';

@OpenAPI({
  tags: ['questions'],
  description: 'Operations for downloading questions Excel reports',
})
@injectable()
@JsonController('/questions')
export class QuestionReportController {
  constructor(
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: IQuestionService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  @Get('/download-question-report')
  @Authorized()
  @ContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @OpenAPI({ summary: 'Download question report as Excel' })
  async downloadQuestionReport(
    @QueryParams()
    query: {
      consecutiveApprovals?: string;
      startDate?: string;
      endDate?: string;
    },
    @CurrentUser() user: IUser,
    @Res() response: any,
  ) {
    const consecutiveApprovals = query.consecutiveApprovals
      ? parseInt(query.consecutiveApprovals, 10)
      : undefined;

    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    let data;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.DOWNLOAD_REPORTS,
      action: AuditAction.DOWNLOAD,
      actor: roleAuditActor(user),
      context: {
        startDate: startDate,
        endDate: endDate,
        endPoint: 'downloadQuestionReport',
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      const isAdmin = user.role === 'admin';
      data = await this.questionService.generateQuestionReport(
        consecutiveApprovals,
        startDate,
        endDate,
        user.isTrainingUser ?? false,
        isAdmin ?? false,
      );
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to generate question report',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to generate question report',
      );
    }
    this.auditTrailsService.createAuditTrail(auditPayload);

    if (!data) {
      response.status(200).json({
        success: false,
        message: 'No data found for the selected filters',
      });
      return;
    }

    return Buffer.from(data as ArrayBuffer);
  }

  @Get('/download-tat-report')
  @Authorized()
  @ContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @OpenAPI({ summary: 'Download TAT (turnaround-time) lifecycle report as Excel' })
  async downloadTatReport(
    @QueryParams()
    query: {
      startDate?: string;
      endDate?: string;
      sources?: string;
      statuses?: string;
    },
    @CurrentUser() user: IUser,
    @Res() response: any,
  ) {
    if (!query.startDate || !query.endDate) {
      throw new BadRequestError('startDate and endDate are required');
    }
    const startDate = new Date(`${query.startDate}T00:00:00.000+05:30`);
    const endDate = new Date(`${query.endDate}T23:59:59.999+05:30`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestError('Invalid startDate/endDate. Use YYYY-MM-DD.');
    }
    const csv = (v?: string) =>
      v
        ? v
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : undefined;
    const sources = csv(query.sources);
    const statuses = csv(query.statuses);

    let data;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.DOWNLOAD_REPORTS,
      action: AuditAction.DOWNLOAD,
      actor: roleAuditActor(user),
      context: {
        startDate,
        endDate,
        endPoint: 'downloadTatReport',
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      data = await this.questionService.generateTatReport(startDate, endDate, {
        sources,
        statuses,
      });
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to generate TAT report',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to generate TAT report');
    }
    this.auditTrailsService.createAuditTrail(auditPayload);

    if (!data) {
      response.status(200).json({
        success: false,
        message: 'No questions found for the selected date range',
      });
      return;
    }

    return Buffer.from(data as ArrayBuffer);
  }

  @Get('/download-overall-report')
  @Authorized()
  @ContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @OpenAPI({ summary: 'Download overall questions report by month as Excel' })
  async downloadOverallReport(
    @QueryParams() query: { startDate?: string; endDate?: string },
    @CurrentUser() user: IUser,
    @Res() response: any,
  ) {
    const isAdmin = user.role === 'admin';
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    let data;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.DOWNLOAD_REPORTS,
      action: AuditAction.DOWNLOAD,
      actor: roleAuditActor(user),
      context: {
        startDate: startDate,
        endDate: endDate,
        endPoint: 'downloadOverallReport',
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      data = await this.questionService.generateOverallQuestionReport(
        startDate,
        endDate,
        user.isTrainingUser ?? false,
        isAdmin ?? false,
      );
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to generate overall report',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to generate overall report',
      );
    }
    this.auditTrailsService.createAuditTrail(auditPayload);

    if (!data) {
      response.status(200).json({
        success: false,
        message: 'No data found for the selected filters',
      });
      return;
    }

    return Buffer.from(data);
  }

  @Get('/download-filtered-report')
  @Authorized()
  @ContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @OpenAPI({ summary: 'Download filtered questions report as Excel' })
  async downloadFilteredReport(
    @QueryParams()
    query: {
      state?: string;
      crop?: string;
      normalised_crop?: string;
      season?: string;
      domain?: string;
      status?: string;
      source?: string;
      hiddenQuestions?: string;
      duplicateQuestions?: string;
      startDate?: string;
      endDate?: string;
      allUsers?: string;
    },
    @CurrentUser() user: IUser,
    @Res() response: any,
  ) {
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.DOWNLOAD_REPORTS,
      action: AuditAction.DOWNLOAD,
      actor: roleAuditActor(user),
      context: {
        filters: query,
        endPoint: 'downloadFilteredReport',
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    let data;
    try {
      data = await this.questionService.generateStateCropQuestionReport({
        state: query.state,
        crop: query.crop,
        normalised_crop: query.normalised_crop,
        season: query.season,
        domain: query.domain,
        status: query.status,
        source: query.source,
        hiddenQuestions: query.hiddenQuestions,
        duplicateQuestions: query.duplicateQuestions,
        startDate: query.startDate,
        endDate: query.endDate,
        allUsers: query.allUsers,
      });
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage:
            err?.message || 'Failed to generate filtered question report',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to generate filtered question report',
      );
    }

    this.auditTrailsService.createAuditTrail(auditPayload);
    if (!data) {
      response.status(200).json({
        success: false,
        message: 'No questions found for the selected filters',
      });
      return;
    }

    return Buffer.from(data);
  }

  @Get('/download-duplicate-questions-report')
  @Authorized()
  @ContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @OpenAPI({ summary: 'Download duplicate questions report as Excel' })
  async downloadDuplicateReport(
    @QueryParams() query: { startDate?: string; endDate?: string },
    @CurrentUser() user: IUser,
    @Res() response: any,
  ) {
    const isAdmin = user.role === 'admin';
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.DOWNLOAD_REPORTS,
      action: AuditAction.DOWNLOAD,
      actor: roleAuditActor(user),
      context: { startDate, endDate, endPoint: 'downloadDuplicateReport' },
      createdAt: new Date(),
    };
    try {
      const data =
        await this.questionService.generateDuplicateQuestionReport(
          startDate,
          endDate,
          user.isTrainingUser ?? false,
          isAdmin ?? false,
        );
      if (!data) {
        this.auditTrailsService.createAuditTrail({
          ...auditPayload,
          outcome: { status: OutComeStatus.SUCCESS },
          changes: { after: { result: 'No duplicate questions found' } },
        });
        response.status(200).json({
          success: false,
          message: 'No duplicate questions found for the selected date range',
        });
        return;
      }
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return Buffer.from(data);
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to download duplicate report',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      throw err;
    }
  }
}
