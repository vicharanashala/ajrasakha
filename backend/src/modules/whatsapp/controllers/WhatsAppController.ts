import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  HttpCode,
  Param,
  Body,
  Authorized,
  CurrentUser,
  QueryParam,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { WHATSAPP_TYPES } from '../types.js';
import type { IWhatsAppService } from '../interfaces/IWhatsAppService.js';
import { IUser } from '#root/shared/index.js';
import { WhatsappUsers } from '#root/utils/dummyWhatsAppUsers.js';

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
  ) { }

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
  @Get('/threads/:threadId/:date')
  @HttpCode(200)
  @Authorized()
  async getThreadDetails(
    @Param('threadId') threadId: string,
    @Param('date') date: string,
  ) {
    return this.whatsappService.getThreadDetails(
      threadId,
      date,
    );
  }

  @OpenAPI({
    summary: 'Send a WhatsApp message',
    description: 'Sends a direct WhatsApp message to a specific phone number.',
  })
  @Post('/send-message')
  @HttpCode(200)
  @Authorized()
  async sendMessage(@Body() body: { phoneNumber: string; messageText: string }, @CurrentUser() user: IUser) {
    const userId = user._id.toString();
    await this.whatsappService.sendMessage(userId, body.phoneNumber, body.messageText);
    return { success: true, message: 'Message sent successfully' };
  }

  @OpenAPI({
    summary:
      'Fetch dummy inactive whatsapp users',

    description:
      'Fetches the users by mobile numbers who are inactive for more than last 3 days',
  })
  @Get('/inactive-users')
  @HttpCode(200)
  @Authorized()
  async fetxhInactiveUsers(
    @QueryParam('page') page = 1,
    @QueryParam('limit') limit = 5,
  ) {

    const threeDaysAgo =
      Date.now() -
      3 * 24 * 60 * 60 * 1000;

    const inactiveUsers =
      WhatsappUsers.filter(item => {
        return (
          new Date(
            item.lastMessageAt,
          ).getTime() < threeDaysAgo
        );
      });
    const total =
      inactiveUsers.length;
    const start =
      (page - 1) * limit;
    const end =
      start + limit;
    const paginatedUsers =
      inactiveUsers.slice(start, end);
    return {
      users: paginatedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages:
          Math.ceil(total / limit),
        hasNextPage:
          page * limit < total,
        hasPrevPage:
          page > 1,
      },
    };
  }
}
