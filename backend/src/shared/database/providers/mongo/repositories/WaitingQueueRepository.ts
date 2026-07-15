import { IWaitingQueueRepository } from '#root/shared/database/interfaces/IWaitingQueueRepository.js';
import {
  IWaitingQueueEntry,
  WaitingQueueStatus,
} from '#root/shared/interfaces/models.js';
import { Collection, ObjectId } from 'mongodb';
import { MongoDatabase } from '../MongoDatabase.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject } from 'inversify';
import { InternalServerError } from 'routing-controllers';

export class WaitingQueueRepository implements IWaitingQueueRepository {
  private collection: Collection<IWaitingQueueEntry>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    if (!this.collection) {
      this.collection = await this.db.getCollection<IWaitingQueueEntry>('waiting_queue');
    }
  }

  async enqueue(entry: Omit<IWaitingQueueEntry, '_id'>): Promise<IWaitingQueueEntry> {
    try {
      await this.init();
      const result = await this.collection.insertOne(entry as IWaitingQueueEntry);
      return { ...entry, _id: result.insertedId } as IWaitingQueueEntry;
    } catch (error) {
      throw new InternalServerError(`Failed to enqueue waiting question: ${error}`);
    }
  }

  async getWaitingByPriority(priority: 'low' | 'medium' | 'high'): Promise<IWaitingQueueEntry[]> {
    try {
      await this.init();
      return this.collection
        .find({ priority, status: 'waiting' })
        .sort({ enqueuedAt: 1 })
        .toArray();
    } catch (error) {
      throw new InternalServerError(`Failed to get waiting queue by priority: ${error}`);
    }
  }

  async updateStatus(id: string, status: WaitingQueueStatus): Promise<void> {
    try {
      await this.init();
      await this.collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } },
      );
    } catch (error) {
      throw new InternalServerError(`Failed to update queue status: ${error}`);
    }
  }

  async getCountByPriority(priority: 'low' | 'medium' | 'high'): Promise<number> {
    try {
      await this.init();
      return this.collection.countDocuments({ priority, status: 'waiting' });
    } catch (error) {
      throw new InternalServerError(`Failed to get queue count: ${error}`);
    }
  }

  async getAllEntries(): Promise<IWaitingQueueEntry[]> {
    try {
      await this.init();
      return this.collection.find().sort({ enqueuedAt: 1 }).toArray();
    } catch (error) {
      throw new InternalServerError(`Failed to get all queue entries: ${error}`);
    }
  }

  async removeByQuestionId(questionId: string): Promise<void> {
    try {
      await this.init();
      await this.collection.deleteOne({ questionId: new ObjectId(questionId) });
    } catch (error) {
      throw new InternalServerError(`Failed to remove queue entry: ${error}`);
    }
  }

  async getOldestWaiting(): Promise<IWaitingQueueEntry | null> {
    try {
      await this.init();
      return this.collection.findOne(
        { status: 'waiting' },
        { sort: { enqueuedAt: 1 } },
      );
    } catch (error) {
      throw new InternalServerError(`Failed to get oldest waiting entry: ${error}`);
    }
  }

  async removeAllByQuestionId(questionId: string): Promise<void> {
    try {
      await this.init();
      await this.collection.deleteMany({ questionId: new ObjectId(questionId) });
    } catch (error) {
      throw new InternalServerError(`Failed to remove all queue entries for question: ${error}`);
    }
  }
}
