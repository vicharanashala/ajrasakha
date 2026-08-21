import {
  IFarmerFeedback,
  IFarmerFeedbackFilterQuery,
  IFarmerFeedbackStats,
  IDomainBreakdown,
  ILanguageBreakdown,
  IStateBreakdown,
  IGDBFeedbackSummary,
  IWeeklyDigestReport,
} from '#root/shared/interfaces/farmerFeedback.js';

export interface SubmitFarmerFeedbackDTO {
  questionId: string;
  phoneNumber?: string;
  threadId?: string;
  messageId?: string;
  queryText?: string;
  deliveredAnswer?: string;
  source?: 'WHATSAPP' | 'AJRASAKHA' | 'ANNAM' | 'WEBAPP';
  gdbMatched?: boolean;
  rating: 1 | 2; // 1 = Yes/Helpful, 2 = No/Not Helpful
  feedbackText?: string;
  domain?: string;
  crop?: string;
  state?: string;
  district?: string;
  language?: string;
}

export interface AutoFlaggingResult {
  message: string;
  totalEvaluated: number;
  flaggedCount: number;
  flaggedQuestionIds: string[];
  details: Array<{
    questionId: string;
    totalResponses: number;
    positiveCount: number;
    helpfulnessPercentage: number;
    questionText?: string;
  }>;
}

export interface IFarmerFeedbackService {
  submitFeedback(dto: SubmitFarmerFeedbackDTO): Promise<IFarmerFeedback>;
  getMetrics(query?: IFarmerFeedbackFilterQuery): Promise<IFarmerFeedbackStats>;
  getBreakdowns(query?: IFarmerFeedbackFilterQuery): Promise<{
    domains: IDomainBreakdown[];
    languages: ILanguageBreakdown[];
    states: IStateBreakdown[];
  }>;
  getGDBFeedbackSummaries(
    query?: IFarmerFeedbackFilterQuery,
  ): Promise<{ summaries: IGDBFeedbackSummary[]; total: number }>;
  runAutoFlaggingPipeline(
    thresholdPercentage?: number,
    minResponses?: number,
  ): Promise<AutoFlaggingResult>;
  generateWeeklyDigestReport(): Promise<IWeeklyDigestReport>;
  flagGDBEntryManually(questionId: string, reason?: string): Promise<void>;
}
