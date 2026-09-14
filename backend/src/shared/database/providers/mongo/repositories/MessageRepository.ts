import {inject, injectable} from 'inversify';
import {Collection, ObjectId} from 'mongodb';
import {InternalServerError} from 'routing-controllers';
import {GLOBAL_TYPES} from '#root/types.js';
import {MongoDatabase} from '#root/shared/index.js';
import {IMessage} from '#root/shared/interfaces/models.js';
import {IMessageRepository} from '#root/shared/database/interfaces/IMessageRepository.js';

@injectable()
export class MessageRepository implements IMessageRepository {
  private MessageCollection: Collection<IMessage>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init(): Promise<void> {
    this.MessageCollection = await this.db.getCollection<IMessage>('marketplace_messages');
    await this.ensureIndexes();
  }

  private async ensureIndexes(): Promise<void> {
    try {
      await this.MessageCollection.createIndex({dealId: 1, createdAt: 1});
    } catch (error) {
      console.error('Failed to create message indexes:', error);
    }
  }

  private static sanitize(message: any): IMessage {
    return {
      ...message,
      _id: message._id?.toString(),
      dealId: message.dealId?.toString(),
      senderId: message.senderId?.toString(),
    } as IMessage;
  }

  async createMessage(dealId: string, senderId: string, text: string): Promise<IMessage> {
    try {
      if (!this.MessageCollection) await this.init();

      const payload: IMessage = {
        dealId: new ObjectId(dealId),
        senderId: new ObjectId(senderId),
        text: text.trim(),
        createdAt: new Date(),
      };

      const {insertedId} = await this.MessageCollection.insertOne(payload as any);

      return MessageRepository.sanitize({...payload, _id: insertedId});
    } catch (error: any) {
      throw new InternalServerError(`Failed to send message: ${error.message}`);
    }
  }

  async getMessagesForDeal(dealId: string): Promise<IMessage[]> {
    try {
      if (!this.MessageCollection) await this.init();

      const messages = await this.MessageCollection
        .find({dealId: new ObjectId(dealId)})
        .sort({createdAt: 1})
        .toArray();

      return messages.map(MessageRepository.sanitize);
    } catch (error: any) {
      throw new InternalServerError(`Failed to fetch messages: ${error.message}`);
    }
  }
}
