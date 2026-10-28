import {
  GdbCleaningAction,
  GdbCleaningStatus,
  IGdbCleaning,
  IGdbCleaningCheck,
  IGdbCleaningHistoryEntry,
  IGdbCleaningSource,
} from '#root/shared/interfaces/models.js';
import type {ObjectId} from 'mongodb';

export interface IGdbCleaningListFilters {
  search?: string;
  states?: string[];
  crops?: string[];
  flags?: string[];
  statuses?: GdbCleaningStatus[];
  /** only the answers held by this reviewer */
  assignedTo?: string;
  /** only the answers nobody holds */
  unassigned?: boolean;
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
  | 'assignedTo'
>;

/** One line of a reviewer's history: what they did, on which answer, and when. */
export interface GdbHistoryRow {
  answerId: ObjectId;
  question: string;
  userId: ObjectId;
  action: GdbCleaningAction;
  at: Date;
  details?: Record<string, unknown>;
}

export interface IGdbHistoryFilters {
  /** only this reviewer's actions; leave out for everyone's */
  userId?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

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

  /** How many to-do answers this reviewer holds. */
  countOpenAssigned(userId: string): Promise<number>;

  /** Gives the reviewer up to `limit` of the oldest to-do answers nobody holds; returns how many it got. */
  claimFree(userId: string, limit: number): Promise<number>;

  /** Takes the answer back from whoever holds it; false when nobody did. */
  release(answerId: string): Promise<boolean>;

  /** Takes back a reviewer's to-do answers they have not touched, or all of them. */
  releaseOf(userId: string, onlyUntouched: boolean): Promise<number>;

  /** Reviewers who hold to-do answers. */
  listAssignees(): Promise<string[]>;

  /** When the reviewer last did something or was given answers. */
  lastActivityAt(userId: string): Promise<Date | null>;

  /** Adds one line to the answer's history. */
  addHistory(answerId: string, entry: IGdbCleaningHistoryEntry): Promise<void>;

  /** Reviewers' actions, newest first, with how many answers they touched. */
  listHistory(filters: IGdbHistoryFilters): Promise<{
    rows: GdbHistoryRow[];
    totalCount: number;
    answers: number;
  }>;

  /** Fixed, dismissed and pushed answers: all of them, or only those decided or pushed between two dates. */
  countInRange(
    from?: Date,
    to?: Date,
  ): Promise<{fixed: number; dismissed: number; pushed: number}>;

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
