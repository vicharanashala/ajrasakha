import { ClientSession } from 'mongodb';
import {
  IFarmerFeedback,
  IFarmerFeedbackFilterQuery,
  IFarmerFeedbackStats,
  IDomainBreakdown,
  ILanguageBreakdown,
  IStateBreakdown,
  IGDBFeedbackSummary,
} from '#root/shared/interfaces/farmerFeedback.js';

export interface IFarmerFeedbackRepository {
  create(
    feedback: Omit<IFarmerFeedback, '_id'>,
    session?: ClientSession,
  ): Promise<IFarmerFeedback>;

  getMetrics(
    query?: IFarmerFeedbackFilterQuery,
    session?: ClientSession,
  ): Promise<IFarmerFeedbackStats>;

  getDomainBreakdown(
    query?: IFarmerFeedbackFilterQuery,
    session?: ClientSession,
  ): Promise<IDomainBreakdown[]>;

  getLanguageBreakdown(
    query?: IFarmerFeedbackFilterQuery,
    session?: ClientSession,
  ): Promise<ILanguageBreakdown[]>;

  getStateBreakdown(
    query?: IFarmerFeedbackFilterQuery,
    session?: ClientSession,
  ): Promise<IStateBreakdown[]>;

  getGDBFeedbackSummaries(
    query?: IFarmerFeedbackFilterQuery,
    session?: ClientSession,
  ): Promise<{ summaries: IGDBFeedbackSummary[]; total: number }>;

  findLowRatedGDBEntries(
    thresholdPercentage?: number,
    minResponses?: number,
    session?: ClientSession,
  ): Promise<IGDBFeedbackSummary[]>;

  markAsFlagged(
    questionId: string,
    session?: ClientSession,
  ): Promise<void>;

  findRecentFeedbacks(
    limit?: number,
    session?: ClientSession,
  ): Promise<IFarmerFeedback[]>;
}
