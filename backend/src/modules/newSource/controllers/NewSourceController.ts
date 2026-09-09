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
import {INewSource, INewSourceItem, IUser} from '#root/shared/interfaces/models.js';
import {INewSourceService} from '../interfaces/INewSourceService.js';

// Records source edits made on the Closed Answers page's Edit Source modal into the
// new_sources collection. This deliberately never touches the answers collection.
// Two-phase: 'start' creates the record ('in-progress') the instant the modal opens so
// the editing timer is backed by a real document; 'complete' updates it on save.
@OpenAPI({
  tags: ['NewSource'],
  description: 'Records an edited set of sources for an answer into the new_sources collection',
})
@injectable()
@JsonController('/new-sources')
export class NewSourceController {
  constructor(
    @inject(CORE_TYPES.NewSourceService)
    private readonly newSourceService: INewSourceService,
  ) {}

  @OpenAPI({summary: 'Start a new_sources record when the Edit Source modal opens'})
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
    });
  }

  @OpenAPI({summary: 'Complete a new_sources record when the edit is saved'})
  @Patch('/:id')
  @Authorized()
  async complete(
    @Param('id') id: string,
    @Body() body: {sources: INewSourceItem[]; timeTaken: number},
  ): Promise<INewSource> {
    return await this.newSourceService.completeNewSource({id, ...body});
  }

  @OpenAPI({summary: 'Record when the Edit Source modal closed, completed or not'})
  @Patch('/:id/close')
  @Authorized()
  async close(@Param('id') id: string): Promise<INewSource> {
    return await this.newSourceService.closeNewSource(id);
  }

  @OpenAPI({summary: "Find the current user's other in-progress new_sources record, if any"})
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

  @OpenAPI({summary: "Read-only lookup of an answer's new_sources record, for the moderator before/after view"})
  @Get('/by-answer/:answerId')
  @Authorized()
  async getByAnswerId(@Param('answerId') answerId: string): Promise<INewSource | null> {
    return await this.newSourceService.getByAnswerId(answerId);
  }

  @OpenAPI({summary: "Admin/moderator override of a record's status to 'pending' or 'merged', with a mandatory reason"})
  @Patch('/:id/status')
  @Authorized()
  async changeStatus(
    @Param('id') id: string,
    @Body() body: {status: 'pending' | 'merged'; reason: string},
    @CurrentUser() user: IUser,
  ): Promise<INewSource> {
    if (user.role !== 'admin' && user.role !== 'moderator') {
      throw new ForbiddenError('Only admins and moderators can change this status');
    }

    const changedByName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    return await this.newSourceService.changeStatus({
      id,
      ...body,
      changedBy: user._id?.toString() ?? '',
      changedByName,
    });
  }
}
