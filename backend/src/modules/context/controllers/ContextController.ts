import 'reflect-metadata';
import {
  JsonController,
  Post,
  Body,
  HttpCode,
  CurrentUser,
  Authorized,
  Req,
  UploadedFile,
  UseBefore,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {IUser} from '#root/shared/index.js';
import multer from 'multer';
import { ContextResponse } from '../classes/validators/ContextValidator.js';
import { ContextService } from '../services/ContextService.js';
import { IContextService } from '../interfaces/IContextService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

@OpenAPI({
  tags: ['contexts'],
  description: 'Operations for managing contexts',
})
@injectable()
@JsonController('/context')
export class ContextController {
  constructor(
    @inject(GLOBAL_TYPES.ContextService)
    private readonly contextService: IContextService,
  ) {}

  @OpenAPI({
    summary: 'Add a new context',
    description: 'Creates a new context from transcript text. Returns the ID of the newly created context.',
  })
  @ResponseSchema(ContextResponse, {
    statusCode: 201,
    description: 'Context created successfully - Returns the inserted context ID',
  })
  @ResponseSchema(BadRequestErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Empty or missing transcript text',
  })
  @ResponseSchema(BadRequestErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(BadRequestErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to create context',
  })
  @Post('/')
  @HttpCode(201)
  @Authorized()
  async addContext(
    @Body() body: {transcript: string},
    @CurrentUser() user: IUser,
  ): Promise<{insertedId: string}> {
    const {transcript} = body;
    const userId = user._id.toString();
    return this.contextService.addContext(userId, transcript);
  }
}
