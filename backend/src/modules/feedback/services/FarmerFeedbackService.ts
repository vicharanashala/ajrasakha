import { injectable, inject } from 'inversify';
import {
  IFarmerFeedbackService,
  IFeedbackAnalyticsResponse,
  IHelpfulnessRateSummary,
  IWeeklyFeedbackDigestReport,
} from '../interfaces/IFeedback.js';
import { FarmerFeedbackRepository } from '../models/FarmerFeedbackModel.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { IQuestionRepository } from '#shared/database/interfaces/IQuestionRepository.js';

@injectable()
export class FarmerFeedbackService implements IFarmerFeedbackService {
  constructor(
    @inject(FarmerFeedbackRepository)
    private readonly feedbackRepo: FarmerFeedbackRepository,
    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,
  ) {}

  async recordFeedback(data: {
    phoneNumber?: string;
    userId?: string;
    reply: '1' | '2';
    gdbEntryId: string;
    questionId?: string;
    domain?: string;
    language?: string;
    state?: string;
  }): Promise<{ success: boolean; feedbackId: string; isHelpful: boolean; reReviewTriggered: boolean }> {
    const isHelpful = data.reply === '1';

    const feedbackId = await this.feedbackRepo.createFeedback({
      gdbEntryId: data.gdbEntryId,
      questionId: data.questionId,
      userId: data.userId,
      phoneNumber: data.phoneNumber,
      reply: data.reply,
      isHelpful,
      domain: data.domain || 'General',
      language: data.language || 'en',
      state: data.state || 'Unknown',
    });

    let reReviewTriggered = false;
    if (!isHelpful) {
      // Check whether automated re-review threshold is reached
      const triggerRes = await this.triggerReReviewForEntry(data.gdbEntryId);
      reReviewTriggered = triggerRes.success;
    }

    return { success: true, feedbackId, isHelpful, reReviewTriggered };
  }

  async triggerReReviewForEntry(gdbEntryId: string): Promise<{ success: boolean; message: string }> {
    const feedbacks = await this.feedbackRepo.getFeedbacksByGdbEntryId(gdbEntryId);
    const totalRatings = feedbacks.length;
    const notHelpfulCount = feedbacks.filter(f => !f.isHelpful).length;
    const helpfulCount = feedbacks.filter(f => f.isHelpful).length;

    // Trigger re-review if overall helpfulness is < 50% (with at least 3 ratings)
    // or if the last 2 consecutive replies were negative ('2')
    const lastTwoNegative =
      feedbacks.length >= 2 &&
      feedbacks[0].reply === '2' &&
      feedbacks[1].reply === '2';

    const helpfulnessRate = totalRatings > 0 ? (helpfulCount / totalRatings) * 100 : 100;

    if (lastTwoNegative || (totalRatings >= 3 && helpfulnessRate < 50)) {
      try {
        await this.questionRepo.updateQuestionStatus(gdbEntryId, 're_review_required' as any);
        console.log(`[FarmerFeedbackService] Triggered re-review for GDB Entry ${gdbEntryId}`);
        return { success: true, message: `Re-review triggered for GDB Entry ${gdbEntryId}` };
      } catch (err) {
        console.error(`[FarmerFeedbackService] Failed to update status in QuestionRepo:`, err);
      }
    }

    return { success: false, message: 'Threshold not met for re-review' };
  }

  private aggregateHelpfulness(feedbacks: any[], keySelector: (f: any) => string): IHelpfulnessRateSummary[] {
    const map = new Map<string, { total: number; helpful: number }>();

    for (const f of feedbacks) {
      const key = keySelector(f) || 'Unknown';
      if (!map.has(key)) {
        map.set(key, { total: 0, helpful: 0 });
      }
      const entry = map.get(key)!;
      entry.total += 1;
      if (f.isHelpful) {
        entry.helpful += 1;
      }
    }

    const summaries: IHelpfulnessRateSummary[] = [];
    for (const [key, val] of map.entries()) {
      summaries.push({
        key,
        label: key,
        totalRatings: val.total,
        helpfulCount: val.helpful,
        notHelpfulCount: val.total - val.helpful,
        helpfulnessRatePct: Math.round((val.helpful / val.total) * 1000) / 10,
      });
    }

    return summaries.sort((a, b) => b.totalRatings - a.totalRatings);
  }

  async getHelpfulnessAnalytics(filters?: {
    domain?: string;
    language?: string;
    state?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<IFeedbackAnalyticsResponse> {
    const query: Record<string, any> = {};
    if (filters?.domain) query.domain = filters.domain;
    if (filters?.language) query.language = filters.language;
    if (filters?.state) query.state = filters.state;

    const allFeedbacks = await this.feedbackRepo.getAllFeedbacks(query);
    const totalFeedbacks = allFeedbacks.length;
    const helpfulTotal = allFeedbacks.filter(f => f.isHelpful).length;
    const overallHelpfulnessRatePct =
      totalFeedbacks > 0 ? Math.round((helpfulTotal / totalFeedbacks) * 1000) / 10 : 0;

    return {
      totalFeedbacks,
      overallHelpfulnessRatePct,
      byGdbEntry: this.aggregateHelpfulness(allFeedbacks, f => f.gdbEntryId),
      byDomain: this.aggregateHelpfulness(allFeedbacks, f => f.domain || 'General'),
      byLanguage: this.aggregateHelpfulness(allFeedbacks, f => f.language || 'en'),
      byState: this.aggregateHelpfulness(allFeedbacks, f => f.state || 'Unknown'),
    };
  }

  async getWeeklyDigest(): Promise<IWeeklyFeedbackDigestReport> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentFeedbacks = await this.feedbackRepo.getAllFeedbacks({
      createdAt: { $gte: sevenDaysAgo },
    });

    const totalFeedbacksCollected = recentFeedbacks.length;
    const helpfulCount = recentFeedbacks.filter(f => f.isHelpful).length;
    const overallHelpfulnessPct =
      totalFeedbacksCollected > 0 ? Math.round((helpfulCount / totalFeedbacksCollected) * 1000) / 10 : 0;

    const byGdb = this.aggregateHelpfulness(recentFeedbacks, f => f.gdbEntryId);
    const lowPerformingEntries = byGdb
      .filter(entry => entry.helpfulnessRatePct < 60 && entry.totalRatings >= 1)
      .map(entry => ({
        gdbEntryId: entry.key,
        totalRatings: entry.totalRatings,
        helpfulCount: entry.helpfulCount,
        notHelpfulCount: entry.notHelpfulCount,
        helpfulnessRatePct: entry.helpfulnessRatePct,
        reReviewTriggered: entry.helpfulnessRatePct < 50 || entry.notHelpfulCount >= 2,
      }));

    return {
      weekStartDate: sevenDaysAgo.toISOString().split('T')[0],
      weekEndDate: now.toISOString().split('T')[0],
      totalFeedbacksCollected,
      overallHelpfulnessPct,
      lowPerformingEntries,
      domainBreakdown: this.aggregateHelpfulness(recentFeedbacks, f => f.domain || 'General'),
    };
  }
}
