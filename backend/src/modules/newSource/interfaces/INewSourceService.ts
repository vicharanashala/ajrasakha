import {INewSource, INewSourceItem, PopMatchStatus} from '#root/shared/interfaces/models.js';

export interface StartNewSourceInput {
  answerId: string;
  questionId: string;
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
}
