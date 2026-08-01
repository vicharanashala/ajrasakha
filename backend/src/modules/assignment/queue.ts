import { injectable, inject } from 'inversify';
import { IAssignmentRepository } from './repository/IAssignmentRepository.js';
import { AssignmentPriority, IAssignment, PRIORITY_ORDER } from './types.js';

/**
 * Manages the three priority queues (high, medium, low).
 *
 * Items enter the queue when they can't be immediately assigned due to
 * capacity. They are dequeued in priority order when capacity becomes
 * available (via requeueOnCapacity).
 */
@injectable()
export class QueueService {
  constructor(
    @inject('AssignmentRepository')
    private readonly repo: IAssignmentRepository,
  ) {}

  /**
   * Add a question to the queue at its priority level.
   */
  async enqueue(
    questionId: string,
    priority: AssignmentPriority,
    expertId: string,
  ): Promise<IAssignment> {
    // Check if already queued
    const existing = await this.repo.findByQuestionId(questionId);
    const alreadyQueued = existing.find(a => a.status === 'queued');
    if (alreadyQueued) return alreadyQueued;

    return this.repo.create({
      questionId,
      expertId,
      priority,
      status: 'queued',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * Remove the next item from the queue for the given priority.
   * Returns null if the queue is empty.
   */
  async dequeue(
    priority: AssignmentPriority,
  ): Promise<IAssignment | null> {
    const items = await this.repo.findQueuedByPriority(priority);
    if (items.length === 0) return null;

    // Sort by createdAt ascending (FIFO within priority)
    items.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const item = items[0]!;
    if (item._id) {
      await this.repo.delete(item._id);
    }
    return item;
  }

  /**
   * Peek at the next item in the queue for a priority without removing it.
   */
  async peek(priority: AssignmentPriority): Promise<IAssignment | null> {
    const items = await this.repo.findQueuedByPriority(priority);
    if (items.length === 0) return null;

    items.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return items[0]!;
  }

  /**
   * Return the number of queued items for a given priority.
   */
  async getQueueLength(priority: AssignmentPriority): Promise<number> {
    const items = await this.repo.findQueuedByPriority(priority);
    return items.length;
  }

  /**
   * Return queue lengths for all three priority levels.
   */
  async getAllQueueLengths(): Promise<Record<AssignmentPriority, number>> {
    const [high, medium, low] = await Promise.all([
      this.getQueueLength('high'),
      this.getQueueLength('medium'),
      this.getQueueLength('low'),
    ]);
    return { high, medium, low };
  }

  /**
   * Requeue a previously dequeued item (when it still couldn't be assigned).
   * Called by AssignmentEngine.assign() after a failed capacity check.
   */
  async requeue(assignmentId: string): Promise<IAssignment> {
    return this.repo.updateStatus(assignmentId, 'queued');
  }

  /**
   * Get all queued assignments for an expert.
   */
  async getQueuedForExpert(expertId: string): Promise<IAssignment[]> {
    return this.repo.findQueuedByExpertId(expertId);
  }
}