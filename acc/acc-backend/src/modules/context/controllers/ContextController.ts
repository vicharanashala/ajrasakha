import 'reflect-metadata';
import {
  Post,
  HttpCode,
  Authorized,
  JsonController,
  Body,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { ContextService } from '../services/ContextService.js';

@OpenAPI({
  tags: ['context'],
  description: 'Operations for translation context',
})
@injectable()
@JsonController('/context')
export class ContextController {
  constructor(
    @inject(Symbol.for('ContextService'))
    private readonly contextService: ContextService,
  ) {}

  @Post('/')
  @HttpCode(201)
  @Authorized()
  @OpenAPI({ summary: 'Add a new context' })
  async addContext(
    @Body() body: { transcript: string },
  ): Promise<{ insertedId: string }> {
    return this.contextService.addContext(body.transcript);
  }

  @Post('/translate')
  @HttpCode(200)
  @Authorized()
  async translate(
    @Body() body: { text: string; targetLang: string; sourceLang?: string },
  ): Promise<{ translated_text: string }> {
    const { text, targetLang, sourceLang } = body;
    return this.contextService.translate(text, targetLang, sourceLang);
  }
}
