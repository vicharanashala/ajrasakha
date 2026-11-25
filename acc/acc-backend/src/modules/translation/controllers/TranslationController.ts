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
import { TranslationService } from '../services/TranslationService.js';

@OpenAPI({
  tags: ['translation'],
  description: 'Operations for text translation',
})
@injectable()
@JsonController('/translate')
export class TranslationController {
  constructor(
    @inject(Symbol.for('TranslationService'))
    private readonly translationService: TranslationService,
  ) {}

  @Post('/')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Translate text via Sarvam AI' })
  async translate(
    @Body() body: { text: string; targetLang: string; sourceLang?: string },
  ): Promise<{ translated_text: string }> {
    const { text, targetLang, sourceLang } = body;
    return this.translationService.translate(text, targetLang, sourceLang);
  }
}
