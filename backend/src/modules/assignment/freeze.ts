import { injectable, inject } from 'inversify';
import { IAssignmentRepository } from './repository/IAssignmentRepository.js';
import { IAssignment, FrozenReason } from './types.js';

/**
 * Handles freezing (suspending) and unfreezing of assignments.
 *
 * Rule: when a high-priority question is assigned to an expert, any
 * medium-priority and low-priority active assignments for that expert
 * are frozen so the expert can focus on the high-priority work.
 * When the high-priority question is completed, those frozen assignments
 * are automatically re-activated (unfrozen).
 */
@injectable()
export class FreezeService {
  constructor(
    @inject('AssignmentRepository')
    private readonly repo: IAssignmentRepository,
  ) {}

  /**
   * Freeze all active medium and low priority assignments for an expert.
   * Called when a new high-priority assignment becomes active.
   *
   * @param assignmentId  the newly activated high-priority assignment
   */
  async freezeLowerPriority(assignmentId: string): Promise<IAssignment[]> {
    const assignment = await this.repo.findById(assignmentId);
    if (!assignment) return [];

    if (assignment.priority !== 'high') return [];

    const active = await this.repo.findActiveByExpertId(assignment.expertId);
    const toFreeze = active.filter(a => a._id !== assignmentId && a.priority !== 'high');

    const frozen: IAssignment[] = [];
    for (const a of toFreeze) {
      if (a._id) {
        const updated = await this.repo.updateStatus(a._id, 'frozen');
        frozen.push(updated);
      }
    }
    return frozen;
  }

  /**
   * Unfreeze all queued and frozen assignments for an expert.
   * Called when a high-priority assignment is completed, freeing the expert
   * to resume queued/frozen work.
   *
   * Unfreezing activates in priority order: queued high first, then queued
   * medium, then queued low, then frozen medium, then frozen low — as many
   * as fit within capacity limits.
   */
  async unfreezeQueued(expertId: string): Promise<IAssignment[]> {
    const [active, queued, frozen] = await Promise.all([
      this.repo.findActiveByExpertId(expertId),
      this.repo.findQueuedByExpertId(expertId),
      this.repo.findFrozenByExpertId(expertId),
    ]);

    const activated: IAssignment[] = [];

    const countActive = (p: 'high' | 'medium' | 'low') =>
      active.filter(a => a.priority === p).length;

    // Priority order for reactivation: queued first (they were waiting longer)
    const allToTry = [
      ...queued.filter(a => a.priority === 'high'),
      ...queued.filter(a => a.priority === 'medium'),
      ...queued.filter(a => a.priority === 'low'),
      ...frozen.filter(a => a.priority === 'medium'),
      ...frozen.filter(a => a.priority === 'low'),
    ];

    for (const a of allToTry) {
      if (!a._id) continue;
      const currentCount = countActive(a.priority);
      const limit = a.priority === 'high' ? 1 : a.priority === 'medium' ? 1 : 1;
      if (currentCount < limit) {
        const updated = await this.repo.updateStatus(a._id, 'active');
        activated.push(updated);
        active.push(updated); // keep track so subsequent checks are accurate
      }
    }

    return activated;
  }

  /**
   * Get all frozen assignments for an expert.
   */
  async getFrozenByExpert(expertId: string): Promise<IAssignment[]> {
    return this.repo.findFrozenByExpertId(expertId);
  }

  /**
   * Manually freeze an assignment.
   */
  async manualFreeze(assignmentId: string, reason: FrozenReason = 'manual_freeze'): Promise<IAssignment> {
    return this.repo.updateStatus(assignmentId, 'frozen');
  }

  /**
   * Manually unfreeze (reactivate) an assignment.
   * Note: this bypasses capacity checks — caller is responsible for
   * ensuring the expert still has a free slot.
   */
  async manualUnfreeze(assignmentId: string): Promise<IAssignment> {
    return this.repo.updateStatus(assignmentId, 'active');
  }
}