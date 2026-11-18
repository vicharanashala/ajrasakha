import type { CallQuery, FarmerFollowUpStatus } from '#root/shared/database/interfaces/ICallDetailsRepository.js';

export interface AnaraCitation {
  passageNumber: number;
  documentName: string | null;
  documentId: string | null;
  pageNumber: number | null;
  sourcePages: number[];
  passageId: string | null;
}

export interface AnaraDraftResponse {
  answer: string;
  citations: AnaraCitation[];
  note: string;
}

export interface SubmitForReviewDto {
  callUuid: string;
  question: string;
  answer: string;
  citations?: AnaraCitation[];
  crop?: string | null;
  state?: string | null;
  district?: string | null;
  block?: string | null;
  village?: string | null;
  season?: string | null;
  domain?: string | string[] | null;
}

export interface SubmitForReviewResponse {
  success: boolean;
  queryId: string;
  reviewQuestionId?: string;
  reviewStatus: string;
  reviewSlaExpiresAt?: Date;
  message: string;
}

export interface ReviewWebhookSourceItem {
  title?: string;
  url?: string;
  text?: string;
  sourceName?: string;
  page?: string | number;
  [key: string]: any;
}

export interface ReviewWebhookPayload {
  question_id: string;
  status: string;
  question?: string;
  answer?: string;
  author?: string;
  source?: string;
  sources?: ReviewWebhookSourceItem[];
  details?: {
    crop?: string;
    district?: string;
    state?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface IAnaraService {
  draft(
    question: string,
    crop?: string | null,
    domain?: string | null,
    state?: string | null,
  ): Promise<AnaraDraftResponse>;
  getDocumentPdf(documentId: string): Promise<Buffer>;
  submitForReview(dto: SubmitForReviewDto, agentUserId?: string): Promise<SubmitForReviewResponse>;
  retryReviewSubmission(queryId: string): Promise<SubmitForReviewResponse>;
  handleReviewWebhook(payload: ReviewWebhookPayload, webhookSecretHeader?: string): Promise<{ success: boolean; message: string }>;
  getFollowUps(status?: string, followUpStatus?: string, limit?: number, offset?: number): Promise<{ queries: CallQuery[]; total: number }>;
  updateFollowUpStatus(queryId: string, status: FarmerFollowUpStatus, notes?: string): Promise<CallQuery | null>;
}

