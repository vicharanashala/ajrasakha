import { ObjectId } from 'mongodb';
import { IWaitingQueueEntry, WaitingQueueStatus } from '#root/shared/interfaces/models.js';

export interface IWaitingQueueRepository {
  /** Insert a new entry into the waiting queue. */
  enqueue(entry: Omit<IWaitingQueueEntry, '_id'>): Promise<IWaitingQueueEntry>;

  /** Get all waiting entries for a given priority, ordered by enqueuedAt ascending. */
  getWaitingByPriority(priority: 'low' | 'medium' | 'high'): Promise<IWaitingQueueEntry[]>;

  /** Update the status of a queue entry (e.g., 'waiting' → 'assigned'). */
  updateStatus(id: string, status: WaitingQueueStatus): Promise<void>;

  /** Get the count of waiting entries for a given priority. */
  getCountByPriority(priority: 'low' | 'medium' | 'high'): Promise<number>;

  /** Get all queue entries (waiting + assigned) for dashboard visibility. */
  getAllEntries(): Promise<IWaitingQueueEntry[]>;

  /** Remove an entry from the queue (e.g., when question is deleted). */
  removeByQuestionId(questionId: string): Promise<void>;

  /** Get the oldest waiting entry across all priorities (for processing). */
  getOldestWaiting(): Promise<IWaitingQueueEntry | null>;

  /** Remove all entries for a given question. */
  removeAllByQuestionId(questionId: string): Promise<void>;
}
