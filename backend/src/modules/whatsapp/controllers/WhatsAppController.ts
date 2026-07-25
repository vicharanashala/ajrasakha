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
  UseBefore,
} from 'routing-controllers';
import { urlencoded } from 'express';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { WHATSAPP_TYPES } from '../types.js';
import type { IWhatsAppService } from '../interfaces/IWhatsAppService.js';
import { IUser } from '#root/shared/index.js';
import { verifyNotTester } from '#root/shared/functions/verifyNotTester.js';
import { WhatsappUsers } from '#root/utils/dummyWhatsAppUsers.js';
import { FarmerFeedbackService } from '#root/modules/feedback/index.js';

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
    @inject(FarmerFeedbackService)
    private readonly farmerFeedbackService: FarmerFeedbackService,
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

  @OpenAPI({
    summary: 'WhatsApp Incoming Webhook',
    description: 'Intercepts incoming messages from active farmer sessions. If a farmer replies 1 (Yes) or 2 (No) to a feedback prompt, records the telemetry in FarmerFeedbackService.',
  })
  @Post('/webhook')
  @HttpCode(200)
  @UseBefore(urlencoded({ extended: true }))
  async handleIncomingWebhook(
    @Body() body: any,
  ) {
    console.log('[WhatsAppController] Received incoming webhook:', body);

    const text = (body.reply || body.text || body.Body || body.message || '').toString().trim();
    const phoneNumber = body.phoneNumber || body.From || body.fromNumber || body.from || '';
    const gdbEntryId = body.gdbEntryId || 'GDB-DEFAULT';

    if (text === '1' || text === '2') {
      console.log(`[WhatsAppController] Intercepted feedback reply "${text}" from ${phoneNumber} for GDB Entry ${gdbEntryId}`);
      const result = await this.farmerFeedbackService.recordFeedback({
        phoneNumber,
        reply: text as '1' | '2',
        gdbEntryId,
        questionId: body.questionId,
        domain: body.domain || 'General',
        language: body.language || 'en',
        state: body.state || 'Unknown',
        userId: body.userId,
      });
      return { success: true, feedbackRecorded: true, data: result };
    }

    return { success: true, feedbackRecorded: false, message: 'Message received and processed' };
  }
}
