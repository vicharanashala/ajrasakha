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
      // can't jump in and edit it until it's released back to 'pending' (or review-completed).
      const ownedByAnotherExpert =
        existing.status === 'in-progress' &&
        !existing.reviewArray.some(
          entry =>
            entry.userId === input.userId &&
            entry.role !== 'moderator' &&
            entry.closedAt === null,
        );

      if (ownedByAnotherExpert) {
        throw new ForbiddenError(
          "This answer's sources are already being reviewed by another expert.",
        );
      }

      const existingId = existing._id?.toString() ?? '';

      // A different reviewer than whoever is already logged here is taking over (most
      // likely a previously-released 'pending' record) - append them a fresh entry
      // rather than reusing someone else's, so each reviewer's own time is tracked.
      const hasOpenEntryForUser = existing.reviewArray.some(
        entry =>
          entry.userId === input.userId &&
          entry.role !== 'moderator' &&
          entry.closedAt === null,
      );
      let reopened = existing;
      if (!hasOpenEntryForUser) {
        const withNewReviewer = await this.newSourceRepo.appendReviewEntry(existingId, {
          userId: input.userId,
          name: input.userName,
          role: 'expert',
          startedAt: new Date(),
          closedAt: null,
          isSaved: false,
          timeTaken: null,
        });
        if (withNewReviewer) reopened = withNewReviewer;
      }

      // Picking a record back up puts it in-progress again - without this a released
      // 'pending' record (or a re-edited 'review-completed' one) stays in its old state
      // and never locks to the expert now working on it. 'flagged' is left alone so a
      // moderator's flag isn't silently cleared by someone opening the editor.
      if (reopened.status === 'pending' || reopened.status === 'review-completed') {
        const inProgress = await this.newSourceRepo.setStatus(
          existingId,
          'in-progress',
        );
        if (inProgress) return inProgress;
      }

      return reopened;
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
          role: 'expert',
          startedAt: new Date(),
          closedAt: null,
          isSaved: false,
          timeTaken: null,
        },
      ],
    });
  }

  async completeNewSource(input: CompleteNewSourceInput): Promise<INewSource> {
    const existing = await this.newSourceRepo.findById(input.id);
    if (!existing) {
      throw new NotFoundError(`updated_sources record not found with id ${input.id}`);
    }
    if (existing.status === 'merged') {
      throw new ForbiddenError(
        "This answer's sources have been merged and can no longer be edited.",
      );
    }

    const updated = await this.newSourceRepo.updateById(input.id, input.userId, {
      sources: input.sources,
      status: 'review-completed',
      timeTaken: input.timeTaken,
    });

    if (!updated) {
      throw new NotFoundError(`updated_sources record not found with id ${input.id}`);
    }

    return updated;
  }

  async closeNewSource(id: string, userId: string): Promise<INewSource> {
    const updated = await this.newSourceRepo.recordClose(id, userId);

    if (!updated) {
      throw new NotFoundError(`updated_sources record not found with id ${id}`);
    }

    return updated;
  }

  /** A moderator/admin opening an answer takes it into 'moderator-in-review', which
   *  hides it from every other moderator until they act on it or release it. */
  async startModeratorReview(input: StartNewSourceInput): Promise<INewSource> {
    const existing = await this.newSourceRepo.findByAnswerId(input.answerId);

    if (!existing) {
      throw new NotFoundError(
        `No source review exists for answer ${input.answerId}`,
      );
    }

    if (existing.status === 'moderator-in-review') {
      const heldByAnother = !existing.reviewArray.some(
        entry =>
          entry.userId === input.userId &&
          entry.role === 'moderator' &&
          entry.closedAt === null,
      );
      if (heldByAnother) {
        throw new ForbiddenError(
          'Another moderator is already reviewing this answer.',
        );
      }
      return existing;
    }

    const existingId = existing._id?.toString() ?? '';
    const hasOpenEntry = existing.reviewArray.some(
      entry =>
        entry.userId === input.userId &&
        entry.role === 'moderator' &&
        entry.closedAt === null,
    );

    if (!hasOpenEntry) {
      await this.newSourceRepo.appendReviewEntry(existingId, {
        userId: input.userId,
        name: input.userName,
        role: 'moderator',
        startedAt: new Date(),
        closedAt: null,
        isSaved: false,
        timeTaken: null,
      });
    }

    const updated = await this.newSourceRepo.setStatus(
      existingId,
      'moderator-in-review',
    );

    if (!updated) {
      throw new NotFoundError(
        `updated_sources record not found with id ${existingId}`,
      );
    }

    return updated;
  }

  async findActiveModeratorReview(
    userId: string,
    excludeAnswerId: string,
  ): Promise<INewSource | null> {
    return await this.newSourceRepo.findActiveModeratorReviewByUser(
      userId,
      excludeAnswerId,
    );
  }

  /** Hands the hold back without acting on the record - it returns to
   *  'review-completed' so another moderator can take it. */
  async releaseModeratorReview(id: string, userId: string): Promise<INewSource> {
    const updated = await this.newSourceRepo.releaseModeratorReview(id, userId);

    if (!updated) {
      throw new NotFoundError(`updated_sources record not found with id ${id}`);
    }

    return updated;
  }

  async findActiveInProgress(userId: string, excludeAnswerId: string): Promise<INewSource | null> {
    return await this.newSourceRepo.findActiveInProgressByUser(userId, excludeAnswerId);
  }

  async releaseToPending(id: string): Promise<INewSource> {
    const updated = await this.newSourceRepo.releaseToPending(id);

    if (!updated) {
      throw new NotFoundError(`updated_sources record not found with id ${id}`);
    }

    return updated;
  }

  async getByAnswerId(answerId: string): Promise<INewSource | null> {
    return await this.newSourceRepo.findByAnswerId(answerId);
  }

  async changeStatus(input: ChangeNewSourceStatusInput): Promise<INewSource> {
    if (input.status !== 'pending' && input.status !== 'merged' && input.status !== 'flagged') {
      throw new BadRequestError("Status must be 'pending', 'merged' or 'flagged' for this action");
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
      throw new NotFoundError(`updated_sources record not found with id ${input.id}`);
    }

    return updated;
  }
}
