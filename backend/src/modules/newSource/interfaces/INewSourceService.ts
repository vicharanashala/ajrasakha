import {INewSource, INewSourceItem, PopMatchStatus} from '#root/shared/interfaces/models.js';

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
  sources: INewSourceItem[];
  timeTaken: number;
  /** Where the saved source matched in the pop collection — captured client-side by the
   *  Fetch Source Reference lookup, not re-derived here (that lookup ran against the
   *  current source's text, which the submitted `sources` entry doesn't carry). */
  sourceReferenceStatus: PopMatchStatus | null;
}

export interface INewSourceService {
  /** Called when the Edit Source modal opens — creates the new_sources record as
   *  'inProgress' so the editing timer is backed by a real document from the start. */
  startNewSource(input: StartNewSourceInput): Promise<INewSource>;

  /** Called when the user saves — records the final sources and sourceReferenceStatus,
   *  stops the timer into timeTaken, and marks the record 'completed'. */
  completeNewSource(input: CompleteNewSourceInput): Promise<INewSource>;

  /** Called whenever the Edit Source modal closes — Cancel, Escape, outside click, or
   *  right after a successful save — regardless of whether the edit was completed.
   *  Stamps closedAt on the record's reviewArray entry. */
  closeNewSource(id: string): Promise<INewSource>;
}
