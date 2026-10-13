import {GdbCleaningStatus, IGdbCleaning} from '#root/shared/interfaces/models.js';

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
