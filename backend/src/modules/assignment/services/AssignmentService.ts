import { injectable, inject } from 'inversify';
import { ObjectId } from 'mongodb';
import { IAssignmentRepository } from '../repository/IAssignmentRepository.js';
import { AssignmentEngine } from '../engine.js';
import { ExpertCapacityService } from '../capacity.js';
import { FreezeService } from '../freeze.js';
import {
  AssignmentPriority,
  IAssignment,
  toAssignmentPriority,
} from '../types.js';
import { IQuestionPriority } from '#root/shared/interfaces/models.js';

/**
 * High-level orchestrator that wires the engine to external signals
 * (e.g. question answered, question closed, admin action).
 */
@injectable()
export class AssignmentService {
  constructor(
    @inject('AssignmentRepository')
    private readonly repo: IAssignmentRepository,
    private readonly engine: AssignmentEngine,
    private readonly capacity: ExpertCapacityService,
    private readonly freeze: FreezeService,
  ) {}

  /**
   * Assign (or re-assign) a question to an expert.
   * Convenience wrapper around engine.assign() that accepts IQuestionPriority.
   */
  async assignQuestion(
    questionId: string,
    priority: IQuestionPriority | AssignmentPriority,
    expertId?: string,
  ): Promise<IAssignment> {
    const p = toAssignmentPriority(priority as IQuestionPriority);

    // If caller specified expertId and they have capacity, force-assign to that expert
    if (expertId) {
      const can = await this.capacity.canAssign(expertId, p);
      if (!can) {
        throw new Error(
          `Expert ${expertId} has no available slot for priority ${p}`,
        );
      }
      // Check if question already has an assignment — if so, use reassign
      const existing = await this.repo.findByQuestionId(questionId);
      const activeExisting = existing.find(a => a.status === 'active');
      if (activeExisting?._id) {
        return this.engine.reassign(activeExisting._id, expertId);
      }
      // Create as active
      const assignment = await this.repo.create({
        questionId,
        expertId,
        priority: p,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      if (p === 'high') {
        await this.freeze.freezeLowerPriority(assignment._id!);
      }
      return assignment;
    }

    return this.engine.assign(questionId, p);
  }

  /**
   * Called when a question is answered or closed externally.
   * Completes any active assignment and triggers queue processing.
   */
  async onQuestionCompleted(questionId: string): Promise<void> {
    const assignments = await this.repo.findByQuestionId(questionId);
    const active = assignments.find(a => a.status === 'active');
    if (active?._id) {
      await this.engine.completeAssignment(active._id);
    }
  }

  /**
   * Called when a question is deleted or cancelled.
   * Removes the assignment and processes the queue.
   */
  async onQuestionRemoved(questionId: string): Promise<void> {
    const assignments = await this.repo.findByQuestionId(questionId);
    for (const a of assignments) {
      if (a._id && a.status !== 'completed') {
        await this.engine.removeAssignment(a._id);
      }
    }
  }

  /**
   * Manually reassign an assignment to a different expert.
   */
  async reassignToExpert(
    assignmentId: string,
    newExpertId: string,
  ): Promise<IAssignment> {
    const assignment = await this.repo.findById(assignmentId);
    if (!assignment) throw new Error(`Assignment ${assignmentId} not found`);

    const can = await this.capacity.canAssign(newExpertId, assignment.priority);
    if (!can) {
      throw new Error(
        `Expert ${newExpertId} has no available slot for priority ${assignment.priority}`,
      );
    }

    const oldExpertId = assignment.expertId;

    // If old expert had a high-priority active assignment, unfreeze their work
    if (assignment.priority === 'high' && oldExpertId !== newExpertId) {
      await this.freeze.unfreezeQueued(oldExpertId);
    }

    // Perform the expertId update directly in MongoDB
    const col = await (this.repo as any).collection();
    await col.updateOne(
      { _id: new ObjectId(assignmentId) },
      { $set: { expertId: newExpertId, updatedAt: new Date() } },
    );

    // If new expert has high-priority work, freeze this assignment
    if (assignment.priority !== 'high') {
      const newExpertHighActive = await this.repo.findActiveByExpertId(newExpertId);
      if (newExpertHighActive.some(a => a.priority === 'high')) {
        await this.freeze.manualFreeze(assignmentId, 'high_priority_occupies_slot');
      }
    }

    return (await this.repo.findById(assignmentId))!;
  }

  /**
   * Manually freeze an assignment.
   */
  async freezeAssignment(
    assignmentId: string,
    reason: 'manual_freeze' | 'high_priority_occupies_slot' = 'manual_freeze',
  ): Promise<IAssignment> {
    return this.freeze.manualFreeze(assignmentId, reason);
  }

  /**
   * Manually unfreeze (reactivate) an assignment.
   */
  async unfreezeAssignment(assignmentId: string): Promise<IAssignment> {
    const assignment = await this.repo.findById(assignmentId);
    if (!assignment) throw new Error(`Assignment ${assignmentId} not found`);

    const can = await this.capacity.canAssign(
      assignment.expertId,
      assignment.priority,
    );
    if (!can) {
      throw new Error(
        `Expert ${assignment.expertId} has no available slot to unfreeze priority ${assignment.priority}`,
      );
    }

    return this.freeze.manualUnfreeze(assignmentId);
  }

  /**
   * Process the queue — try to assign queued questions to available experts.
   */
  async processQueue(): Promise<IAssignment[]> {
    return this.engine.autoAssignFromQueue();
  }

  /**
   * Get all assignments for an expert (all statuses).
   */
  async getExpertAssignments(expertId: string): Promise<IAssignment[]> {
    return this.repo.findByExpertId(expertId);
  }

  /**
   * Get active assignments for an expert.
   */
  async getActiveAssignments(expertId: string): Promise<IAssignment[]> {
    return this.repo.findActiveByExpertId(expertId);
  }
}