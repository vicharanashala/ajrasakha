import {INewSource, INewSourceItem} from '#root/shared/interfaces/models.js';

export interface ChangeNewSourceStatusInput {
  id: string;
  /** Admins/moderators may only send a record to one of these statuses this way -
   *  'in-progress'/'review-completed' are set by the edit flow itself, not this override. */
  status: 'pending' | 'merged' | 'flagged';
  /** Mandatory - why the status is being overridden. Stored on the record itself. */
  reason: string;
  changedBy: string;
  changedByName: string;
}

export interface StartNewSourceInput {
  answerId: string;
  questionId: string;
  /** The user opening the Edit Source modal — logged into the new record's
   *  reviewArray as the one who started (and, until completed, hasn't finished) it. */
  userId: string;
  userName: string;
}

export interface CompleteNewSourceInput {
  id: string;
  // Every source on the answer, not just the one being edited — each entry carries its
  // own organization, sourceReference, sourceReferenceStatus (from that source's own
  // Fetch Source Reference lookup) and sourceIndex (its position in the answer's own
  // sources array).
  sources: INewSourceItem[];
  timeTaken: number;
  /** The user saving this edit — used to record timeTaken on their own reviewArray
   *  entry, not the record as a whole. */
  userId: string;
}

export interface INewSourceService {
  /** Called when the Edit Source modal opens — creates the new_sources record as
   *  'in-progress' so the editing timer is backed by a real document from the start.
   *  If a record already exists for this answer, that one is returned instead so the
   *  same answer never ends up with more than one new_sources document. If a different
   *  reviewer than whoever is already logged there is now starting a session on it (e.g.
   *  after it was released back to 'pending'), a new reviewArray entry is appended for
   *  them, so every reviewer who has touched it - and how long each took - is tracked. */
  startNewSource(input: StartNewSourceInput): Promise<INewSource>;

  /** Called when the user saves — records the final sources (each with its own
   *  organization/sourceReferenceStatus/sourceIndex), stops the timer into timeTaken,
   *  and marks the record 'review-completed'. */
  completeNewSource(input: CompleteNewSourceInput): Promise<INewSource>;

  /** Called whenever the Edit Source modal closes — Cancel, Escape, outside click, or
   *  right after a successful save — regardless of whether the edit was completed.
   *  Stamps closedAt on this user's own reviewArray entry. */
  closeNewSource(id: string, userId: string): Promise<INewSource>;

  /** Called before starting a new edit session — finds this user's other 'in-progress'
   *  record, if any, so the UI can confirm switching away from it before starting. */
  findActiveInProgress(userId: string, excludeAnswerId: string): Promise<INewSource | null>;

  /** Called once the user confirms switching answers — sends the previous 'in-progress'
   *  record back to 'pending' so it becomes available to other experts again. */
  releaseToPending(id: string): Promise<INewSource>;

  /** Read-only lookup of this answer's new_sources record, if one exists — used by the
   *  moderator "before/after" comparison view, not part of the start/edit flow. */
  getByAnswerId(answerId: string): Promise<INewSource | null>;

  /** Admin/moderator override to 'pending', 'merged' or 'flagged', with a mandatory
   *  reason logged to the record's statusChanges. Caller (the controller) has already
   *  checked the user's role - this only validates the reason and the target status. */
  changeStatus(input: ChangeNewSourceStatusInput): Promise<INewSource>;
}
