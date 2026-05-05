import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  HttpCode,
  Param,
  Body,
  Authorized,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { WHATSAPP_TYPES } from '../types.js';
import type { IWhatsAppService } from '../interfaces/IWhatsAppService.js';

@OpenAPI({
  tags: ['whatsapp'],
  description: 'WhatsApp history endpoints',
})
@injectable()
@JsonController('/whatsapp', { transformResponse: false })
export class WhatsAppController {
  constructor(
    @inject(WHATSAPP_TYPES.WhatsAppService)
    private readonly whatsappService: IWhatsAppService,
  ) {}

  @OpenAPI({
    summary: 'Get all WhatsApp threads',
    description: 'Retrieves a list of all WhatsApp threads from LangGraph.',
  })
  @Get('/threads')
  @HttpCode(200)
  @Authorized()
  async getThreads() {
    return this.whatsappService.getThreads();
  }

  @OpenAPI({
    summary: 'Get WhatsApp thread details',
    description: 'Retrieves message history for a specific WhatsApp thread from LangGraph.',
  })
  @Get('/threads/:threadId')
  @HttpCode(200)
  @Authorized()
  async getThreadDetails(@Param('threadId') threadId: string) {
    return this.whatsappService.getThreadDetails(threadId);
  }

  @OpenAPI({
    summary: 'Send a WhatsApp message',
    description: 'Sends a direct WhatsApp message to a specific phone number.',
  })
  @Post('/send-message')
  @HttpCode(200)
  @Authorized()
  async sendMessage(@Body() body: { phoneNumber: string; messageText: string }) {
    await this.whatsappService.sendMessage(body.phoneNumber, body.messageText);
    return { success: true, message: 'Message sent successfully' };
  }
}
