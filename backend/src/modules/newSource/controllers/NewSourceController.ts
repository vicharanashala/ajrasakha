import 'reflect-metadata';
import {JsonController, Post, Body, Authorized} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {INewSource, INewSourceItem} from '#root/shared/interfaces/models.js';
import {INewSourceService} from '../interfaces/INewSourceService.js';

// Records source edits made on the Closed Answers page's Edit Source modal into the
// new_sources collection. This deliberately never touches the answers collection.
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

  @OpenAPI({summary: 'Create a new_sources record for an answer'})
  @Post('/')
  @Authorized()
  async create(
    @Body() body: {answerId: string; questionId: string; sources: INewSourceItem[]},
  ): Promise<INewSource> {
    return await this.newSourceService.createNewSource(body);
  }
}
