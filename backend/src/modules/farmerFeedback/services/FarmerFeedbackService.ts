import { inject, injectable } from 'inversify';
import { IFarmerFeedbackService, SubmitFarmerFeedbackDTO, AutoFlaggingResult } from '../interfaces/IFarmerFeedbackService.js';
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
import { IFarmerFeedbackRepository } from '#root/shared/database/interfaces/IFarmerFeedbackRepository.js';
import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { FARMER_FEEDBACK_TYPES } from '../types.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { ObjectId } from 'mongodb';

@injectable()
export class FarmerFeedbackService implements IFarmerFeedbackService {
  constructor(
    @inject(FARMER_FEEDBACK_TYPES.FarmerFeedbackRepository)
    private readonly farmerFeedbackRepo: IFarmerFeedbackRepository,
    @inject(CORE_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,
  ) {}

  async submitFeedback(dto: SubmitFarmerFeedbackDTO): Promise<IFarmerFeedback> {
    let domain = dto.domain;
    let crop = dto.crop;
    let state = dto.state;
    let queryText = dto.queryText;
    let deliveredAnswer = dto.deliveredAnswer;

    // Enrich from question repository if metadata is missing and questionId is valid ObjectId
    if (dto.questionId && ObjectId.isValid(dto.questionId)) {
      try {
        const question = await this.questionRepo.getById(dto.questionId);
        if (question) {
          queryText = queryText || question.question || question.originalQuestion || '';
          deliveredAnswer = deliveredAnswer || question.aiApprovedAnswer || question.aiInitialAnswer || '';
          if (question.details) {
            domain = domain || (Array.isArray(question.details.domain) ? question.details.domain[0] : question.details.domain);
            crop = crop || (typeof question.details.crop === 'string' ? question.details.crop : question.details.crop?.name) || question.details.normalised_crop;
            state = state || question.details.state;
          }
        }
      } catch (err) {
        console.warn(`[FarmerFeedbackService] Failed to enrich question ${dto.questionId}:`, err);
      }
    }


    const created = await this.farmerFeedbackRepo.create({
      questionId: dto.questionId,
      phoneNumber: dto.phoneNumber,
      threadId: dto.threadId,
      messageId: dto.messageId,
      queryText,
      deliveredAnswer,
      source: dto.source || 'WHATSAPP',
      gdbMatched: dto.gdbMatched ?? true,
      rating: dto.rating,
      isHelpful: dto.rating === 1,
      feedbackText: dto.feedbackText,
      domain: domain || 'General Agriculture',
      crop: crop || 'General',
      state: state || 'National',
      district: dto.district,
      language: dto.language || 'hi',
      flaggedForReview: false,
      createdAt: new Date(),
    });

    console.log(`[FarmerFeedbackService] Feedback submitted for question ${dto.questionId} - Rating: ${dto.rating}`);
    return created;
  }

  async getMetrics(query?: IFarmerFeedbackFilterQuery): Promise<IFarmerFeedbackStats> {
    return this.farmerFeedbackRepo.getMetrics(query);
  }

  async getBreakdowns(query?: IFarmerFeedbackFilterQuery): Promise<{
    domains: IDomainBreakdown[];
    languages: ILanguageBreakdown[];
    states: IStateBreakdown[];
  }> {
    const [domains, languages, states] = await Promise.all([
      this.farmerFeedbackRepo.getDomainBreakdown(query),
      this.farmerFeedbackRepo.getLanguageBreakdown(query),
      this.farmerFeedbackRepo.getStateBreakdown(query),
    ]);

    return { domains, languages, states };
  }

  async getGDBFeedbackSummaries(
    query?: IFarmerFeedbackFilterQuery,
  ): Promise<{ summaries: IGDBFeedbackSummary[]; total: number }> {
    return this.farmerFeedbackRepo.getGDBFeedbackSummaries(query);
  }

  async runAutoFlaggingPipeline(
    thresholdPercentage = 60,
    minResponses = 10,
  ): Promise<AutoFlaggingResult> {
    console.log(
      `[FarmerFeedbackService] Running auto-flagging pipeline (threshold: <${thresholdPercentage}%, minResponses: ${minResponses})`,
    );

    const lowRatedEntries = await this.farmerFeedbackRepo.findLowRatedGDBEntries(
      thresholdPercentage,
      minResponses,
    );

    const flaggedQuestionIds: string[] = [];
    const details: AutoFlaggingResult['details'] = [];

    for (const entry of lowRatedEntries) {
      const qid = entry.questionId;
      try {
        // 1. Add feedback to question in reviewer system queue (also sets autoAllocateFeedback: true)
        await this.questionRepo.addFeedback(qid, {
          source: 'farmer_whatsapp',
          status: 'open',
          recentFeedback: new Date(),
        });

        // 2. Mark feedback records in farmer_feedbacks as flagged
        await this.farmerFeedbackRepo.markAsFlagged(qid);

        flaggedQuestionIds.push(qid);
        details.push({
          questionId: qid,
          totalResponses: entry.totalFeedbacks,
          positiveCount: entry.positiveCount,
          helpfulnessPercentage: entry.helpfulnessPercentage,
          questionText: entry.questionText,
        });

        console.log(
          `[FarmerFeedbackService] Auto-flagged GDB Question ${qid} (Score: ${entry.helpfulnessPercentage}%, Total: ${entry.totalFeedbacks})`,
        );
      } catch (err) {
        console.error(`[FarmerFeedbackService] Error auto-flagging question ${qid}:`, err);
      }
    }

    return {
      message: `Auto-flagging completed. Flagged ${flaggedQuestionIds.length} low-rated GDB entries.`,
      totalEvaluated: lowRatedEntries.length,
      flaggedCount: flaggedQuestionIds.length,
      flaggedQuestionIds,
      details,
    };
  }

  async flagGDBEntryManually(questionId: string, reason?: string): Promise<void> {
    await this.questionRepo.addFeedback(questionId, {
      source: 'farmer_whatsapp',
      status: 'open',
      recentFeedback: new Date(),
    });
    await this.farmerFeedbackRepo.markAsFlagged(questionId);
    console.log(`[FarmerFeedbackService] Manually flagged GDB question ${questionId}. Reason: ${reason || 'Manual review request'}`);
  }


  async generateWeeklyDigestReport(): Promise<IWeeklyDigestReport> {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const periodEnd = now;

    const weeklyFilter: IFarmerFeedbackFilterQuery = {
      startDate: periodStart,
      endDate: periodEnd,
    };

    const [overallMetrics, lowestRatedEntriesRes, domainBreakdown] = await Promise.all([
      this.farmerFeedbackRepo.getMetrics(weeklyFilter),
      this.farmerFeedbackRepo.getGDBFeedbackSummaries({
        ...weeklyFilter,
        limit: 10,
      }),
      this.farmerFeedbackRepo.getDomainBreakdown(weeklyFilter),
    ]);

    // Filter lowest rated entries
    const lowestRated = lowestRatedEntriesRes.summaries
      .filter(s => s.totalFeedbacks >= 3)
      .sort((a, b) => a.helpfulnessPercentage - b.helpfulnessPercentage)
      .slice(0, 10);

    const topComplaintDomains = domainBreakdown
      .filter(d => d.total >= 5 && d.helpfulnessPercentage < 75)
      .sort((a, b) => a.helpfulnessPercentage - b.helpfulnessPercentage);

    const recommendations: string[] = [];

    if (overallMetrics.helpfulnessPercentage < 70) {
      recommendations.push('Overall weekly helpfulness is below 70%. Review recent high-volume advisory responses.');
    }

    if (topComplaintDomains.length > 0) {
      topComplaintDomains.forEach(d => {
        recommendations.push(
          `Domain "${d.domain}" has a low satisfaction score (${d.helpfulnessPercentage}%). Consider reviewing standard Package of Practices (PoP) answers for this domain.`,
        );
      });
    }

    if (lowestRated.length > 0) {
      recommendations.push(
        `${lowestRated.length} GDB entries received repetitive negative feedback this week. Prioritize expert revision on these questions.`,
      );
    } else {
      recommendations.push('No acute GDB quality outliers detected for the current week.');
    }

    return {
      generatedAt: now,
      periodStart,
      periodEnd,
      overallMetrics,
      lowestRatedGDBEntries: lowestRated,
      topComplaintDomains,
      recommendations,
    };
  }
}
