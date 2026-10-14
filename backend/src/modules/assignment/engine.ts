import { injectable, inject } from 'inversify';
import { IAssignmentRepository } from './repository/IAssignmentRepository.js';
import { ExpertCapacityService } from './capacity.js';
import { FreezeService } from './freeze.js';
import { QueueService } from './queue.js';
import {
  AssignmentPriority,
  IAssignment,
  toAssignmentPriority,
} from './types.js';
import { IQuestionPriority } from '#root/shared/interfaces/models.js';

/**
 * Core assignment engine. Handles:
 *   - assign(questionId, priority) → picks best expert, enforces capacity + freeze rules
 *   - autoAssignFromQueue()         → tops up available capacity from the queue
 *   - reassign(assignmentId, newExpertId)
 *   - removeAssignment(assignmentId)
 */
@injectable()
export class AssignmentEngine {
  constructor(
    @inject('AssignmentRepository')
    private readonly repo: IAssignmentRepository,
    private readonly capacity: ExpertCapacityService,
    private readonly freeze: FreezeService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Assign a question to the best available expert.
   *
   * If the question is already assigned (active), returns the existing assignment.
   * If no expert has capacity, the question is queued.
   * When assigned and the priority is high, lower-priority active assignments
   * of the same expert are frozen.
   *
   * @returns The resulting assignment (active or queued)
   */
  async assign(
    questionId: string,
    priority: AssignmentPriority | IQuestionPriority,
  ): Promise<IAssignment> {
    const p = toAssignmentPriority(priority as IQuestionPriority);

    // Idempotency: return existing active assignment if any
    const existingActive = await this.repo.findByQuestionId(questionId);
    const currentActive = existingActive.find(a => a.status === 'active');
    if (currentActive) return currentActive;

    // Try to find an available expert
    const expertId = await this.pickExpert(p);
    if (!expertId) {
      // No capacity → queue for the least-loaded expert
      const fallback = await this.pickLeastLoadedExpert(p);
      if (!fallback) throw new Error('No experts registered in the system');
      return this.queue.enqueue(questionId, p, fallback);
    }

    // Create the active assignment
    const assignment = await this.repo.create({
      questionId,
      expertId,
      priority: p,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // If high-priority: freeze lower-priority active work for this expert
    if (p === 'high') {
      await this.freeze.freezeLowerPriority(assignment._id!);
    }

    return assignment;
  }

  /**
   * Try to assign queued questions to any expert that now has capacity.
   * Called after an assignment is completed or removed.
   */
  async autoAssignFromQueue(): Promise<IAssignment[]> {
    const assigned: IAssignment[] = [];

    // Process queues in strict priority order
    for (const p of (['high', 'medium', 'low'] as AssignmentPriority[])) {
      let item = await this.queue.peek(p);
      while (item) {
        const can = await this.capacity.canAssign(item.expertId, p);
        if (can) {
          // Dequeue and activate
          await this.queue.dequeue(p);
          const activated = await this.repo.updateStatus(item._id!, 'active');
          assigned.push(activated);

          // If high, freeze lower-priority work
          if (p === 'high') {
            await this.freeze.freezeLowerPriority(activated._id!);
          }
        } else {
          // Try next expert (move to next queued item for this priority)
          break;
        }
        item = await this.queue.peek(p);
      }
    }

    return assigned;
  }

  /**
   * Move an assignment from one expert to another.
   * Handles freeze/unfreeze of the affected experts.
   */
  async reassign(
    assignmentId: string,
    newExpertId: string,
  ): Promise<IAssignment> {
    const assignment = await this.repo.findById(assignmentId);
    if (!assignment) throw new Error(`Assignment ${assignmentId} not found`);
    if (assignment.status === 'completed')
      throw new Error('Cannot reassign a completed assignment');

    const oldExpertId = assignment.expertId;

    // Check capacity at destination
    if (!(await this.capacity.canAssign(newExpertId, assignment.priority))) {
      throw new Error(
        `Expert ${newExpertId} has no available slot for priority ${assignment.priority}`,
      );
    }

    // If this is high priority, unfreeze old expert's lower-priority work
    if (assignment.priority === 'high' && oldExpertId !== newExpertId) {
      await this.freeze.unfreezeQueued(oldExpertId);
    }

    // If the new expert has a high-priority assignment, freeze lower work
    if (assignment.priority !== 'high') {
      const newExpertHighActive =
        await this.repo.findActiveByExpertId(newExpertId);
      if (newExpertHighActive.some(a => a.priority === 'high')) {
        await this.freeze.manualFreeze(assignmentId, 'high_priority_occupies_slot');
        return this.repo.findById(assignmentId) as Promise<IAssignment>;
      }
    }

    // Update expertId
    const col = await (this.repo as any).collection?.() ??
      (this.repo as MongoAssignmentRepositoryLike).collection?.();
    // Use the repository update method directly
    const updated = await this.repo.updateStatus(assignmentId, assignment.status);
    // Note: in a real impl we'd have a updateExpertId method; for now
    // we rely on the caller to use a dedicated method on AssignmentService.
    // We do a raw update via repo's internal collection access:
    const repoAny = this.repo as any;
    if (repoAny.collection) {
      const col = await repoAny.collection();
      await col.updateOne(
        { _id: require('mongodb').ObjectId.createFromHexString(assignmentId) },
        { $set: { expertId: newExpertId, updatedAt: new Date() } },
      );
    }

    return this.repo.findById(assignmentId) as Promise<IAssignment>;
  }

  /**
   * Remove an assignment entirely (e.g. question closed without answer).
   * If it was active high, trigger unfreeze for that expert.
   */
  async removeAssignment(assignmentId: string): Promise<void> {
    const assignment = await this.repo.findById(assignmentId);
    if (!assignment) return;

    const wasHighAndActive =
      assignment.priority === 'high' && assignment.status === 'active';

    if (assignment.status !== 'completed') {
      await this.repo.delete(assignmentId);
    }

    if (wasHighAndActive) {
      await this.freeze.unfreezeQueued(assignment.expertId);
      await this.autoAssignFromQueue();
    }
  }

  /**
   * Complete an assignment and trigger unfreeze + queue processing.
   */
  async completeAssignment(assignmentId: string): Promise<IAssignment> {
    const assignment = await this.repo.findById(assignmentId);
    if (!assignment) throw new Error(`Assignment ${assignmentId} not found`);

    const wasHighAndActive =
      assignment.priority === 'high' && assignment.status === 'active';

    const completed = await this.repo.complete(assignmentId);

    if (wasHighAndActive) {
      await this.freeze.unfreezeQueued(assignment.expertId);
      await this.autoAssignFromQueue();
    }

    return completed;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Pick the best expert with a free slot for the given priority. */
  private async pickExpert(
    priority: AssignmentPriority,
  ): Promise<string | null> {
    const ids = await this.repo.getDistinctExpertIds();
    for (const id of ids) {
      if (await this.capacity.canAssign(id, priority)) {
        return id;
      }
    }
    return null;
  }

  /** Pick the expert with the fewest active assignments (for queuing fallback). */
  private async pickLeastLoadedExpert(
    priority: AssignmentPriority,
  ): Promise<string | null> {
    const ids = await this.repo.getDistinctExpertIds();
    let best: { id: string; count: number } | null = null;
    for (const id of ids) {
      const count = await this.repo.countActiveByExpertId(id);
      if (!best || count < best.count) {
        // Verify they at least have a slot for this priority
        if (await this.capacity.canAssign(id, priority)) {
          best = { id, count };
        }
      }
    }
    return best?.id ?? null;
  }
}

// Type helper for reassign's raw update — avoids importing mongo directly here
interface MongoAssignmentRepositoryLike {
  collection?: () => Promise<any>;
}