import { injectable, inject } from 'inversify';
import { IAssignmentRepository } from './repository/IAssignmentRepository.js';
import { IExpertWorkload } from './types.js';

/**
 * Each expert can hold at most:
 *   1 high-priority  +  1 medium-priority  +  1 low-priority  (3 total)
 *
 * We model this as two slots per priority tier, but the engine enforces
 * the "1 high + 1 medium + 1 low" constraint through canAssign().
 */
@injectable()
export class ExpertCapacityService {
  constructor(
    @inject('AssignmentRepository')
    private readonly repo: IAssignmentRepository,
  ) {}

  /**
   * Returns the full workload breakdown for an expert.
   */
  async getWorkload(expertId: string): Promise<IExpertWorkload> {
    const [active, frozen, queued] = await Promise.all([
      this.repo.findActiveByExpertId(expertId),
      this.repo.findFrozenByExpertId(expertId),
      this.repo.findQueuedByExpertId(expertId),
    ]);

    const countBy = (
      items: { priority: 'low' | 'medium' | 'high' }[],
      p: 'low' | 'medium' | 'high',
    ) => items.filter(i => i.priority === p).length;

    const activeHigh = countBy(active, 'high');
    const activeMedium = countBy(active, 'medium');
    const activeLow = countBy(active, 'low');

    const frozenMedium = countBy(frozen, 'medium');
    const frozenLow = countBy(frozen, 'low');

    const queuedHigh = countBy(queued, 'high');
    const queuedMedium = countBy(queued, 'medium');
    const queuedLow = countBy(queued, 'low');

    return {
      expertId,
      activeHigh,
      activeMedium,
      activeLow,
      frozenMedium,
      frozenLow,
      queuedHigh,
      queuedMedium,
      queuedLow,
      totalActive: active.length,
      totalFrozen: frozen.length,
      totalQueued: queued.length,
    };
  }

  /**
   * Returns true when the expert has at least one active high-priority slot free.
   */
  async hasHighSlotAvailable(expertId: string): Promise<boolean> {
    const wl = await this.getWorkload(expertId);
    return wl.activeHigh < 1;
  }

  /**
   * Returns true when the expert has at least one active medium-priority slot free.
   */
  async hasMediumSlotAvailable(expertId: string): Promise<boolean> {
    const wl = await this.getWorkload(expertId);
    return wl.activeMedium < 1;
  }

  /**
   * Returns true when the expert has at least one active low-priority slot free.
   */
  async hasLowSlotAvailable(expertId: string): Promise<boolean> {
    const wl = await this.getWorkload(expertId);
    return wl.activeLow < 1;
  }

  /**
   * Checks whether a question of the given priority can be assigned to this expert
   * right now, given the capacity rules:
   *   - high: needs a free high slot (activeHigh < 1)
   *   - medium: needs a free medium slot (activeMedium < 1)
   *   - low: needs a free low slot (activeLow < 1)
   */
  async canAssign(
    expertId: string,
    priority: 'high' | 'medium' | 'low',
  ): Promise<boolean> {
    const wl = await this.getWorkload(expertId);
    switch (priority) {
      case 'high':   return wl.activeHigh < 1;
      case 'medium': return wl.activeMedium < 1;
      case 'low':    return wl.activeLow < 1;
    }
  }

  /**
   * Returns all expertIds that have capacity for a question of the given priority.
   */
  async getAvailableExperts(
    priority: 'high' | 'medium' | 'low',
  ): Promise<string[]> {
    const ids = await this.repo.getDistinctExpertIds();
    const available: string[] = [];
    for (const id of ids) {
      if (await this.canAssign(id, priority)) {
        available.push(id);
      }
    }
    return available;
  }
}