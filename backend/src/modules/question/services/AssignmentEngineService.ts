import { injectable, inject } from 'inversify';
import { Collection, ObjectId } from 'mongodb';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import type { IQuestionSubmissionRepository } from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import type { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import type { IWaitingQueueRepository } from '#root/shared/database/interfaces/IWaitingQueueRepository.js';
import type { NotificationService } from '#root/modules/notification/services/NotificationService.js';
import { broadcastToAll } from '#root/bootstrap/realtimeWebSocket.js';
import { IUser, IQuestionSubmission, IQuestionPriority } from '#root/shared/interfaces/models.js';
import { MongoDatabase } from '#root/shared/index.js';

export interface WorkloadSnapshot {
  expertId: string;
  expertName: string;
  high: string | null;
  medium: string | null;
  low: string | null;
  totalActive: number;
}

let isProcessingQueue = false;

@injectable()
export class AssignmentEngineService {
  private usersCollection: Collection<IUser> | null = null;

  constructor(
    @inject(CORE_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(CORE_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(CORE_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(CORE_TYPES.WaitingQueueRepository)
    private readonly waitingQueueRepo: IWaitingQueueRepository,

    @inject(CORE_TYPES.NotificationService)
    private readonly notificationService: NotificationService,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {}

  private async getUsersCollection(): Promise<Collection<IUser>> {
    if (!this.usersCollection) {
      this.usersCollection = await this.mongoDatabase.getCollection<IUser>('users');
    }
    return this.usersCollection;
  }

  private async updateUser(userId: string, update: Record<string, any>): Promise<void> {
    const col = await this.getUsersCollection();
    await col.updateOne({ _id: new ObjectId(userId) }, { $set: update });
  }

  private async getActiveExperts(): Promise<IUser[]> {
    const allUsers = await this.userRepo.findAll();
    return allUsers.filter(
      (u) => u.role === 'expert' && u.isBlocked !== true && u.status !== 'in-active',
    );
  }

  private getWorkload(user: IUser): Record<string, string | null> {
    return (user as any).activeWorkload ?? { high: null, medium: null, low: null };
  }

  private async updateSubmissionByQuestionId(
    questionId: string,
    update: Record<string, any>,
  ): Promise<void> {
    const submission = await this.questionSubmissionRepo.getByQuestionId(questionId);
    if (submission?._id) {
      await this.questionSubmissionRepo.updateById(submission._id.toString(), update);
    }
  }

  async assignQuestion(
    questionId: string,
    priority: IQuestionPriority,
  ): Promise<{ assigned: boolean; expertId?: string }> {
    const normalized = this.normalizePriority(priority);

    const allExperts = await this.getActiveExperts();
    const eligible = allExperts.filter(
      (e) => e.activeWorkload?.[normalized] === null || e.activeWorkload?.[normalized] === undefined,
    );

    if (eligible.length === 0) {
      await this.waitingQueueRepo.enqueue({
        questionId: new ObjectId(questionId),
        priority: normalized,
        enqueuedAt: new Date(),
        status: 'waiting',
      });
      broadcastToAll('queue:updated', await this.getQueueLengths());
      return { assigned: false };
    }

    const sorted = eligible.sort(
      (a, b) => (a.reputation_score ?? 0) - (b.reputation_score ?? 0),
    );
    const best = sorted[0];

    const workload = this.getWorkload(best);
    workload[normalized] = questionId;
    await this.updateUser(best._id!.toString(), { activeWorkload: workload });

    const existingSubmission = await this.questionSubmissionRepo.getByQuestionId(questionId);
    if (existingSubmission) {
      await this.questionSubmissionRepo.updateById(existingSubmission._id?.toString(), {
        queue: [new ObjectId(best._id)],
        priorityLevel: normalized,
      });
    } else {
      await this.questionSubmissionRepo.addSubmission({
        questionId: new ObjectId(questionId),
        lastRespondedBy: null as any,
        history: [],
        queue: [new ObjectId(best._id)],
        priorityLevel: normalized,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    }

    if (normalized === 'high') {
      await this.freezeLowerPriority(best._id!.toString());
    }

    try {
      await this.notificationService.addNotification(
        best._id!.toString(),
        questionId,
        'answer_creation',
        `New ${normalized} priority question assigned to you`,
        'New Assignment',
      );
    } catch (err) {
      console.error('[AssignmentEngine] Notification failed:', err);
    }

    broadcastToAll('assignment:new', { questionId, expertId: best._id, priority: normalized });
    broadcastToAll('workload:updated', { expertId: best._id, workload });

    return { assigned: true, expertId: best._id!.toString() };
  }

  async handleCompletion(questionId: string, expertId: string): Promise<void> {
    const user = await this.userRepo.findById(expertId);
    if (!user) return;

    const workload = this.getWorkload(user);
    let completedPriority: 'high' | 'medium' | 'low' | null = null;

    for (const p of ['high', 'medium', 'low'] as const) {
      if (workload[p] === questionId) {
        completedPriority = p;
        break;
      }
    }

    if (!completedPriority) return;

    workload[completedPriority] = null;
    await this.updateUser(expertId, { activeWorkload: workload });

    if (completedPriority === 'high') {
      await this.unfreezeQuestions(expertId);
    }

    await this.processWaitingQueue();
    broadcastToAll('workload:updated', { expertId, workload });
  }

  async freezeLowerPriority(expertId: string): Promise<string[]> {
    const user = await this.userRepo.findById(expertId);
    if (!user) return [];

    const frozen: string[] = [];
    const workload = this.getWorkload(user);

    for (const priority of ['medium', 'low'] as const) {
      const qId = workload[priority];
      if (qId) {
        const submission = await this.questionSubmissionRepo.getByQuestionId(qId);
        if (submission && !submission.isFrozen) {
          await this.questionSubmissionRepo.updateById(submission._id?.toString(), {
            isFrozen: true,
            frozenAt: new Date(),
            previousStatus: (submission as any).status || 'in-review',
          });
          frozen.push(qId);
          broadcastToAll('question:frozen', { questionId: qId, expertId });
        }
      }
    }
    return frozen;
  }

  async unfreezeQuestions(expertId: string): Promise<string[]> {
    const user = await this.userRepo.findById(expertId);
    if (!user) return [];

    const unfrozen: string[] = [];
    const workload = this.getWorkload(user);

    for (const priority of ['medium', 'low'] as const) {
      const qId = workload[priority];
      if (qId) {
        const submission = await this.questionSubmissionRepo.getByQuestionId(qId);
        if (submission && submission.isFrozen) {
          await this.questionSubmissionRepo.updateById(submission._id?.toString(), {
            isFrozen: false,
            status: (submission as any).previousStatus || 'in-review',
            frozenAt: null,
          });
          unfrozen.push(qId);
          broadcastToAll('question:unfrozen', { questionId: qId, expertId });
        }
      }
    }
    return unfrozen;
  }

  async forceUnfreeze(questionId: string, moderatorId: string): Promise<void> {
    const submission = await this.questionSubmissionRepo.getByQuestionId(questionId);
    if (submission && submission.isFrozen) {
      await this.questionSubmissionRepo.updateById(submission._id?.toString(), {
        isFrozen: false,
        status: (submission as any).previousStatus || 'in-review',
        frozenAt: null,
      });
      broadcastToAll('question:unfrozen', { questionId, expertId: moderatorId });
    }
  }

  async processWaitingQueue(): Promise<number> {
    if (isProcessingQueue) return 0;
    isProcessingQueue = true;

    try {
      let assigned = 0;
      const priorities: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low'];

      const allExperts = await this.getActiveExperts();

      for (const priority of priorities) {
        const waiting = await this.waitingQueueRepo.getWaitingByPriority(priority);

        for (const entry of waiting) {
          const eligible = allExperts.filter(
            (e) => e.activeWorkload?.[priority] === null || e.activeWorkload?.[priority] === undefined,
          );

          if (eligible.length > 0) {
            const sorted = eligible.sort(
              (a, b) => (a.reputation_score ?? 0) - (b.reputation_score ?? 0),
            );
            const best = sorted[0];

            const workload = this.getWorkload(best);
            workload[priority] = entry.questionId.toString();
            await this.updateUser(best._id!.toString(), { activeWorkload: workload });
            // Keep in-memory expert list in sync to prevent double-assignment
            (best as any).activeWorkload = workload;

            await this.updateSubmissionByQuestionId(entry.questionId.toString(), {
              queue: [new ObjectId(best._id)],
              priorityLevel: priority,
            });

            await this.waitingQueueRepo.updateStatus(entry._id!.toString(), 'assigned');

            if (priority === 'high') {
              await this.freezeLowerPriority(best._id!.toString());
            }

            try {
              await this.notificationService.addNotification(
                best._id!.toString(),
                entry.questionId.toString(),
                'answer_creation',
                `Queued ${priority} priority question assigned to you`,
                'New Assignment',
              );
            } catch (err) {
              console.error('[AssignmentEngine] Notification failed:', err);
            }

            broadcastToAll('assignment:new', {
              questionId: entry.questionId,
              expertId: best._id,
              priority,
            });
            assigned++;
          }
        }
      }

      if (assigned > 0) {
        broadcastToAll('queue:updated', await this.getQueueLengths());
      }

      return assigned;
    } finally {
      isProcessingQueue = false;
    }
  }

  async getQueueLengths(): Promise<{ high: number; medium: number; low: number; total: number }> {
    const high = await this.waitingQueueRepo.getCountByPriority('high');
    const medium = await this.waitingQueueRepo.getCountByPriority('medium');
    const low = await this.waitingQueueRepo.getCountByPriority('low');
    return { high, medium, low, total: high + medium + low };
  }

  async getWorkloadSnapshot(expertId: string): Promise<WorkloadSnapshot | null> {
    const user = await this.userRepo.findById(expertId);
    if (!user) return null;

    const workload = this.getWorkload(user);
    const totalActive = [workload.high, workload.medium, workload.low].filter(Boolean).length;

    return {
      expertId: user._id!.toString(),
      expertName: `${user.firstName} ${user.lastName ?? ''}`.trim(),
      high: workload.high,
      medium: workload.medium,
      low: workload.low,
      totalActive,
    };
  }

  async getAllWorkloads(): Promise<WorkloadSnapshot[]> {
    const allExperts = await this.getActiveExperts();
    return allExperts.map((user) => {
      const workload = this.getWorkload(user);
      const totalActive = [workload.high, workload.medium, workload.low].filter(Boolean).length;
      return {
        expertId: user._id!.toString(),
        expertName: `${user.firstName} ${user.lastName ?? ''}`.trim(),
        high: workload.high,
        medium: workload.medium,
        low: workload.low,
        totalActive,
      };
    });
  }

  async manualAssign(questionId: string, expertId: string): Promise<void> {
    const question = await this.questionRepo.getById(questionId);
    const priority = this.normalizePriority(question?.priority ?? 'medium');

    const user = await this.userRepo.findById(expertId);
    if (!user) throw new Error('Expert not found');

    const workload = this.getWorkload(user);
    if (workload[priority]) {
      throw new Error(`Expert already has a ${priority} priority question`);
    }

    workload[priority] = questionId;
    await this.updateUser(expertId, { activeWorkload: workload });

    await this.updateSubmissionByQuestionId(questionId, {
      queue: [new ObjectId(expertId)],
      priorityLevel: priority,
    });

    if (priority === 'high') {
      await this.freezeLowerPriority(expertId);
    }

    broadcastToAll('assignment:new', { questionId, expertId, priority });
    broadcastToAll('workload:updated', { expertId, workload });
  }

  async reassignQuestion(
    questionId: string,
    fromExpertId: string,
    toExpertId: string,
  ): Promise<void> {
    await this.handleCompletion(questionId, fromExpertId);

    const question = await this.questionRepo.getById(questionId);
    const priority = this.normalizePriority(question?.priority ?? 'medium');
    await this.assignQuestionToExpert(questionId, toExpertId, priority);
  }

  async removeAssignment(questionId: string, expertId: string): Promise<void> {
    await this.handleCompletion(questionId, expertId);

    const question = await this.questionRepo.getById(questionId);
    const priority = this.normalizePriority(question?.priority ?? 'medium');
    await this.waitingQueueRepo.enqueue({
      questionId: new ObjectId(questionId),
      priority,
      enqueuedAt: new Date(),
      status: 'waiting',
    });

    broadcastToAll('queue:updated', await this.getQueueLengths());
  }

  async getQueueEntries() {
    return this.waitingQueueRepo.getAllEntries();
  }

  private async assignQuestionToExpert(
    questionId: string,
    expertId: string,
    priority: 'low' | 'medium' | 'high',
  ): Promise<void> {
    const user = await this.userRepo.findById(expertId);
    if (!user) throw new Error('Expert not found');

    const workload = this.getWorkload(user);
    workload[priority] = questionId;
    await this.updateUser(expertId, { activeWorkload: workload });

    await this.updateSubmissionByQuestionId(questionId, {
      queue: [new ObjectId(expertId)],
      priorityLevel: priority,
    });

    if (priority === 'high') {
      await this.freezeLowerPriority(expertId);
    }

    broadcastToAll('assignment:new', { questionId, expertId, priority });
    broadcastToAll('workload:updated', { expertId, workload });
  }

  private normalizePriority(priority: string | undefined): 'low' | 'medium' | 'high' {
    if (priority === 'high' || priority === 'critical') return 'high';
    if (priority === 'medium') return 'medium';
    return 'low';
  }
}
