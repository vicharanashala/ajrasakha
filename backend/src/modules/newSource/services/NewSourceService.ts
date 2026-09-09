import {INewSourceRepository} from '#root/shared/database/interfaces/INewSourceRepository.js';
import {INewSource} from '#root/shared/interfaces/models.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {inject, injectable} from 'inversify';
import {BadRequestError, ForbiddenError, NotFoundError} from 'routing-controllers';
import {
  ChangeNewSourceStatusInput,
  CompleteNewSourceInput,
  INewSourceService,
  StartNewSourceInput,
} from '../interfaces/INewSourceService.js';

@injectable()
export class NewSourceService implements INewSourceService {
  constructor(
    @inject(CORE_TYPES.NewSourceRepository)
    private readonly newSourceRepo: INewSourceRepository,
  ) {}

  async startNewSource(input: StartNewSourceInput): Promise<INewSource> {
    const existing = await this.newSourceRepo.findByAnswerId(input.answerId);
    if (existing) {
      // A merged record is done for good - not something to reopen for editing, by its
      // original reviewer or anyone else.
      if (existing.status === 'merged') {
        throw new ForbiddenError(
          "This answer's sources have been merged and can no longer be edited.",
        );
      }

      // Whoever put this source 'in-progress' owns finishing it - a different expert
      // can't jump in and edit it until it's released back to 'pending' (or completed).
      const ownedByAnotherExpert =
        existing.status === 'in-progress' &&
        !existing.reviewArray.some(entry => entry.userId === input.userId);

      if (ownedByAnotherExpert) {
        throw new ForbiddenError(
          "This answer's sources are already being reviewed by another expert.",
        );
      }

      return existing;
    }

    return await this.newSourceRepo.create({
      answerId: input.answerId,
      questionId: input.questionId,
      sources: [],
      status: 'in-progress',
      timeTaken: null,
      reviewArray: [
        {
          userId: input.userId,
          name: input.userName,
          startedAt: new Date(),
          closedAt: null,
          isSaved: false,
        },
      ],
    });
  }

  async completeNewSource(input: CompleteNewSourceInput): Promise<INewSource> {
    const existing = await this.newSourceRepo.findById(input.id);
    if (!existing) {
      throw new NotFoundError(`new_sources record not found with id ${input.id}`);
    }
    if (existing.status === 'merged') {
      throw new ForbiddenError(
        "This answer's sources have been merged and can no longer be edited.",
      );
    }

    const updated = await this.newSourceRepo.updateById(input.id, {
      sources: input.sources,
      status: 'completed',
      timeTaken: input.timeTaken,
    });

    if (!updated) {
      throw new NotFoundError(`new_sources record not found with id ${input.id}`);
    }

    return updated;
  }

  async closeNewSource(id: string): Promise<INewSource> {
    const updated = await this.newSourceRepo.recordClose(id);

    if (!updated) {
      throw new NotFoundError(`new_sources record not found with id ${id}`);
    }

    return updated;
  }

  async findActiveInProgress(userId: string, excludeAnswerId: string): Promise<INewSource | null> {
    return await this.newSourceRepo.findActiveInProgressByUser(userId, excludeAnswerId);
  }

  async releaseToPending(id: string): Promise<INewSource> {
    const updated = await this.newSourceRepo.releaseToPending(id);

    if (!updated) {
      throw new NotFoundError(`new_sources record not found with id ${id}`);
    }

    return updated;
  }

  async getByAnswerId(answerId: string): Promise<INewSource | null> {
    return await this.newSourceRepo.findByAnswerId(answerId);
  }

  async changeStatus(input: ChangeNewSourceStatusInput): Promise<INewSource> {
    if (input.status !== 'pending' && input.status !== 'merged') {
      throw new BadRequestError("Status must be 'pending' or 'merged' for this action");
    }
    if (!input.reason?.trim()) {
      throw new BadRequestError('A reason is required to change this status');
    }

    const updated = await this.newSourceRepo.changeStatusWithReason(input.id, {
      status: input.status,
      reason: input.reason.trim(),
      changedBy: input.changedBy,
      changedByName: input.changedByName,
      changedAt: new Date(),
    });

    if (!updated) {
      throw new NotFoundError(`new_sources record not found with id ${input.id}`);
    }

    return updated;
  }
}
