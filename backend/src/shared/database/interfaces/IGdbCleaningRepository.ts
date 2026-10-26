import {
  GdbCleaningStatus,
  IGdbCleaning,
  IGdbCleaningCheck,
  IGdbCleaningSource,
} from '#root/shared/interfaces/models.js';

export interface IGdbCleaningListFilters {
  search?: string;
  states?: string[];
  crops?: string[];
  flags?: string[];
  statuses?: GdbCleaningStatus[];
  page: number;
  limit: number;
}

export type GdbCleaningListRow = Pick<
  IGdbCleaning,
  | 'answerId'
  | 'question'
  | 'state'
  | 'crop'
  | 'domain'
  | 'flags'
  | 'notEvaluated'
  | 'status'
>;

export interface IGdbCleaningRepository {
  list(
    filters: IGdbCleaningListFilters,
  ): Promise<{rows: GdbCleaningListRow[]; totalCount: number}>;

  getByAnswerId(answerId: string): Promise<IGdbCleaning | null>;

  countByStatus(): Promise<Record<GdbCleaningStatus, number>>;

  getFilterOptions(): Promise<{
    states: string[];
    crops: string[];
    flags: string[];
  }>;

  /** Saves the suggested or edited correction. Only an answer still to do can change. */
  saveCorrection(
    answerId: string,
    correctedAnswer: string,
  ): Promise<IGdbCleaning | null>;

  /** Saves the checks with a reviewer's changes and the flags worked out from them. Only an answer still to do can change. */
  saveChecks(
    answerId: string,
    checks: IGdbCleaningCheck[],
    flags: string[],
    status: 'todo' | 'clean',
  ): Promise<IGdbCleaning | null>;

  /** Saves the edited sources, keeping the originals. Only an answer still to do can change. */
  saveSources(
    answerId: string,
    sources: IGdbCleaningSource[],
    originalSources: IGdbCleaningSource[],
    reviewerId: string,
  ): Promise<IGdbCleaning | null>;

  /** Records that the accepted correction was pushed to the golden answer. Only a fixed answer that was not pushed yet. */
  markPushed(answerId: string, reviewerId: string): Promise<IGdbCleaning | null>;

  /** Closes an answer as fixed or dismissed. Only an answer still to do can change. */
  decide(
    answerId: string,
    decision: {
      status: 'fixed' | 'dismissed';
      correctedAnswer?: string;
      comment: string | null;
      reviewerId: string;
    },
  ): Promise<IGdbCleaning | null>;
}
