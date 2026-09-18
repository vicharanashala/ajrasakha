import {IMessage} from '#root/shared/interfaces/models.js';

export interface IMessageRepository {
  createMessage(dealId: string, senderId: string, text: string): Promise<IMessage>;
  getMessagesForDeal(dealId: string): Promise<IMessage[]>;
}
