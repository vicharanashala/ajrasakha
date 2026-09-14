import {injectable, inject} from 'inversify';
import {NotFoundError, ForbiddenError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {IMessage} from '#root/shared/interfaces/models.js';
import {IMessageRepository} from '#root/shared/database/interfaces/IMessageRepository.js';
import {IDealRepository} from '#root/shared/database/interfaces/IDealRepository.js';
import {IMessageService} from '../interfaces/IMessageService.js';

@injectable()
export class MessageService implements IMessageService {
  constructor(
    @inject(GLOBAL_TYPES.MessageRepository)
    private readonly messageRepository: IMessageRepository,

    @inject(GLOBAL_TYPES.DealRepository)
    private readonly dealRepository: IDealRepository,
  ) {}

  private async assertUserIsInDeal(dealId: string, userId: string): Promise<void> {
    const deal = await this.dealRepository.getDealById(dealId);
    if (!deal) {
      throw new NotFoundError(`Deal with id "${dealId}" not found`);
    }
    const isFarmer = deal.farmerId.toString() === userId;
    const isBuyer = deal.buyerId.toString() === userId;
    if (!isFarmer && !isBuyer) {
      throw new ForbiddenError('You are not part of this deal');
    }
  }

  async sendMessage(dealId: string, senderId: string, text: string): Promise<IMessage> {
    await this.assertUserIsInDeal(dealId, senderId);
    return this.messageRepository.createMessage(dealId, senderId, text);
  }

  async getMessages(dealId: string, userId: string): Promise<IMessage[]> {
    await this.assertUserIsInDeal(dealId, userId);
    return this.messageRepository.getMessagesForDeal(dealId);
  }
}
