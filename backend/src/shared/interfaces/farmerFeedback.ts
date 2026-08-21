import { ObjectId } from 'mongodb';

export interface IFarmerFeedback {
  _id?: ObjectId | string;
  questionId: ObjectId | string;
  phoneNumber?: string;
  threadId?: string;
  messageId?: string;
  queryText?: string;
  deliveredAnswer?: string;
  source: 'WHATSAPP' | 'AJRASAKHA' | 'ANNAM' | 'WEBAPP';
  gdbMatched?: boolean;
  rating: 1 | 2; // 1 = Yes/Helpful, 2 = No/Not Helpful
  isHelpful: boolean;
  feedbackText?: string;
  domain?: string;
  crop?: string;
  state?: string;
  district?: string;
  language?: string;
  flaggedForReview?: boolean;
  flaggedAt?: Date | null;
  createdAt: Date;
}

export interface IFarmerFeedbackFilterQuery {
  startDate?: string | Date;
  endDate?: string | Date;
  domain?: string;
  state?: string;
  crop?: string;
  language?: string;
  source?: string;
  isHelpful?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface IFarmerFeedbackStats {
  totalFeedbacks: number;
  positiveCount: number;
  negativeCount: number;
  helpfulnessPercentage: number;
  totalGDBEntriesEvaluated: number;
  totalFlaggedEntries: number;
}

export interface IDomainBreakdown {
  domain: string;
  total: number;
  positive: number;
  negative: number;
  helpfulnessPercentage: number;
}

export interface ILanguageBreakdown {
  language: string;
  total: number;
  positive: number;
  negative: number;
  helpfulnessPercentage: number;
}

export interface IStateBreakdown {
  state: string;
  total: number;
  positive: number;
  negative: number;
  helpfulnessPercentage: number;
}

export interface IGDBFeedbackSummary {
  questionId: string;
  questionText?: string;
  domain?: string;
  crop?: string;
  state?: string;
  totalFeedbacks: number;
  positiveCount: number;
  negativeCount: number;
  helpfulnessPercentage: number;
  status: 'healthy' | 'at_risk' | 'flagged';
  flaggedForReview?: boolean;
  lastFeedbackAt: Date;
}

export interface IWeeklyDigestReport {
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  overallMetrics: IFarmerFeedbackStats;
  lowestRatedGDBEntries: IGDBFeedbackSummary[];
  topComplaintDomains: IDomainBreakdown[];
  recommendations: string[];
}
