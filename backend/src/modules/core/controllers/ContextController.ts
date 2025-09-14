import 'reflect-metadata';
import {
  JsonController,
  Post,
  Body,
  HttpCode,
  CurrentUser,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {ContextService} from '../services/ContextService.js';
import {ContextResponse} from '../classes/validators/ContextValidators.js';
import {IUser} from '#root/shared/index.js';

@OpenAPI({
  tags: ['contexts'],
  description: 'Operations for managing contexts',
})
@injectable()
@ResponseSchema(ContextResponse, {isArray: true, statusCode: 200})
@JsonController('/contexts')
export class ContextController {
  constructor(
    @inject(GLOBAL_TYPES.ContextService)
    private readonly contextService: ContextService,
  ) {}

  @Post('/')
  @HttpCode(201)
  @OpenAPI({summary: 'Add a new context'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async addContext(
    @Body() body: {text: string},
    @CurrentUser() user: IUser,
  ): Promise<{insertedId: string}> {
    const {text} = body;
    const userId = user._id.toString();
    return this.contextService.addContext(userId, text);
  }
}
