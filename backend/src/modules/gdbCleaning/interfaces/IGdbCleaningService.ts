import {
  IUser,
  GdbCleaningAction,
  GdbCleaningStatus,
  IGdbCleaningCheck,
  IGdbCleaningSource,
} from '#root/shared/interfaces/models.js';

export interface GdbCleaningListItem {
  id: string;
  /** the question's own id: the one the reviewer app's All Questions searches by */
  questionId: string;
  /** the live question text from the reviewer app; the copy the checks ran on is in checkedQuestion */
  question: string;
  /** true when the question or its domain was edited after the checks ran */
  questionChanged: boolean;
  /** the question text the checks ran on, only when it differs from the live one */
  checkedQuestion: string | null;
  state: string;
  crop: string;
  domain: string;
  flags: string[];
  notEvaluated: string[];
  status: GdbCleaningStatus;
  /** who holds the answer; null when nobody (or the name is not known) */
  assignedToName: string | null;
  assignedToMe: boolean;
  assigned: boolean;
}

export interface GdbCleaningItem extends GdbCleaningListItem {
  /** the correction was edited after it was pushed, so it needs a new push */
  correctionChanged: boolean;
  answer: string;
  sources: IGdbCleaningSource[];
  checks: IGdbCleaningCheck[];
  /** true when a reviewer changed the sources; the pipeline's own are kept in originalSources */
  sourcesEdited: boolean;
  originalSources: IGdbCleaningSource[];
  pushedAt: string | null;
  correctedAnswer: string | null;
  comment: string | null;
  checkedAt: string | null;
  reviewedAt: string | null;
}

export interface GdbHistoryQuery {
  from?: string;
  to?: string;
  scope?: 'mine' | 'all';
  page?: number;
  limit?: number;
}

export interface GdbHistoryEntry {
  answerId: string;
  question: string;
  action: GdbCleaningAction;
  at: string;
  userId: string;
  userName: string | null;
  details: Record<string, unknown> | null;
}

export interface GdbHistoryResponse {
  entries: GdbHistoryEntry[];
  totalCount: number;
  totalPages: number;
  page: number;
  limit: number;
  /** how many different answers the entries are about */
  answersHandled: number;
}

export interface GdbCleaningListQuery {
  search?: string;
  states?: string[];
  crops?: string[];
  flags?: string[];
  statuses?: GdbCleaningStatus[];
  assignee?: 'me' | 'unassigned';
  page?: number;
  limit?: number;
}

export interface IGdbCleaningService {
  list(query: GdbCleaningListQuery, viewerId?: string): Promise<{
    items: GdbCleaningListItem[];
    totalCount: number;
    totalPages: number;
    page: number;
    limit: number;
  }>;

  /** Counts by status. With two dates, fixed, dismissed and pushed count only those in that period; the rest is as of now. */
  summary(range?: {from?: string; to?: string}): Promise<
    Record<GdbCleaningStatus, number> & {total: number; pushed: number; ranged: boolean}
  >;

  /** What reviewers did, newest first. Only the caller's own actions unless scope is "all". */
  history(
    query: GdbHistoryQuery,
    userId: string,
  ): Promise<GdbHistoryResponse>;

  filterOptions(): Promise<{
    states: string[];
    crops: string[];
    flags: string[];
  }>;

  get(answerId: string, viewerId?: string): Promise<GdbCleaningItem>;

  /** Tops the reviewer up to 50 to-do answers of their own. */
  refill(userId: string): Promise<{open: number; claimed: number}>;

  /** Edits the question text and/or domain in the reviewer app, then refreshes the golden answer's search data. */
  editQuestion(
    answerId: string,
    edit: {question?: string; domain?: string},
    user: IUser,
  ): Promise<GdbCleaningItem>;

  /** Takes an answer back from whoever holds it. */
  release(answerId: string, byUserId: string): Promise<GdbCleaningItem>;

  /** Takes all of a reviewer's to-do answers back. */
  releaseAll(userId: string): Promise<{released: number}>;

  /** The job that runs every hour: frees quiet and removed reviewers' answers and tops up the others. */
  runAssignmentCron(): Promise<{released: number; toppedUp: number}>;

  saveCorrection(
    answerId: string,
    correctedAnswer: string,
    reviewerId?: string,
  ): Promise<GdbCleaningItem>;

  /** A reviewer says a check is not a problem (PASS) or is one (FAIL). A comment is required. */
  editFlag(
    answerId: string,
    edit: {parameter: string; result: 'PASS' | 'FAIL'; comment: string},
    reviewerId: string,
  ): Promise<GdbCleaningItem>;

  /** An admin pushes the accepted correction to the golden answer, through the app's own edit flow. */
  pushToGdb(answerId: string, reviewerId: string): Promise<GdbCleaningItem>;

  /** A reviewer corrects the sources of the answer. The pipeline's own are kept. */
  editSources(
    answerId: string,
    sources: IGdbCleaningSource[],
    reviewerId: string,
  ): Promise<GdbCleaningItem>;

  decide(
    answerId: string,
    decision: {
      action: 'accept' | 'dismiss';
      correctedAnswer?: string;
      comment?: string;
    },
    reviewerId: string,
  ): Promise<GdbCleaningItem>;
}
