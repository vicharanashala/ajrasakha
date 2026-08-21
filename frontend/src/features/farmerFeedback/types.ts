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
  lastFeedbackAt: string;
}

export interface IWeeklyDigestReport {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  overallMetrics: IFarmerFeedbackStats;
  lowestRatedGDBEntries: IGDBFeedbackSummary[];
  topComplaintDomains: IDomainBreakdown[];
  recommendations: string[];
}

export interface IFeedbackFilterState {
  startDate?: string;
  endDate?: string;
  domain?: string;
  state?: string;
  crop?: string;
  language?: string;
  source?: string;
  isHelpful?: boolean;
  search?: string;
  page: number;
  limit: number;
}
