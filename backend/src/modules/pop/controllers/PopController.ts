import 'reflect-metadata';
import {JsonController, Get, QueryParams, Authorized} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {IPopService, PopLookupResult} from '../interfaces/IPopService.js';

// NOTE: this deliberately does NOT live at '/pop' — '/api/pop' is already claimed by the
// FAQ/POP microservice proxy registered in index.ts (see faqPopConfig.popApiUrl), which
// would otherwise shadow this controller's route entirely.
@OpenAPI({
  tags: ['SourceReference'],
  description: 'Looks up a source against the pop collection (sharable_link) for the Edit Source modal',
})
@injectable()
@JsonController('/source-reference')
export class PopController {
  constructor(
    @inject(CORE_TYPES.PopService)
    private readonly popService: IPopService,
  ) {}

  @OpenAPI({summary: 'Look up a source against the pop collection by sharable_link'})
  @Get('/')
  @Authorized()
  async lookup(
    @QueryParams() query: {source?: string},
  ): Promise<PopLookupResult> {
    if (!query.source) {
      return {found: false};
    }

    return await this.popService.lookupBySource(query.source);
  }
}
