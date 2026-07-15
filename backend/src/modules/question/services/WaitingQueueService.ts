import { inject, injectable } from 'inversify';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { IWaitingQueueRepository } from '#root/shared/database/interfaces/IWaitingQueueRepository.js';
import { IWaitingQueueEntry } from '#root/shared/interfaces/models.js';

@injectable()
export class WaitingQueueService {
  constructor(
    @inject(CORE_TYPES.WaitingQueueRepository)
    private waitingQueueRepo: IWaitingQueueRepository,
  ) {}

  async getQueueLengths(): Promise<{ high: number; medium: number; low: number; total: number }> {
    const [high, medium, low] = await Promise.all([
      this.waitingQueueRepo.getCountByPriority('high'),
      this.waitingQueueRepo.getCountByPriority('medium'),
      this.waitingQueueRepo.getCountByPriority('low'),
    ]);
    return { high, medium, low, total: high + medium + low };
  }

  async getQueueEntries(): Promise<IWaitingQueueEntry[]> {
    return this.waitingQueueRepo.getAllEntries();
  }

  async removeByQuestionId(questionId: string): Promise<void> {
    await this.waitingQueueRepo.removeAllByQuestionId(questionId);
  }

  async getCountByPriority(priority: 'low' | 'medium' | 'high'): Promise<number> {
    return this.waitingQueueRepo.getCountByPriority(priority);
  }
}
