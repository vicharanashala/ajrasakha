import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnswerService } from '../services/AnswerService.js';

describe('AnswerService Facade and Core Operations', () => {
  let service: AnswerService;
  let mockAiService: any;
  let mockAnswerRepo: any;
  let mockQuestionRepo: any;
  let mockMongoDb: any;
  let mockReviewService: any;
  let mockApprovalService: any;
  let mockSubmissionService: any;
  let mockAnswerAiService: any;
  let mockFaqService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAiService = {
      getEmbedding: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2] }),
    };

    mockAnswerRepo = {
      getByAuthorId: vi.fn().mockResolvedValue(null),
      addAnswer: vi.fn().mockResolvedValue({ insertedId: 'ans123' }),
      getById: vi.fn().mockResolvedValue({ _id: 'ans123', isFinalAnswer: false }),
      deleteAnswer: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      incrementApprovalCount: vi.fn().mockResolvedValue(1),
    };

    mockQuestionRepo = {
      getById: vi.fn().mockResolvedValue({ _id: 'q123', totalAnswersCount: 2, status: 'in-review' }),
      updateQuestion: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    const mockSession = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    };

    mockMongoDb = {
      getClient: vi.fn().mockResolvedValue({
        startSession: vi.fn().mockReturnValue(mockSession),
      }),
    };

    mockReviewService = {
      reviewAnswer: vi.fn().mockResolvedValue({ message: 'Review recorded' }),
      reRouteReviewAnswer: vi.fn().mockResolvedValue({ message: 'Reroute review recorded' }),
    };

    mockApprovalService = {
      approveAnswer: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      approveLLMAnswer: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      confirmDuplicate: vi.fn().mockResolvedValue({ status: 'closed', closed: true }),
    };

    mockSubmissionService = {
      getSubmissions: vi.fn().mockResolvedValue([{ questionId: 'q123' }]),
      getFinalAnswerQuestions: vi.fn().mockResolvedValue({ finalizedSubmissions: [] }),
    };

    mockAnswerAiService = {
      fetchAiInitialAnswer: vi.fn().mockResolvedValue({ answer: 'AI drafted answer' }),
    };

    mockFaqService = {
      goldenFaq: vi.fn().mockResolvedValue({ faqs: [], totalFaqs: 0 }),
    };

    service = new AnswerService(
      mockAiService,
      mockAnswerRepo,
      mockQuestionRepo,
      mockMongoDb,
      mockReviewService,
      mockApprovalService,
      mockSubmissionService,
      mockAnswerAiService,
      mockFaqService,
    );
  });

  describe('Core CRUD methods', () => {
    it('addAnswer adds an answer and updates totalAnswersCount', async () => {
      const result = await service.addAnswer('q123', 'user1', 'Answer text', [], undefined);

      expect(result).toEqual({ insertedId: 'ans123', isFinalAnswer: false });
      expect(mockAnswerRepo.addAnswer).toHaveBeenCalled();
      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        'q123',
        expect.objectContaining({ totalAnswersCount: 3 }),
        expect.anything(),
      );
    });

    it('getAnswerById fetches answer by ID from repo', async () => {
      const result = await service.getAnswerById('ans123');
      expect(result).toEqual({ _id: 'ans123', isFinalAnswer: false });
      expect(mockAnswerRepo.getById).toHaveBeenCalledWith('ans123');
    });

    it('deleteAnswer deletes answer and decrements question count', async () => {
      const result = await service.deleteAnswer('q123', 'ans123');
      expect(result).toEqual({ deletedCount: 1 });
      expect(mockAnswerRepo.deleteAnswer).toHaveBeenCalledWith('ans123', expect.anything());
      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        'q123',
        expect.objectContaining({ totalAnswersCount: 1 }),
        expect.anything(),
      );
    });

    it('incrementApprovalCount increments approval count in repo', async () => {
      const result = await service.incrementApprovalCount('ans123');
      expect(result).toBe(1);
      expect(mockAnswerRepo.incrementApprovalCount).toHaveBeenCalledWith('ans123', undefined);
    });
  });

  describe('Delegation to sub-services', () => {
    it('delegates reviewAnswer to answerReviewService', async () => {
      const body = { questionId: 'q123', status: 'accepted' } as any;
      const res = await service.reviewAnswer('user1', body);
      expect(mockReviewService.reviewAnswer).toHaveBeenCalledWith('user1', body);
      expect(res).toEqual({ message: 'Review recorded' });
    });

    it('delegates reRouteReviewAnswer to answerReviewService', async () => {
      const body = { questionId: 'q123', status: 'accepted' } as any;
      const res = await service.reRouteReviewAnswer('user1', body);
      expect(mockReviewService.reRouteReviewAnswer).toHaveBeenCalledWith('user1', body);
      expect(res).toEqual({ message: 'Reroute review recorded' });
    });

    it('delegates approveAnswer to answerApprovalService', async () => {
      const updates = { questionId: 'q123', answer: 'Approved' } as any;
      const res = await service.approveAnswer('mod1', updates);
      expect(mockApprovalService.approveAnswer).toHaveBeenCalledWith('mod1', updates);
      expect(res).toEqual({ modifiedCount: 1 });
    });

    it('delegates approveLLMAnswer to answerApprovalService', async () => {
      const updates = { questionId: 'q123', source: 'WHATSAPP' } as any;
      const res = await service.approveLLMAnswer('mod1', updates);
      expect(mockApprovalService.approveLLMAnswer).toHaveBeenCalledWith('mod1', updates);
      expect(res).toEqual({ modifiedCount: 1 });
    });

    it('delegates confirmDuplicate to answerApprovalService', async () => {
      const res = await service.confirmDuplicate('gk1', 'q123');
      expect(mockApprovalService.confirmDuplicate).toHaveBeenCalledWith('gk1', 'q123');
      expect(res).toEqual({ status: 'closed', closed: true });
    });

    it('delegates getSubmissions to answerSubmissionService', async () => {
      const res = await service.getSubmissions('user1', 1, 10);
      expect(mockSubmissionService.getSubmissions).toHaveBeenCalledWith('user1', 1, 10, undefined, undefined, undefined);
      expect(res).toEqual([{ questionId: 'q123' }]);
    });

    it('delegates getFinalAnswerQuestions to answerSubmissionService', async () => {
      const res = await service.getFinalAnswerQuestions('user1', 'curUser', '2026-08-21', 'closed');
      expect(mockSubmissionService.getFinalAnswerQuestions).toHaveBeenCalledWith('user1', 'curUser', '2026-08-21', 'closed');
      expect(res).toEqual({ finalizedSubmissions: [] });
    });

    it('delegates fetchAiInitialAnswer to answerAiService', async () => {
      const body = { question: 'How to grow rice?' } as any;
      const res = await service.fetchAiInitialAnswer(body);
      expect(mockAnswerAiService.fetchAiInitialAnswer).toHaveBeenCalledWith(body);
      expect(res).toEqual({ answer: 'AI drafted answer' });
    });

    it('delegates goldenFaq to answerFaqService', async () => {
      const res = await service.goldenFaq('user1', 1, 10, 'rice');
      expect(mockFaqService.goldenFaq).toHaveBeenCalledWith('user1', 1, 10, 'rice');
      expect(res).toEqual({ faqs: [], totalFaqs: 0 });
    });
  });
});
