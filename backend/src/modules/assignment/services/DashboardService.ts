import { injectable, inject } from 'inversify';
import { IAssignmentRepository } from '../repository/IAssignmentRepository.js';
import { ExpertCapacityService } from '../capacity.js';
import {
  IAdminAssignmentStats,
  IAssignment,
  IExpertWorkload,
} from '../types.js';

/**
 * Provides data for the Expert Dashboard and Admin Dashboard.
 */
@injectable()
export class DashboardService {
  constructor(
    @inject('AssignmentRepository')
    private readonly repo: IAssignmentRepository,
    private readonly capacity: ExpertCapacityService,
  ) {}

  /**
   * Full workload breakdown for a single expert.
   */
  async getExpertWorkload(expertId: string): Promise<IExpertWorkload> {
    return this.capacity.getWorkload(expertId);
  }

  /**
   * Workload summaries for all experts with at least one assignment.
   */
  async getAllExpertWorkloads(): Promise<IExpertWorkload[]> {
    const ids = await this.repo.getDistinctExpertIds();
    return Promise.all(ids.map(id => this.capacity.getWorkload(id)));
  }

  /**
   * All active (non-completed, non-frozen) assignments for an expert.
   * Used by the expert dashboard to show what they're currently working on.
   */
  async getActiveAssignments(expertId: string): Promise<IAssignment[]> {
    return this.repo.findActiveByExpertId(expertId);
  }

  /**
   * All frozen assignments for an expert.
   */
  async getFrozenAssignments(expertId: string): Promise<IAssignment[]> {
    return this.repo.findFrozenByExpertId(expertId);
  }

  /**
   * All queued assignments for an expert.
   */
  async getQueuedAssignments(expertId: string): Promise<IAssignment[]> {
    return this.repo.findQueuedByExpertId(expertId);
  }

  /**
   * Admin-level aggregated statistics.
   */
  async getAdminStats(): Promise<IAdminAssignmentStats> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [totalActive, totalFrozen, totalQueued, totalCompletedToday] =
      await Promise.all([
        this.repo.countByStatus('active'),
        this.repo.countByStatus('frozen'),
        this.repo.countByStatus('queued'),
        this.repo.countCompletedInRange(startOfDay, endOfDay),
      ]);

    const [highQueue, mediumQueue, lowQueue] = await Promise.all([
      this.repo.findQueuedByPriority('high'),
      this.repo.findQueuedByPriority('medium'),
      this.repo.findQueuedByPriority('low'),
    ]);

    const workloads = await this.getAllExpertWorkloads();
    const overloadedExperts = workloads
      .filter(w => w.totalActive > 3)
      .map(w => w.expertId);

    return {
      totalActive,
      totalFrozen,
      totalQueued,
      totalCompletedToday,
      queueLengthByPriority: {
        high: highQueue.length,
        medium: mediumQueue.length,
        low: lowQueue.length,
      },
      expertCount: workloads.length,
      overloadedExperts,
    };
  }

  /**
   * All active assignments across all experts (for admin view).
   */
  async getAllActiveAssignments(): Promise<IAssignment[]> {
    return this.repo.findAllActive();
  }

  /**
   * All frozen assignments across all experts (for admin view).
   */
  async getAllFrozenAssignments(): Promise<IAssignment[]> {
    return this.repo.findAllFrozen();
  }
}