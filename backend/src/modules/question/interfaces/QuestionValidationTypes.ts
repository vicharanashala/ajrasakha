/**
 * Type definitions for PAE Validation Question endpoints
 */

/** Source item within an answer's sources array */
export interface PaeValidationSource {
  source: string;
  sourceType?: string;
  sourceName?: string;
  page?: string | number;
}

/** Answer data included in PAE validation question response */
export interface PaeValidationAnswer {
  _id: string;
  answer: string;
  sources: PaeValidationSource[];
  authorId: string;
  isFinalAnswer: boolean;
}

/** Single question returned in the PAE validation assigned questions list */
export interface PaeValidationQuestion {
  _id: string;
  question: string;
  status: string;
  source: string;
  priority: string;
  totalAnswersCount: number;
  createdAt: Date;
  state?: string;
  district?: string;
  crop?: string;
  domain?: string;
  season?: string;
  normalised_crop?: string;
  answer?: PaeValidationAnswer;
}

/** Paginated response for PAE validation assigned questions */
export interface PaeValidationAssignedQuestionsResponse {
  questions: PaeValidationQuestion[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}