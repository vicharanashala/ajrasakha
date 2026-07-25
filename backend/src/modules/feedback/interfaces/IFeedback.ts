import { ObjectId } from 'mongodb';

export interface IFarmerFeedback {
  _id?: ObjectId | string;
  gdbEntryId: string;
  questionId?: string;
  userId?: string;
  phoneNumber?: string;
  reply: '1' | '2'; // '1' = Yes (Helpful), '2' = No (Not Helpful)
  isHelpful: boolean;
  domain?: string;
  language?: string;
  state?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IHelpfulnessRateSummary {
  key: string; // GDB entry ID, domain, language, or state
  label: string;
  totalRatings: number;
  helpfulCount: number;
  notHelpfulCount: number;
  helpfulnessRatePct: number; // e.g., 85.5%
}

export interface IFeedbackAnalyticsResponse {
  totalFeedbacks: number;
  overallHelpfulnessRatePct: number;
  byGdbEntry: IHelpfulnessRateSummary[];
  byDomain: IHelpfulnessRateSummary[];
  byLanguage: IHelpfulnessRateSummary[];
  byState: IHelpfulnessRateSummary[];
}

export interface IWeeklyFeedbackDigestEntry {
  gdbEntryId: string;
  questionText?: string;
  domain?: string;
  totalRatings: number;
  helpfulCount: number;
  notHelpfulCount: number;
  helpfulnessRatePct: number;
  reReviewTriggered: boolean;
}

export interface IWeeklyFeedbackDigestReport {
  weekStartDate: string;
  weekEndDate: string;
  totalFeedbacksCollected: number;
  overallHelpfulnessPct: number;
  lowPerformingEntries: IWeeklyFeedbackDigestEntry[];
  domainBreakdown: IHelpfulnessRateSummary[];
}

export interface IFarmerFeedbackService {
  recordFeedback(data: {
    phoneNumber?: string;
    userId?: string;
    reply: '1' | '2';
    gdbEntryId: string;
    questionId?: string;
    domain?: string;
    language?: string;
    state?: string;
  }): Promise<{ success: boolean; feedbackId: string; isHelpful: boolean; reReviewTriggered: boolean }>;

  getHelpfulnessAnalytics(filters?: {
    domain?: string;
    language?: string;
    state?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<IFeedbackAnalyticsResponse>;

  triggerReReviewForEntry(gdbEntryId: string): Promise<{ success: boolean; message: string }>;

  getWeeklyDigest(): Promise<IWeeklyFeedbackDigestReport>;
}
