import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Body,
  HttpCode,
  Params,
  Authorized,
  CurrentUser,
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IUser, IMessage} from '#root/shared/interfaces/models.js';
import {DealMessagesParam, CreateMessageDto} from '../classes/validators/MessageValidators.js';
import {IMessageService} from '../interfaces/IMessageService.js';

@OpenAPI({
  tags: ['marketplace'],
  description: 'Chat messages between buyer and farmer within a deal',
})
@injectable()
@JsonController('/marketplace/deals')
export class MessageController {
  constructor(
    @inject(GLOBAL_TYPES.MessageService)
    private readonly messageService: IMessageService,
  ) {}

  @Get('/:dealId/messages')
  @HttpCode(200)
  @Authorized()
  async getMessages(
    @Params() params: DealMessagesParam,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; data: IMessage[]}> {
    const messages = await this.messageService.getMessages(params.dealId, user._id.toString());
    return {success: true, data: messages};
  }

  @Post('/:dealId/messages')
  @HttpCode(201)
  @Authorized()
  async sendMessage(
    @Params() params: DealMessagesParam,
    @Body() body: CreateMessageDto,
    @CurrentUser() user: IUser,
  ): Promise<{success: boolean; data: IMessage}> {
    const message = await this.messageService.sendMessage(
      params.dealId,
      user._id.toString(),
      body.text,
    );
    return {success: true, data: message};
  }
}
