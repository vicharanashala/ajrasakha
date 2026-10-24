import {
  GdbCleaningStatus,
  IGdbCleaningCheck,
  IGdbCleaningSource,
} from '#root/shared/interfaces/models.js';

export interface GdbCleaningListItem {
  id: string;
  question: string;
  state: string;
  crop: string;
  domain: string;
  flags: string[];
  notEvaluated: string[];
  status: GdbCleaningStatus;
}

export interface GdbCleaningItem extends GdbCleaningListItem {
  questionId: string;
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

export interface GdbCleaningListQuery {
  search?: string;
  states?: string[];
  crops?: string[];
  flags?: string[];
  statuses?: GdbCleaningStatus[];
  page?: number;
  limit?: number;
}

export interface IGdbCleaningService {
  list(query: GdbCleaningListQuery): Promise<{
    items: GdbCleaningListItem[];
    totalCount: number;
    totalPages: number;
    page: number;
    limit: number;
  }>;

  summary(): Promise<
    Record<GdbCleaningStatus, number> & {total: number}
  >;

  filterOptions(): Promise<{
    states: string[];
    crops: string[];
    flags: string[];
  }>;

  get(answerId: string): Promise<GdbCleaningItem>;

  saveCorrection(
    answerId: string,
    correctedAnswer: string,
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
