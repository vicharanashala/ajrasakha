import {INewSourceRepository} from '#root/shared/database/interfaces/INewSourceRepository.js';
import {INewSource, INewSourceItem} from '#root/shared/interfaces/models.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {IOrganizationService} from '#root/modules/organization/interfaces/IOrganizationService.js';
import {IPopService} from '#root/modules/pop/interfaces/IPopService.js';
import {inject, injectable} from 'inversify';
import {BadRequestError, ForbiddenError, NotFoundError} from 'routing-controllers';
import {
  ChangeNewSourceStatusInput,
  CompleteNewSourceInput,
  INewSourceService,
  StartNewSourceInput,
} from '../interfaces/INewSourceService.js';

// Only these fields are ever persisted on a source item - organizationName, sourceName,
// sourceLink and yearOfRelease are populated for display only (see populateSources) and
// must never be written back, however the frontend's draft object happens to be shaped.
const sanitizeSources = (sources: INewSourceItem[]): INewSourceItem[] =>
  sources.map(item => ({
    organization: item.organization,
    source: item.source,
    page: item.page,
    sourceReferenceStatus: item.sourceReferenceStatus,
    sourceIndex: item.sourceIndex,
    missedFields: item.missedFields ?? [],
  }));

@injectable()
export class NewSourceService implements INewSourceService {
  constructor(
    @inject(CORE_TYPES.NewSourceRepository)
    private readonly newSourceRepo: INewSourceRepository,
    @inject(CORE_TYPES.OrganizationService)
    private readonly organizationService: IOrganizationService,
    @inject(CORE_TYPES.PopService)
    private readonly popService: IPopService,
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

      // Admins/moderators editing sources directly (as opposed to overriding status)
      // only get to while the record is under moderator attention - already reviewed
      // or currently held in moderation. Anything else (pending, in-progress, flagged)
      // is theirs to look at, not to edit.
      const isReviewerRole = input.role === 'admin' || input.role === 'moderator';
      if (
        isReviewerRole &&
        existing.status !== 'review-completed' &&
        existing.status !== 'moderator-in-review'
      ) {
        throw new ForbiddenError(
          "This answer's sources can't be edited while its review is in this status.",
        );
      }

      // Whoever put this source 'in-progress' owns finishing it - a different expert
      // can't jump in and edit it until it's released back to 'pending' (or review-completed).
      // Ownership is decided by who currently holds the OPEN entry, not by whether this
      // user's own entry happens to still be open - switching to another answer closes
      // this user's entry (see closeNewSource), and coming back to resume should not
      // read as someone else having taken it over.
      const openExpertEntry = existing.reviewArray.find(
        entry => entry.role !== 'moderator' && entry.closedAt === null,
      );
      const ownedByAnotherExpert =
        existing.status === 'in-progress' &&
        openExpertEntry !== undefined &&
        openExpertEntry.userId !== input.userId;

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

    const isReviewerRole = input.role === 'admin' || input.role === 'moderator';
    if (
      isReviewerRole &&
      existing.status !== 'review-completed' &&
      existing.status !== 'moderator-in-review'
    ) {
      throw new ForbiddenError(
        "This answer's sources can't be edited while its review is in this status.",
      );
    }

    const updated = await this.newSourceRepo.updateById(input.id, input.userId, {
      sources: sanitizeSources(input.sources),
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

    // Taking an answer into moderation is itself a status change, so it's only allowed
    // from 'review-completed' (picking it up) or 'moderator-in-review' (an existing
    // hold, handled below). Everything else - pending, in-progress, flagged, merged -
    // is admin/moderator read-only, so opening it to look must leave it untouched.
    if (existing.status !== 'review-completed' && existing.status !== 'moderator-in-review') {
      return existing;
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

  // Looks up organizationName/organizationType from `organization` and
  // sourceName/sourceLink/yearOfRelease from `source` for display in the moderator
  // Before/After view - these are never persisted (see sanitizeSources).
  private async populateSources(sources: INewSourceItem[]): Promise<INewSourceItem[]> {
    return await Promise.all(
      sources.map(async item => {
        const [organization, pop] = await Promise.all([
          item.organization
            ? this.organizationService.findById(item.organization).catch(() => null)
            : null,
          item.source ? this.popService.findById(item.source).catch(() => null) : null,
        ]);

        return {
          ...item,
          organizationName: organization?.org_name,
          organizationType: organization?.type,
          sourceName: pop?.shareable_name,
          sourceLink: pop?.live_source_link || pop?.shareable_link,
          yearOfRelease: pop?.year_of_release,
        };
      }),
    );
  }

  async getByAnswerId(answerId: string): Promise<INewSource | null> {
    const record = await this.newSourceRepo.findByAnswerId(answerId);
    if (!record) return null;
    return {...record, sources: await this.populateSources(record.sources)};
  }

  async changeStatus(input: ChangeNewSourceStatusInput): Promise<INewSource> {
    const allowedStatuses = ['pending', 'merged', 'flagged', 'review-completed'];
    if (!allowedStatuses.includes(input.status)) {
      throw new BadRequestError(
        "Status must be 'pending', 'merged', 'flagged' or 'review-completed' for this action",
      );
    }
    if (!input.reason?.trim()) {
      throw new BadRequestError('A reason is required to change this status');
    }

    const existing = await this.newSourceRepo.findById(input.id);
    if (!existing) {
      throw new NotFoundError(`updated_sources record not found with id ${input.id}`);
    }

    // Admin/moderator status overrides only reach a record while it's under moderator
    // attention - already reviewed, currently held in moderation, or flagged for a
    // second look. Anything else (pending, in-progress, merged) is read-only from here.
    const overridableStatuses = ['review-completed', 'moderator-in-review', 'flagged'];
    if (!overridableStatuses.includes(existing.status)) {
      throw new ForbiddenError(
        `This answer's sources are '${existing.status}' and can't be changed from here.`,
      );
    }

    // A flagged record can only be unflagged - back to the experts ('pending') or back
    // to the moderator queue ('review-completed'). It can't be sent anywhere else from
    // this flagged state, 'merged' included.
    if (
      existing.status === 'flagged' &&
      input.status !== 'pending' &&
      input.status !== 'review-completed'
    ) {
      throw new ForbiddenError(
        "A flagged review can only be unflagged to 'pending' or 'review-completed'.",
      );
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
