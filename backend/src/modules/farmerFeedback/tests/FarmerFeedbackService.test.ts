import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FarmerFeedbackService } from '../services/FarmerFeedbackService.js';
import { ObjectId } from 'mongodb';

describe('FarmerFeedbackService', () => {
  let service: FarmerFeedbackService;
  let mockFarmerFeedbackRepo: any;
  let mockQuestionRepo: any;

  beforeEach(() => {
    mockFarmerFeedbackRepo = {
      create: vi.fn().mockImplementation((fb) => Promise.resolve({ ...fb, _id: new ObjectId() })),
      getMetrics: vi.fn().mockResolvedValue({
        totalFeedbacks: 100,
        positiveCount: 85,
        negativeCount: 15,
        helpfulnessPercentage: 85,
        totalGDBEntriesEvaluated: 40,
        totalFlaggedEntries: 2,
      }),
      getDomainBreakdown: vi.fn().mockResolvedValue([
        { domain: 'Pest & Disease', total: 60, positive: 55, negative: 5, helpfulnessPercentage: 91.67 },
      ]),
      getLanguageBreakdown: vi.fn().mockResolvedValue([
        { language: 'hi', total: 80, positive: 70, negative: 10, helpfulnessPercentage: 87.5 },
      ]),
      getStateBreakdown: vi.fn().mockResolvedValue([
        { state: 'Punjab', total: 50, positive: 45, negative: 5, helpfulnessPercentage: 90 },
      ]),
      getGDBFeedbackSummaries: vi.fn().mockResolvedValue({
        summaries: [
          {
            questionId: '64df8a9b1c2d3e4f5a6b7c8d',
            questionText: 'What is the dosage for yellow rust?',
            domain: 'Pest & Disease',
            crop: 'Wheat',
            state: 'Punjab',
            totalFeedbacks: 12,
            positiveCount: 5,
            negativeCount: 7,
            helpfulnessPercentage: 41.67,
            status: 'flagged',
            flaggedForReview: true,
            lastFeedbackAt: new Date(),
          },
        ],
        total: 1,
      }),
      findLowRatedGDBEntries: vi.fn().mockResolvedValue([
        {
          questionId: '64df8a9b1c2d3e4f5a6b7c8d',
          questionText: 'What is the dosage for yellow rust?',
          domain: 'Pest & Disease',
          crop: 'Wheat',
          state: 'Punjab',
          totalFeedbacks: 12,
          positiveCount: 5,
          negativeCount: 7,
          helpfulnessPercentage: 41.67,
          status: 'flagged',
          flaggedForReview: false,
          lastFeedbackAt: new Date(),
        },
      ]),
      markAsFlagged: vi.fn().mockResolvedValue(undefined),
    };

    mockQuestionRepo = {
      getById: vi.fn().mockResolvedValue({
        _id: new ObjectId('64df8a9b1c2d3e4f5a6b7c8d'),
        question: 'What is the dosage for yellow rust?',
        details: {
          domain: ['Pest & Disease'],
          crop: 'Wheat',
          state: 'Punjab',
        },
        aiApprovedAnswer: 'Spray Propiconazole @ 1ml/litre.',
      }),
      addFeedback: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    service = new FarmerFeedbackService(mockFarmerFeedbackRepo, mockQuestionRepo);
  });

  describe('submitFeedback', () => {
    it('submits a helpful feedback (rating = 1) and enriches metadata from questionRepo', async () => {
      const result = await service.submitFeedback({
        questionId: '64df8a9b1c2d3e4f5a6b7c8d',
        rating: 1,
        source: 'WHATSAPP',
      });

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith('64df8a9b1c2d3e4f5a6b7c8d');
      expect(mockFarmerFeedbackRepo.create).toHaveBeenCalled();
      expect(result.isHelpful).toBe(true);
      expect(result.rating).toBe(1);
      expect(result.crop).toBe('Wheat');
      expect(result.domain).toBe('Pest & Disease');
    });

    it('submits a negative feedback (rating = 2)', async () => {
      const result = await service.submitFeedback({
        questionId: '64df8a9b1c2d3e4f5a6b7c8d',
        rating: 2,
        feedbackText: 'Dosage was not clear.',
        source: 'WHATSAPP',
      });

      expect(result.isHelpful).toBe(false);
      expect(result.rating).toBe(2);
      expect(result.feedbackText).toBe('Dosage was not clear.');
    });
  });

  describe('runAutoFlaggingPipeline', () => {
    it('scans for low-rated GDB entries and injects feedback into the reviewer queue', async () => {
      const result = await service.runAutoFlaggingPipeline(60, 10);

      expect(mockFarmerFeedbackRepo.findLowRatedGDBEntries).toHaveBeenCalledWith(60, 10);
      expect(mockQuestionRepo.addFeedback).toHaveBeenCalledWith(
        '64df8a9b1c2d3e4f5a6b7c8d',
        expect.objectContaining({
          source: 'farmer_whatsapp',
          status: 'open',
        }),
      );
      expect(mockFarmerFeedbackRepo.markAsFlagged).toHaveBeenCalledWith('64df8a9b1c2d3e4f5a6b7c8d');
      expect(result.flaggedCount).toBe(1);
      expect(result.flaggedQuestionIds).toContain('64df8a9b1c2d3e4f5a6b7c8d');
    });
  });

  describe('generateWeeklyDigestReport', () => {
    it('generates summary report with actionable recommendations', async () => {
      const report = await service.generateWeeklyDigestReport();

      expect(report).toBeDefined();
      expect(report.overallMetrics.helpfulnessPercentage).toBe(85);
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.lowestRatedGDBEntries.length).toBe(1);
    });
  });
});
