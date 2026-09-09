import 'reflect-metadata';
import {JsonController, Post, Patch, Param, Body, Authorized, CurrentUser} from 'routing-controllers';
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
}
