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
