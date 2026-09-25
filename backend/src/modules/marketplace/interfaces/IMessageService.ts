import {IMessage} from '#root/shared/interfaces/models.js';

export interface IMessageService {
  sendMessage(dealId: string, senderId: string, text: string): Promise<IMessage>;
  getMessages(dealId: string, userId: string): Promise<IMessage[]>;
}
