import {
  INewSource,
  INewSourceReviewEntry,
  INewSourceStatusChange,
} from '#root/shared/interfaces/models.js';

export interface INewSourceRepository {
  /** Inserts a new document into the `updated_sources` collection. */
  create(data: Omit<INewSource, '_id' | 'createdAt' | 'updatedAt'>): Promise<INewSource>;

  /** Updates an existing `updated_sources` document by id (e.g. on save, once editing
   *  completes) — also marks isSaved and records timeTaken on `userId`'s own still-open
   *  reviewArray entry (the one with closedAt: null), not just the record as a whole, so
   *  each reviewer's own contribution stays attributed to them. */
  updateById(
    id: string,
    userId: string,
    updates: Partial<Pick<INewSource, 'sources' | 'status' | 'timeTaken'>>,
  ): Promise<INewSource | null>;

  /** Stamps closedAt on `userId`'s own still-open reviewArray entry when the Edit Source
   *  modal closes — independent of updateById, since the modal can close without the
   *  edit being completed. */
  recordClose(id: string, userId: string): Promise<INewSource | null>;

  /** Appends a new reviewArray entry to an existing record — used when a different
   *  expert than whoever is already logged there starts reviewing it (e.g. after it was
   *  released back to 'pending'), so every reviewer who has touched it is tracked, not
   *  just the first one. */
  appendReviewEntry(id: string, entry: INewSourceReviewEntry): Promise<INewSource | null>;

  /** Finds this user's other 'in-progress' record, if any, excluding the answer they're
   *  about to start editing — used to detect an abandoned-in-place review elsewhere. */
  findActiveInProgressByUser(userId: string, excludeAnswerId: string): Promise<INewSource | null>;

  /** Finds the existing `updated_sources` record for this answer, if one already exists —
   *  used so starting an edit never creates a duplicate document for the same answer. */
  findByAnswerId(answerId: string): Promise<INewSource | null>;

  /** Finds an `updated_sources` record by its own id — used to check its current status
   *  (e.g. rejecting a save once it's 'merged') before applying an update to it. */
  findById(id: string): Promise<INewSource | null>;

  /** Sends an 'in-progress' record back to 'pending' (and stamps closedAt) so another
   *  expert can pick it up, when the same expert starts reviewing a different answer. */
  releaseToPending(id: string): Promise<INewSource | null>;

  /** An admin/moderator override of a record's status (to 'pending' or 'merged'), with
   *  the mandatory reason appended to statusChanges rather than replacing history. */
  changeStatusWithReason(id: string, entry: INewSourceStatusChange): Promise<INewSource | null>;
}
