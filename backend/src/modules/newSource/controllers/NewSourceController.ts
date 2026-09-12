import 'reflect-metadata';
import {
  JsonController,
  Post,
  Patch,
  Get,
  Param,
  Body,
  QueryParams,
  Authorized,
  CurrentUser,
  ForbiddenError,
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {
  INewSource,
  INewSourceItem,
  IUser,
  PopRequiredField,
} from '#root/shared/interfaces/models.js';
import {INewSourceService} from '../interfaces/INewSourceService.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import {
  AuditCategory,
  AuditAction,
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import { roleAuditActor } from '#root/modules/question/controllers/helpers/questionAuditHelper.js';
// updated_sources collection. This deliberately never touches the answers collection.
// Two-phase: 'start' creates the record ('in-progress') the instant the modal opens so
// the editing timer is backed by a real document; 'complete' updates it on save.
@OpenAPI({
  tags: ['NewSource'],
  description: 'Records an edited set of sources for an answer into the updated_sources collection',
})
@injectable()
@JsonController('/new-sources')
export class NewSourceController {
  constructor(
    @inject(CORE_TYPES.NewSourceService)
    private readonly newSourceService: INewSourceService,
    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  @OpenAPI({summary: 'Start a updated_sources record when the Edit Source modal opens'})
  @Post('/')
  @Authorized()
  async start(
    @Body() body: {answerId: string; questionId: string},
    @CurrentUser() user: IUser,
  ): Promise<INewSource> {
    const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    return await this.newSourceService.startNewSource({
      ...body,
      userId: user._id?.toString() ?? '',
      userName,
      role: user.role,
    });
  }

  @OpenAPI({summary: 'Complete a updated_sources record when the edit is saved'})
  @Patch('/:id')
  @Authorized()
  async complete(
    @Param('id') id: string,
    @Body() body: {sources: INewSourceItem[]},
    @CurrentUser() user: IUser,
  ): Promise<INewSource> {
    const auditPayload = {
      category: AuditCategory.ANSWER,
      action: AuditAction.NEW_SOURCE_COMPLETE,
      actor: roleAuditActor(user),
      context: { newSourceId: id },
      changes: { after: { sources: body.sources } },
      createdAt: new Date(),
    };
    try {
      const response = await this.newSourceService.completeNewSource({
        id,
        ...body,
        userId: user._id?.toString() ?? '',
        role: user.role,
      });
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return response;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorMessage: err?.message,
        },
      });
      throw err;
    }
  }

  @OpenAPI({summary: 'Record when the Edit Source modal closed, completed or not'})
  @Patch('/:id/close')
  @Authorized()
  async close(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
  ): Promise<INewSource> {
    return await this.newSourceService.closeNewSource(id, user._id?.toString() ?? '');
  }

  @OpenAPI({
    summary:
      'Log an incomplete pop document, and the values filled in for it, against the current reviewer\'s stint',
  })
  @Patch('/by-answer/:answerId/missing-fields')
  @Authorized()
  async recordMissingPopDocument(
    @Param('answerId') answerId: string,
    @Body()
    body: {
      popId: string;
      missingFields: PopRequiredField[];
      updatedFields?: Partial<Record<PopRequiredField, string>>;
    },
    @CurrentUser() user: IUser,
  ): Promise<INewSource> {
    const auditPayload = {
      category: AuditCategory.ANSWER,
      action: AuditAction.RECORD_MISSING_POP_DOCUMENT,
      actor: roleAuditActor(user),
      context: { answerId, popId: body.popId },
      changes: { after: { missingFields: body.missingFields, updatedFields: body.updatedFields } },
      createdAt: new Date(),
    };
    try {
      const response = await this.newSourceService.recordMissingPopDocument({
        answerId,
        popId: body.popId,
        missingFields: body.missingFields ?? [],
        updatedFields: body.updatedFields,
        userId: user._id?.toString() ?? '',
      });
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        context: { ...auditPayload.context, newSourceId: response._id },
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return response;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorMessage: err?.message,
        },
      });
      throw err;
    }
  }

  @OpenAPI({summary: "Find the current user's other in-progress updated_sources record, if any"})
  @Get('/active')
  @Authorized()
  async findActive(
    @QueryParams() query: {excludeAnswerId: string},
    @CurrentUser() user: IUser,
  ): Promise<INewSource | null> {
    return await this.newSourceService.findActiveInProgress(
      user._id?.toString() ?? '',
      query.excludeAnswerId,
    );
  }

  @OpenAPI({summary: 'Release an in-progress record back to pending for other experts to pick up'})
  @Patch('/:id/release')
  @Authorized()
  async release(@Param('id') id: string): Promise<INewSource> {
    return await this.newSourceService.releaseToPending(id);
  }

  @OpenAPI({
    summary:
      'Take an answer into moderator review, hiding it from other moderators until acted on',
  })
  @Post('/moderator-review')
  @Authorized()
  async startModeratorReview(
    @Body() body: {answerId: string; questionId: string},
    @CurrentUser() user: IUser,
  ): Promise<INewSource> {
    const userName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    const auditPayload = {
      category: AuditCategory.ANSWER,
      action: AuditAction.MODERATOR_REVIEW_START,
      actor: roleAuditActor(user),
      context: { answerId: body.answerId, questionId: body.questionId },
      createdAt: new Date(),
    };
    try {
      const response = await this.newSourceService.startModeratorReview({
        ...body,
        userId: user._id?.toString() ?? '',
        userName,
      });
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        context: { ...auditPayload.context, newSourceId: response._id },
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return response;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorMessage: err?.message,
        },
      });
      throw err;
    }
  }

  @OpenAPI({
    summary: "Find the moderator's other answer held in moderator review, if any",
  })
  @Get('/moderator-review/active')
  @Authorized()
  async findActiveModeratorReview(
    @QueryParams() query: {excludeAnswerId: string},
    @CurrentUser() user: IUser,
  ): Promise<INewSource | null> {
    return await this.newSourceService.findActiveModeratorReview(
      user._id?.toString() ?? '',
      query.excludeAnswerId,
    );
  }

  @OpenAPI({
    summary: 'Release a moderator review back to review-completed for other moderators',
  })
  @Patch('/:id/moderator-review/release')
  @Authorized()
  async releaseModeratorReview(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
  ): Promise<INewSource> {
    const userName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    const auditPayload = {
      category: AuditCategory.ANSWER,
      action: AuditAction.MODERATOR_REVIEW_RELEASE,
      actor: roleAuditActor(user),
      context: { newSourceId: id },
      createdAt: new Date(),
    };
    try {
      const response = await this.newSourceService.releaseModeratorReview(
        id,
        user._id?.toString() ?? '',
        userName,
      );
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return response;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorMessage: err?.message,
        },
      });
      throw err;
    }
  }

  @OpenAPI({summary: "Read-only lookup of an answer's updated_sources record, for the moderator before/after view"})
  @Get('/by-answer/:answerId')
  @Authorized()
  async getByAnswerId(@Param('answerId') answerId: string): Promise<INewSource | null> {
    return await this.newSourceService.getByAnswerId(answerId);
  }

  @OpenAPI({summary: "Admin/moderator override of a record's status to 'pending', 'merged' or 'flagged', with a mandatory reason"})
  @Patch('/:id/status')
  @Authorized()
  async changeStatus(
    @Param('id') id: string,
    @Body()
    body: {
      status: 'pending' | 'merged' | 'flagged' | 'review-completed';
      reason: string;
    },
    @CurrentUser() user: IUser,
  ): Promise<INewSource> {
    if (user.role !== 'admin' && user.role !== 'moderator') {
      throw new ForbiddenError('Only admins and moderators can change this status');
    }

    const changedByName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    const auditPayload = {
      category: AuditCategory.ANSWER,
      action: AuditAction.NEW_SOURCE_CHANGE_STATUS,
      actor: roleAuditActor(user),
      context: { newSourceId: id, reason: body.reason },
      changes: { after: { status: body.status } },
      createdAt: new Date(),
    };
    try {
      const response = await this.newSourceService.changeStatus({
        id,
        ...body,
        changedBy: user._id?.toString() ?? '',
        changedByName,
      });
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return response;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorMessage: err?.message,
        },
      });
      throw err;
    }
  }
}
