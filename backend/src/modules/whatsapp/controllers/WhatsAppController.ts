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
  ForbiddenError,
  HeaderParam,
  UnauthorizedError,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { WHATSAPP_TYPES } from '../types.js';
import type { IWhatsAppService } from '../interfaces/IWhatsAppService.js';
import { IUser } from '#root/shared/index.js';
import { verifyNotTester } from '#root/shared/functions/verifyNotTester.js';
import { WhatsappUsers } from '#root/utils/dummyWhatsAppUsers.js';
import { appConfig } from '#root/config/app.js';
import { FarmerFeedbackCorrelationService } from '../services/FarmerFeedbackCorrelationService.js';

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
    @inject(WHATSAPP_TYPES.FarmerFeedbackCorrelationService)
    private readonly farmerFeedbackCorrelationService: FarmerFeedbackCorrelationService,
  ) { }

  private assertWhatsAppWebhookKey(apiKey?: string): void {
    if (!appConfig.WA_WEBHOOK_API_KEY || apiKey !== appConfig.WA_WEBHOOK_API_KEY) {
      throw new UnauthorizedError('Invalid WhatsApp webhook API key');
    }
  }

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
    description:
      'Retrieves message history for a specific WhatsApp thread from LangGraph.',
  })
  @Get('/threads/:threadId/:date')
  @HttpCode(200)
  @Authorized()
  async getThreadDetails(
    @Param('threadId') threadId: string,
    @Param('date') date: string,
  ) {
    return this.whatsappService.getThreadDetails(threadId, date);
  }

  @OpenAPI({
    summary: 'Send a WhatsApp message',
    description: 'Sends a direct WhatsApp message to a specific phone number.',
  })
  @Post('/send-message')
  @HttpCode(200)
  @Authorized()
  async sendMessage(
    @Body() body: { phoneNumber: string; messageText: string },
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const userId = user._id.toString();
    await this.whatsappService.sendMessage(
      userId,
      body.phoneNumber,
      body.messageText,
    );
    console.log('[WhatsAppController] Message sent successfully');
    return { success: true, message: 'Message sent successfully' };
  }

  @OpenAPI({
    summary: 'Register an answer for farmer feedback',
    description:
      'Stores the GDB identity for a WhatsApp answer before the bot sends its helpfulness prompt. The returned sessionId can be included in interactive button replies.',
  })
  @Post('/feedback/prompts')
  @HttpCode(201)
  async registerFarmerFeedbackPrompt(
    @Body()
    body: {
      phoneNumber: string;
      gdbEntryId: string;
      questionId?: string;
      domain?: string;
      language?: string;
      state?: string;
      expiresInHours?: number;
    },
    @HeaderParam('x-internal-api-key') apiKey?: string,
  ) {
    this.assertWhatsAppWebhookKey(apiKey);
    const session = await this.farmerFeedbackCorrelationService.registerPrompt(body);
    return {
      ...session,
      prompt: 'Was this helpful? Reply 1 for Yes, 2 for No.',
    };
  }

  @OpenAPI({
    summary: 'Record a farmer feedback reply',
    description:
      'Links an incoming WhatsApp reply to its registered answer. Replies are claimed once using the provider message ID; plain-text replies are accepted only when the farmer has exactly one pending prompt.',
  })
  @Post('/feedback/replies')
  @HttpCode(200)
  async recordFarmerFeedbackReply(
    @Body()
    body: {
      phoneNumber: string;
      inboundMessageId: string;
      response: '1' | '2';
      sessionId?: string;
    },
    @HeaderParam('x-internal-api-key') apiKey?: string,
  ) {
    this.assertWhatsAppWebhookKey(apiKey);
    return this.farmerFeedbackCorrelationService.recordReply(body);
  }

  @OpenAPI({
    summary: 'Fetch inactive whatsapp users',
    description:
      'Fetches the users by mobile numbers who are inactive for more than last 3 days',
  })
  @Get('/inactive-users')
  @HttpCode(200)
  @Authorized()
  async fetxhInactiveUsers(
    @QueryParam('page') page = 1,
    @QueryParam('limit') limit = 2,
  ) {
    const skip = (page - 1) * limit;
    const response = await this.whatsappService.getInactiveUsers(skip, limit);
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

    const inactiveUsers = response.data.filter(item => {
      return new Date(item.lastMessageAt).getTime() < threeDaysAgo;
    });

    const total = inactiveUsers.length;

    return {
      users: inactiveUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  @OpenAPI({
    summary: 'Fetch unique whatsapp users',
    description:
      'Fetches the unique users by mobile numbers',
  })
  @Get('/unique-users')
  @HttpCode(200)
  @Authorized()
  async fetchUnqiueWhatsAppUsers(
  ) {

    return await this.whatsappService.getUniqueUsers();
  }

  @OpenAPI({
    summary: 'Fetch all WhatsApp users',
    description:
      'Fetches all WhatsApp users. Falls back to dummy data on failure.',
  })
  @Get('/users')
  @HttpCode(200)
  @Authorized()
  async fetchAllWhatsAppUsers(
  ) {
    try {
      const response = await this.whatsappService.getAllUsers();
      return {
        users: response.data || [],
      };
    } catch (error) {
      console.error('Error fetching all WhatsApp users from service, falling back to empty list:', error);
      return {
        users: [],
      };
    }
  }
}
