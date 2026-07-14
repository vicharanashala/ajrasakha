import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BadRequestError} from 'routing-controllers';
import {triggerWebhook} from '../utils/triggerWebhook.js';
import {AnswerService} from '../services/AnswerService.js';
import {appConfig} from '#root/config/app.js';
vi.mock('../utils/triggerWebhook.js', () => ({
  triggerWebhook: vi.fn(),
}));

describe('AnswerService', () => {
  let service: AnswerService;

  const mockAiService = {
    getEmbedding: vi.fn(),
    fetchAiInitialAnswer: vi.fn(),
  };

  const mockAnswerRepo = {
    addAnswer: vi.fn(),
    getByAuthorId: vi.fn(),
    getById: vi.fn(),
    updateAnswer: vi.fn(),
    updateAnswerStatus: vi.fn(),
    getByQuestionId: vi.fn(),
    incrementApprovalCount: vi.fn(),
    getModeratorActivityHistory: vi.fn(),
    getAdminActivityHistory: vi.fn(),
    deleteAnswer: vi.fn(),
    getGoldenFaqs: vi.fn(),
    approveLLMAnswer: vi.fn(),
    resetApprovalCount: vi.fn(),
    addAnswerModification: vi.fn(),
    findFinalAnswersByQuestionIds: vi.fn(),
    getFinalAnswersByQuestionIds: vi.fn(),
  };

  const mockReviewRepo = {
    createReview: vi.fn(),
    getAdminActivityHistory: vi.fn(),
  };

  const mockQuestionRepo = {
    getById: vi.fn(),
    updateQuestion: vi.fn(),
  };

  const mockQuestionSubmissionRepo = {
    getUserActivityHistory: vi.fn(),
    getByQuestionId: vi.fn(),
    clearCurrentExpertTracking: vi.fn(),
    update: vi.fn(),
    markQuestionOpenedByExpert: vi.fn(),
    updateHistoryByUserId: vi.fn(),
  };

  const mockUserRepo = {
    findById: vi.fn(),
    findModerators: vi.fn(),
    findAdmins: vi.fn(),
    updatePenaltyAndIncentive: vi.fn(),
    removeAssignedQuestion: vi.fn(),
    removeAssignedQuestionFromAllModerators: vi
      .fn()
      .mockResolvedValue(undefined),
    updateReputationScore: vi.fn(),
  };

  const mockQuestionService = {
    addDummyQuestions: vi.fn(),
    ensureNormalisedCrop: vi.fn(),
    autoAllocateExperts: vi.fn(),
    freeRoleAssigneeOnStatusChange: vi.fn().mockResolvedValue(undefined),
  };

  const mockNotificationService = {
    saveTheNotifications: vi.fn(),
  };

  const mockNotificationRepository = {};

  const mockReRouteRepository = {
    updateStatus: vi.fn(),
  };

  const mockDatabase = {};

  beforeEach(() => {
    // vi.clearAllMocks();
    vi.resetAllMocks();

    service = new AnswerService(
      mockAiService as any,
      mockAnswerRepo as any,
      mockReviewRepo as any,
      mockQuestionRepo as any,
      mockQuestionSubmissionRepo as any,
      mockUserRepo as any,
      mockQuestionService as any,
      mockNotificationService as any,
      mockNotificationRepository as any,
      mockReRouteRepository as any,
      mockDatabase as any,
    );

    // vi.spyOn(service as any, '_withTransaction').mockImplementation(
    //   async (callback: any) => callback({}),
    // );
    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => {
        return callback({});
      },
    );

    appConfig.ENABLE_AI_SERVER = false;
  });
  const moderatorId = '507f1f77bcf86cd799439011';
  const expertId = '507f1f77bcf86cd799439012';
  const questionId = '507f1f77bcf86cd799439013';
  const answerId = '507f1f77bcf86cd799439014';

  function setupApproveAnswer() {
    appConfig.isDevelopment = true;

    mockQuestionRepo.getById.mockResolvedValue({
      _id: questionId,
      question: 'Question',
      status: 'in-review',
      source: 'WEB',
      tag: '',
    });

    mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');
    mockQuestionService.freeRoleAssigneeOnStatusChange.mockResolvedValue(
      undefined,
    );

    mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

    mockUserRepo.findById
      .mockResolvedValueOnce({
        _id: moderatorId,
        role: 'moderator',
      })
      .mockResolvedValueOnce({
        _id: expertId,
        firstName: 'John',
        lastName: 'Doe',
      });

    mockAnswerRepo.getById.mockResolvedValue({
      _id: answerId,
      authorId: expertId,
    });

    mockUserRepo.updatePenaltyAndIncentive.mockResolvedValue(undefined);
    mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);
    mockUserRepo.removeAssignedQuestionFromAllModerators.mockResolvedValue(
      undefined,
    );

    mockAnswerRepo.updateAnswer.mockResolvedValue({
      modifiedCount: 1,
    });
  }

  function setupRejectedReview() {
    mockUserRepo.findById.mockResolvedValue({
      _id: expertId,
      role: 'expert',
    });

    mockQuestionRepo.getById.mockResolvedValue({
      _id: questionId,
      source: 'WEB',
      status: 'open',
      isAutoAllocate: false,
    });

    mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      queue: [expertId],
      history: [
        {
          updatedBy: expertId, // IMPORTANT: reviewer must equal current user
          answer: answerId,
          status: 'in-review',
        },
      ],
    });

    mockReviewRepo.createReview.mockResolvedValue({
      insertedId: '507f1f77bcf86cd799439099',
    });

    mockAnswerRepo.getById.mockResolvedValue({
      _id: answerId,
      answer: 'Old Answer',
      authorId: moderatorId,
    });

    vi.spyOn(service, 'addAnswer').mockResolvedValue({
      insertedId: '507f1f77bcf86cd799439015',
    } as any);

    mockUserRepo.updatePenaltyAndIncentive.mockResolvedValue(undefined);
    mockAnswerRepo.updateAnswerStatus.mockResolvedValue(undefined);
    mockQuestionSubmissionRepo.updateHistoryByUserId.mockResolvedValue(
      undefined,
    );
    mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);
    mockQuestionSubmissionRepo.clearCurrentExpertTracking.mockResolvedValue(
      undefined,
    );
    mockUserRepo.updateReputationScore.mockResolvedValue(undefined);
  }
  function setupModifiedReview() {
    mockUserRepo.findById.mockResolvedValue({
      _id: expertId,
      role: 'expert',
    });

    mockQuestionRepo.getById.mockResolvedValue({
      _id: questionId,
      source: 'WEB',
      status: 'open',
      isAutoAllocate: false,
    });

    mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      queue: [expertId],
      history: [
        {
          updatedBy: expertId,
          answer: answerId,
          status: 'in-review',
        },
      ],
    });

    mockReviewRepo.createReview.mockResolvedValue({
      insertedId: '507f1f77bcf86cd799439099',
    });

    mockAnswerRepo.getById.mockResolvedValue({
      _id: answerId,
      answer: 'Old Answer',
      authorId: expertId,
    });

    mockAnswerRepo.updateAnswer.mockResolvedValue({
      modifiedCount: 1,
    });

    mockAnswerRepo.resetApprovalCount.mockResolvedValue(undefined);

    mockAnswerRepo.addAnswerModification.mockResolvedValue(undefined);

    mockQuestionSubmissionRepo.updateHistoryByUserId.mockResolvedValue(
      undefined,
    );

    mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);

    mockQuestionSubmissionRepo.clearCurrentExpertTracking.mockResolvedValue(
      undefined,
    );

    mockUserRepo.updateReputationScore.mockResolvedValue(undefined);
  }
  function setupQueueAllocationReview() {
    mockUserRepo.findById.mockResolvedValue({
      _id: expertId,
      role: 'expert',
    });

    mockQuestionRepo.getById.mockResolvedValue({
      _id: questionId,
      question: 'Question',
      source: 'WEB',
      status: 'open',
      isAutoAllocate: false,
    });

    mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      queue: [expertId, '507f1f77bcf86cd799439099'],
      history: [
        {
          updatedBy: expertId,
          answer: answerId,
          status: 'in-review',
        },
      ],
    });

    mockReviewRepo.createReview.mockResolvedValue({
      insertedId: '507f1f77bcf86cd799439055',
    });

    mockAnswerRepo.getById.mockResolvedValue({
      _id: answerId,
      answer: 'Old Answer',
      authorId: expertId,
    });

    mockAnswerRepo.incrementApprovalCount.mockResolvedValue(1);

    mockQuestionSubmissionRepo.updateHistoryByUserId.mockResolvedValue(
      undefined,
    );

    mockQuestionSubmissionRepo.update.mockResolvedValue(undefined);

    mockUserRepo.updateReputationScore.mockResolvedValue(undefined);

    mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);

    mockQuestionSubmissionRepo.clearCurrentExpertTracking.mockResolvedValue(
      undefined,
    );

    mockQuestionService.autoAllocateExperts.mockResolvedValue(undefined);
  }
  function setupAcceptedReviewWithThreeApprovals() {
    setupQueueAllocationReview();

    mockAnswerRepo.incrementApprovalCount.mockResolvedValue(3);

    mockAnswerRepo.updateAnswerStatus.mockResolvedValue(undefined);

    mockQuestionSubmissionRepo.updateHistoryByUserId.mockResolvedValue(
      undefined,
    );

    mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

    mockQuestionSubmissionRepo.clearCurrentExpertTracking.mockResolvedValue(
      undefined,
    );

    mockUserRepo.updateReputationScore.mockResolvedValue(undefined);
  }
  function setupFirstSubmissionReview() {
    mockUserRepo.findById.mockResolvedValue({
      _id: expertId,
      role: 'expert',
    });

    mockQuestionRepo.getById.mockResolvedValue({
      _id: questionId,
      question: 'Question',
      source: 'WEB',
      status: 'open',
    });

    mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      queue: [expertId],
      history: [],
    });

    vi.spyOn(service, 'addAnswer').mockResolvedValue({
      insertedId: answerId,
    } as any);

    mockQuestionSubmissionRepo.update.mockResolvedValue(undefined);

    mockQuestionSubmissionRepo.clearCurrentExpertTracking.mockResolvedValue(
      undefined,
    );

    mockUserRepo.updateReputationScore.mockResolvedValue(undefined);
    mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

    mockQuestionSubmissionRepo.markQuestionOpenedByExpert.mockResolvedValue(
      undefined,
    );
  }
  function setupReviewCreation() {
    setupQueueAllocationReview();

    mockReviewRepo.createReview.mockResolvedValue({
      insertedId: '507f1f77bcf86cd799439055',
    });
  }
  describe('addAnswer', () => {
    it('adds answer successfully', async () => {
      appConfig.ENABLE_AI_SERVER = false;

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'open',
        totalAnswersCount: 2,
      });

      mockAnswerRepo.getByAuthorId.mockResolvedValue(null);

      mockAnswerRepo.addAnswer.mockResolvedValue({
        insertedId: 'answer-1',
      });
      mockQuestionService.freeRoleAssigneeOnStatusChange.mockResolvedValue(
        undefined,
      );
      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      const result = await service.addAnswer(
        'question-1',
        'author-1',
        'This is an answer',
        [],
      );

      expect(result).toEqual({
        insertedId: 'answer-1',
        isFinalAnswer: false,
      });

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith(
        'question-1',
        expect.anything(),
      );

      expect(mockAnswerRepo.getByAuthorId).toHaveBeenCalledWith(
        'author-1',
        'question-1',

        expect.anything(),
      );

      expect(mockAnswerRepo.addAnswer).toHaveBeenCalledTimes(1);

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledTimes(1);
    });
    it('throws when question does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.addAnswer('question-1', 'author-1', 'This is an answer', []),
      ).rejects.toThrow(BadRequestError);

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith(
        'question-1',
        expect.anything(),
      );

      expect(mockAnswerRepo.getByAuthorId).not.toHaveBeenCalled();
      expect(mockAnswerRepo.addAnswer).not.toHaveBeenCalled();
      expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();
    });
    it('throws when question is already closed', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'closed',
        totalAnswersCount: 2,
      });

      await expect(
        service.addAnswer('question-1', 'author-1', 'This is an answer', []),
      ).rejects.toThrow(BadRequestError);

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith(
        'question-1',
        expect.anything(),
      );

      expect(mockAnswerRepo.getByAuthorId).not.toHaveBeenCalled();
      expect(mockAnswerRepo.addAnswer).not.toHaveBeenCalled();
      expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();
    });
    it('throws when author has already submitted an answer', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'open',
        totalAnswersCount: 2,
      });

      mockAnswerRepo.getByAuthorId.mockResolvedValue({
        _id: 'existing-answer',
        authorId: 'author-1',
      });

      await expect(
        service.addAnswer('question-1', 'author-1', 'Another answer', []),
      ).rejects.toThrow(BadRequestError);

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith(
        'question-1',
        expect.anything(),
      );

      expect(mockAnswerRepo.getByAuthorId).toHaveBeenCalledWith(
        'author-1',
        'question-1',
        expect.anything(),
      );

      expect(mockAnswerRepo.addAnswer).not.toHaveBeenCalled();
      expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();
    });
    it('generates embeddings when AI server is enabled', async () => {
      appConfig.ENABLE_AI_SERVER = true;

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'open',
        totalAnswersCount: 0,
      });

      mockAnswerRepo.getByAuthorId.mockResolvedValue(null);

      mockAiService.getEmbedding.mockResolvedValue([0.11, 0.22, 0.33]);

      mockAnswerRepo.addAnswer.mockResolvedValue({
        insertedId: 'answer-1',
      });
      mockQuestionService.freeRoleAssigneeOnStatusChange.mockResolvedValue(
        undefined,
      );

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      await service.addAnswer(
        'question-1',
        'author-1',
        'AI generated answer',
        [],
      );

      expect(mockAiService.getEmbedding).toHaveBeenCalledTimes(1);

      expect(mockAiService.getEmbedding).toHaveBeenCalledWith(
        'AI generated answer',
      );

      expect(mockAnswerRepo.addAnswer).toHaveBeenCalled();

      appConfig.ENABLE_AI_SERVER = false;
    });
    it('throws when AI embedding generation fails', async () => {
      appConfig.ENABLE_AI_SERVER = true;

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'open',
        totalAnswersCount: 0,
      });

      mockAnswerRepo.getByAuthorId.mockResolvedValue(null);

      mockAiService.getEmbedding.mockRejectedValue(
        new Error('Embedding service unavailable'),
      );

      await expect(
        service.addAnswer('question-1', 'author-1', 'Sample answer', []),
      ).rejects.toThrow();

      expect(mockAiService.getEmbedding).toHaveBeenCalledTimes(1);

      expect(mockAnswerRepo.addAnswer).not.toHaveBeenCalled();

      expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();

      appConfig.ENABLE_AI_SERVER = false;
    });
    it('throws when addAnswer repository call fails', async () => {
      appConfig.ENABLE_AI_SERVER = false;

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'open',
        totalAnswersCount: 5,
      });

      mockAnswerRepo.getByAuthorId.mockResolvedValue(null);

      mockAnswerRepo.addAnswer.mockRejectedValue(
        new Error('Database write failed'),
      );

      await expect(
        service.addAnswer('question-1', 'author-1', 'Sample answer', []),
      ).rejects.toThrow('Database write failed');

      expect(mockAnswerRepo.addAnswer).toHaveBeenCalledTimes(1);

      expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();
    });
    it('throws when updating question fails after adding answer', async () => {
      appConfig.ENABLE_AI_SERVER = false;

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'open',
        totalAnswersCount: 2,
      });

      mockAnswerRepo.getByAuthorId.mockResolvedValue(null);

      mockAnswerRepo.addAnswer.mockResolvedValue({
        insertedId: 'answer-1',
      });
      mockQuestionService.freeRoleAssigneeOnStatusChange.mockResolvedValue(
        undefined,
      );
      mockQuestionRepo.updateQuestion.mockRejectedValue(
        new Error('Failed to update question'),
      );

      await expect(
        service.addAnswer('question-1', 'author-1', 'Sample answer', []),
      ).rejects.toThrow('Failed to update question');

      expect(mockAnswerRepo.addAnswer).toHaveBeenCalledTimes(1);

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledTimes(1);
    });
    it('uses provided session instead of creating a transaction', async () => {
      appConfig.ENABLE_AI_SERVER = false;

      const session = {} as any;

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'open',
        totalAnswersCount: 1,
      });

      mockAnswerRepo.getByAuthorId.mockResolvedValue(null);

      mockAnswerRepo.addAnswer.mockResolvedValue({
        insertedId: 'answer-1',
      });
      mockQuestionService.freeRoleAssigneeOnStatusChange.mockResolvedValue(
        undefined,
      );
      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      const transactionSpy = vi.spyOn(service as any, '_withTransaction');

      await service.addAnswer(
        'question-1',
        'author-1',
        'Sample answer',
        [],
        session,
      );

      expect(transactionSpy).not.toHaveBeenCalled();

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith(
        'question-1',
        session,
      );

      expect(mockAnswerRepo.getByAuthorId).toHaveBeenCalledWith(
        'author-1',
        'question-1',
        session,
      );

      expect(mockAnswerRepo.addAnswer).toHaveBeenCalled();

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalled();
    });
  });

  describe('fetchAiInitialAnswer', () => {
    it('returns AI generated answer successfully', async () => {
      const body = {
        query: 'How should I apply magnesium sulphate for paddy?',
        crop: 'Paddy',
        state: 'Punjab',
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: vi.fn().mockResolvedValue(
            JSON.stringify({
              answer: 'Apply magnesium sulphate at the recommended dosage.',
              sources: [],
            }),
          ),
        }),
      );

      const result = await service.fetchAiInitialAnswer(body);

      expect(result).toEqual({
        answer: 'Apply magnesium sulphate at the recommended dosage.',
        sources: [],
      });

      expect(fetch).toHaveBeenCalledTimes(1);

      const [url, options] = vi.mocked(fetch).mock.calls[0];

      expect(options).toEqual({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    });

    it('throws InternalServerError when AI service returns an error response', async () => {
      const body = {
        query: 'How should I apply magnesium sulphate for paddy?',
        crop: 'Paddy',
        state: 'Punjab',
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: vi.fn().mockResolvedValue('Internal AI error'),
        }),
      );

      await expect(service.fetchAiInitialAnswer(body)).rejects.toThrow(
        'AI answer service failed with status 500: Internal AI error',
      );
    });

    it('throws InternalServerError when fetch fails', async () => {
      const body = {
        query: 'How should I apply magnesium sulphate for paddy?',
        crop: 'Paddy',
        state: 'Punjab',
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network Error')),
      );

      await expect(service.fetchAiInitialAnswer(body)).rejects.toThrow(
        'Failed to fetch AI initial answer',
      );
    });

    it('returns plain text when AI service response is not valid JSON', async () => {
      const body = {
        query: 'How should I apply magnesium sulphate for paddy?',
        crop: 'Paddy',
        state: 'Punjab',
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: vi.fn().mockResolvedValue('Plain text response'),
        }),
      );

      const result = await service.fetchAiInitialAnswer(body);

      expect(result).toBe('Plain text response');
    });
  });

  describe('incrementApprovalCount', () => {
    it('increments approval count successfully', async () => {
      mockAnswerRepo.getById.mockResolvedValue({
        _id: 'answer-1',
      });

      mockAnswerRepo.incrementApprovalCount.mockResolvedValue(5);

      const result = await service.incrementApprovalCount('answer-1');

      expect(mockAnswerRepo.getById).toHaveBeenCalledWith('answer-1');

      expect(mockAnswerRepo.incrementApprovalCount).toHaveBeenCalledWith(
        'answer-1',
        undefined,
      );

      expect(result).toBe(5);
    });

    it('uses provided session', async () => {
      const session = {} as any;

      mockAnswerRepo.getById.mockResolvedValue({
        _id: 'answer-1',
      });

      mockAnswerRepo.incrementApprovalCount.mockResolvedValue(6);

      const result = await service.incrementApprovalCount('answer-1', session);

      expect(mockAnswerRepo.incrementApprovalCount).toHaveBeenCalledWith(
        'answer-1',
        session,
      );

      expect(result).toBe(6);
    });

    it('wraps repository errors in InternalServerError', async () => {
      mockAnswerRepo.getById.mockRejectedValue(new Error('Database failure'));

      await expect(service.incrementApprovalCount('answer-1')).rejects.toThrow(
        'Failed to increment approved count',
      );
    });

    it('throws when answer does not exist', async () => {
      mockAnswerRepo.getById.mockResolvedValue(null);

      await expect(service.incrementApprovalCount('answer-1')).rejects.toThrow(
        'Failed to increment approved count',
      );
    });
  });
  describe('getSubmissions', () => {
    it('returns expert activity history for expert user', async () => {
      const history = [{id: 'submission-1'}];

      mockUserRepo.findById.mockResolvedValue({
        _id: 'expert-1',
        role: 'expert',
      });

      mockQuestionSubmissionRepo.getUserActivityHistory.mockResolvedValue(
        history,
      );

      const result = await service.getSubmissions('expert-1', 1, 10);

      expect(result).toEqual(history);

      expect(
        mockQuestionSubmissionRepo.getUserActivityHistory,
      ).toHaveBeenCalledWith(
        'expert-1',
        1,
        10,
        undefined,
        expect.anything(),
        undefined,
      );
    });
    it('returns moderator activity history for moderator user', async () => {
      const history = [{id: 'moderation-1'}];

      mockUserRepo.findById.mockResolvedValue({
        _id: 'moderator-1',
        role: 'moderator',
      });

      mockAnswerRepo.getModeratorActivityHistory.mockResolvedValue(history);

      const result = await service.getSubmissions('moderator-1', 1, 10);

      expect(result).toEqual(history);

      expect(mockAnswerRepo.getModeratorActivityHistory).toHaveBeenCalledWith(
        'moderator-1',
        1,
        10,
        undefined,
        undefined,
        expect.anything(),
      );
    });
    it('returns expert history when admin views an expert activity', async () => {
      const history = [{id: 'submission-1'}];

      mockUserRepo.findById
        .mockResolvedValueOnce({
          _id: 'admin-1',
          role: 'admin',
        })
        .mockResolvedValueOnce({
          _id: 'expert-1',
          role: 'expert',
        });

      mockQuestionSubmissionRepo.getUserActivityHistory.mockResolvedValue(
        history,
      );

      const result = await service.getSubmissions(
        'admin-1',
        1,
        10,
        undefined,
        undefined,
        'expert-1',
      );

      expect(result).toEqual(history);

      expect(
        mockQuestionSubmissionRepo.getUserActivityHistory,
      ).toHaveBeenCalledWith(
        'expert-1',
        1,
        10,
        undefined,
        expect.anything(),
        undefined,
      );
    });
    it('returns moderator history when moderator views another moderator activity', async () => {
      const history = [{id: 'moderation-1'}];

      mockUserRepo.findById
        .mockResolvedValueOnce({
          _id: 'moderator-1',
          role: 'moderator',
        })
        .mockResolvedValueOnce({
          _id: 'moderator-2',
          role: 'moderator',
        });

      mockAnswerRepo.getModeratorActivityHistory.mockResolvedValue(history);

      const result = await service.getSubmissions(
        'moderator-1',
        1,
        10,
        undefined,
        undefined,
        'moderator-2',
      );

      expect(result).toEqual(history);

      expect(mockAnswerRepo.getModeratorActivityHistory).toHaveBeenCalledWith(
        'moderator-2',
        1,
        10,
        undefined,
        undefined,
        expect.anything(),
      );
    });

    it('returns empty array when target user is not found', async () => {
      mockUserRepo.findById
        .mockResolvedValueOnce({
          _id: 'admin-1',
          role: 'admin',
        })
        .mockResolvedValueOnce(null);

      const result = await service.getSubmissions(
        'admin-1',
        1,
        10,
        undefined,
        undefined,
        'missing-user',
      );

      expect(result).toEqual([]);

      expect(
        mockQuestionSubmissionRepo.getUserActivityHistory,
      ).not.toHaveBeenCalled();

      expect(mockAnswerRepo.getModeratorActivityHistory).not.toHaveBeenCalled();
    });
  });

  describe('getAnswerById', () => {
    it('returns answer successfully', async () => {
      const answer = {_id: 'answer-1'} as any;

      mockAnswerRepo.getById.mockResolvedValue(answer);

      const result = await service.getAnswerById('answer-1');

      expect(result).toEqual(answer);
      expect(mockAnswerRepo.getById).toHaveBeenCalledWith('answer-1');
    });
  });
  describe('deleteAnswer', () => {
    it('deletes answer successfully', async () => {
      mockAnswerRepo.getById.mockResolvedValue({
        _id: 'answer-1',
        isFinalAnswer: false,
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        totalAnswersCount: 5,
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockAnswerRepo.deleteAnswer.mockResolvedValue({
        deletedCount: 1,
      });

      const result = await service.deleteAnswer('question-1', 'answer-1');

      expect(result).toEqual({
        deletedCount: 1,
      });

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        'question-1',
        {
          totalAnswersCount: 4,
          status: 'closed',
        },
        expect.anything(),
      );

      expect(mockAnswerRepo.deleteAnswer).toHaveBeenCalledWith(
        'answer-1',
        expect.anything(),
      );
    });
    it('throws when answer does not exist', async () => {
      mockAnswerRepo.getById.mockResolvedValue(null);

      await expect(
        service.deleteAnswer('question-1', 'answer-1'),
      ).rejects.toThrow();

      expect(mockQuestionRepo.getById).not.toHaveBeenCalled();
      expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();
      expect(mockAnswerRepo.deleteAnswer).not.toHaveBeenCalled();
    });
    it('throws when question does not exist', async () => {
      mockAnswerRepo.getById.mockResolvedValue({
        _id: 'answer-1',
        isFinalAnswer: false,
      });

      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.deleteAnswer('question-1', 'answer-1'),
      ).rejects.toThrow();

      expect(mockAnswerRepo.getById).toHaveBeenCalled();

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith('question-1');

      expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();
      expect(mockAnswerRepo.deleteAnswer).not.toHaveBeenCalled();
    });
    it('deletes final answer successfully', async () => {
      mockAnswerRepo.getById.mockResolvedValue({
        _id: 'answer-1',
        isFinalAnswer: true,
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        totalAnswersCount: 3,
        status: 'closed',
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockAnswerRepo.deleteAnswer.mockResolvedValue({
        deletedCount: 1,
      });

      await service.deleteAnswer('question-1', 'answer-1');

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalled();

      // Verify the deleted answer was removed
      expect(mockAnswerRepo.deleteAnswer).toHaveBeenCalledWith(
        'answer-1',
        expect.anything(),
      );
    });
    it('throws when delete repository fails', async () => {
      mockAnswerRepo.getById.mockResolvedValue({
        _id: 'answer-1',
        isFinalAnswer: false,
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        totalAnswersCount: 5,
      });

      mockAnswerRepo.deleteAnswer.mockRejectedValue(
        new Error('Database delete failed'),
      );

      await expect(
        service.deleteAnswer('question-1', 'answer-1'),
      ).rejects.toThrow();

      expect(mockAnswerRepo.deleteAnswer).toHaveBeenCalledTimes(1);
    });
  });
  describe('goldenFaq', () => {
    it('returns golden FAQs successfully', async () => {
      const response = {
        faqs: [
          {
            _id: 'faq-1',
            question: 'What is nitrogen deficiency?',
          },
        ],
        totalFaqs: 1,
      };

      mockAnswerRepo.getGoldenFaqs.mockResolvedValue(response);

      const result = await service.goldenFaq('user-1', 1, 10, 'nitrogen');

      expect(result).toEqual(response);

      expect(mockAnswerRepo.getGoldenFaqs).toHaveBeenCalledWith(
        'user-1',
        1,
        10,
        'nitrogen',
        expect.anything(),
      );
    });
    it('propagates repository errors', async () => {
      mockAnswerRepo.getGoldenFaqs.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.goldenFaq('user-1', 1, 10, 'nitrogen'),
      ).rejects.toThrow('Database failure');

      expect(mockAnswerRepo.getGoldenFaqs).toHaveBeenCalledWith(
        'user-1',
        1,
        10,
        'nitrogen',
        expect.anything(),
      );
    });
  });
  describe('approveLLMAnswer', () => {
    it('throws when source is not supported', async () => {
      await expect(
        service.approveLLMAnswer('user-1', {
          source: 'MANUAL',
          questionId: 'question-1',
        } as any),
      ).rejects.toThrow(
        'Only AJRASAKHA or WHATSAPP sources are supported for this action',
      );

      expect(mockUserRepo.findById).not.toHaveBeenCalled();
      expect(mockQuestionRepo.getById).not.toHaveBeenCalled();
    });
    it('throws when questionId is missing', async () => {
      await expect(
        service.approveLLMAnswer('user-1', {
          source: 'AJRASAKHA',
        } as any),
      ).rejects.toThrow('questionId is required');

      expect(mockUserRepo.findById).not.toHaveBeenCalled();
      expect(mockQuestionRepo.getById).not.toHaveBeenCalled();
    });
    it('throws when user is not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.approveLLMAnswer('user-1', {
          source: 'AJRASAKHA',
          questionId: 'question-1',
        } as any),
      ).rejects.toThrow("You don't have permission to approve an answer!");

      expect(mockUserRepo.findById).toHaveBeenCalledWith(
        'user-1',
        expect.anything(),
      );

      expect(mockQuestionRepo.getById).not.toHaveBeenCalled();
    });
    it('throws when user is an expert', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: 'user-1',
        role: 'expert',
      });

      await expect(
        service.approveLLMAnswer('user-1', {
          source: 'AJRASAKHA',
          questionId: 'question-1',
        } as any),
      ).rejects.toThrow("You don't have permission to approve an answer!");

      expect(mockQuestionRepo.getById).not.toHaveBeenCalled();
    });
    it('throws when question does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: 'moderator-1',
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.approveLLMAnswer('moderator-1', {
          source: 'AJRASAKHA',
          questionId: 'question-1',
        } as any),
      ).rejects.toThrow('Question with ID question-1 not found');

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith(
        'question-1',
        expect.anything(),
      );
    });
    it('throws when question is already in-review', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: 'moderator-1',
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'in-review',
      });

      await expect(
        service.approveLLMAnswer('moderator-1', {
          source: 'AJRASAKHA',
          questionId: 'question-1',
        } as any),
      ).rejects.toThrow(
        "Can't approve this answer. Current question status is 'in-review'.",
      );
    });
    it('throws when question is closed', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: 'moderator-1',
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'closed',
      });

      await expect(
        service.approveLLMAnswer('moderator-1', {
          source: 'WHATSAPP',
          questionId: 'question-1',
        } as any),
      ).rejects.toThrow(
        "Can't approve this answer. Current question status is 'closed'.",
      );
    });
    it('approves AI answer successfully and removes assigned moderator', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: 'moderator-1',
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'open',
        moderatorId: 'assigned-moderator',
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockUserRepo.removeAssignedQuestion = vi
        .fn()
        .mockResolvedValue(undefined);

      const result = await service.approveLLMAnswer('moderator-1', {
        source: 'AJRASAKHA',
        questionId: 'question-1',
        answer: 'AI generated answer',
        sources: ['source-1'],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        'question-1',
        {
          aiApprovedSources: ['source-1'],
          aiInitialAnswer: 'AI generated answer',
          isAutoAllocate: true,
          status: 'open',
          moderatorId: null,
          moderatorAssignedAt: null,
        },
        expect.anything(),
        true,
      );

      expect(mockUserRepo.removeAssignedQuestion).toHaveBeenCalledWith(
        'assigned-moderator',
        'question-1',
      );
    });
    it('approves AI answer without removing moderator when none is assigned', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: 'moderator-1',
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'open',
        moderatorId: null,
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockUserRepo.removeAssignedQuestion = vi.fn();

      const result = await service.approveLLMAnswer('moderator-1', {
        source: 'WHATSAPP',
        questionId: 'question-1',
        answer: 'Approved answer',
        sources: [],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(mockUserRepo.removeAssignedQuestion).not.toHaveBeenCalled();
    });
  });
  describe('approveAnswer', () => {
    it('throws when user is not found', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'in-review',
        question: 'Test question',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.approveAnswer('user-1', {
          answerId: 'answer-1',
          questionId: 'question-1',
        } as any),
      ).rejects.toThrow("You don't have permission to approve an answer!");
    });
    it('throws when questionId is not provided', async () => {
      await expect(
        service.approveAnswer('moderator-1', {
          answer: 'Approved answer',
        } as any),
      ).rejects.toThrow('Question ID not found');
    });
    it('throws when answerId is not found', async () => {
      mockAnswerRepo.getById.mockResolvedValue(null);

      await expect(
        service.approveAnswer('moderator-1', {
          answerId: 'answer-1',
        } as any),
      ).rejects.toThrow('Answer with ID answer-1 not found');

      expect(mockAnswerRepo.getById).toHaveBeenCalledWith(
        'answer-1',
        expect.anything(),
      );
    });
    it('throws when question does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.approveAnswer('moderator-1', {
          questionId: 'question-1',
          answerId: 'answer-1',
        } as any),
      ).rejects.toThrow('Question with ID question-1 not found');
    });
    it('throws when question has no normalised crop', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'in-review',
        question: 'Sample question',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue(null);

      await expect(
        service.approveAnswer('moderator-1', {
          questionId: 'question-1',
          answerId: 'answer-1',
        } as any),
      ).rejects.toThrow('This question does not have a normalised crop.');
    });
    it('throws when user is an expert', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'in-review',
        question: 'Test question',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById.mockResolvedValue({
        _id: 'expert-1',
        role: 'expert',
      });

      await expect(
        service.approveAnswer('expert-1', {
          questionId: 'question-1',
          answerId: 'answer-1',
        } as any),
      ).rejects.toThrow("You don't have permission to approve an answer!");
    });
    it('throws when submission does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'in-review',
        question: 'Test question',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(null);

      mockUserRepo.findById.mockResolvedValue({
        _id: 'moderator-1',
        role: 'moderator',
      });

      await expect(
        service.approveAnswer('moderator-1', {
          questionId: 'question-1',
          answerId: 'answer-1',
        } as any),
      ).rejects.toThrow(
        'Submission details for question ID question-1 not found',
      );
    });
    it('throws when question is not in review', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        status: 'open',
        question: 'Test question',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById.mockResolvedValue({
        _id: 'moderator-1',
        role: 'moderator',
      });

      await expect(
        service.approveAnswer('moderator-1', {
          questionId: 'question-1',
          answerId: 'answer-1',
        } as any),
      ).rejects.toThrow("Can't approve this answer");
    });
    it('approves a duplicate question successfully', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const expertId = '507f1f77bcf86cd799439012';
      const questionId = '507f1f77bcf86cd799439013';
      const answerId = '507f1f77bcf86cd799439014';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Sample question',
        status: 'duplicate',
        source: 'WEB',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockUserRepo.findById
        // Moderator approving
        .mockResolvedValueOnce({
          _id: moderatorId,
          role: 'moderator',
        })
        // Author of the answer
        .mockResolvedValueOnce({
          _id: expertId,
          firstName: 'John',
          lastName: 'Doe',
        });

      mockAnswerRepo.addAnswer.mockResolvedValue({
        insertedId: answerId,
      });
      mockQuestionService.freeRoleAssigneeOnStatusChange.mockResolvedValue(
        undefined,
      );
      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        authorId: expertId,
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockUserRepo.updatePenaltyAndIncentive.mockResolvedValue(undefined);

      mockUserRepo.removeAssignedQuestionFromAllModerators.mockResolvedValue(
        undefined,
      );

      mockAnswerRepo.updateAnswer.mockResolvedValue({
        modifiedCount: 1,
      });

      const result = await service.approveAnswer(moderatorId, {
        questionId,
        answer: 'Approved answer',
        sources: [],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(mockAnswerRepo.addAnswer).toHaveBeenCalledWith(
        questionId,
        moderatorId,
        'Approved answer',
        [],
        [],
        true,
        1,
        expect.anything(),
        'approved',
        expect.any(String),
        undefined,
      );

      expect(mockUserRepo.updatePenaltyAndIncentive).toHaveBeenCalledWith(
        expertId,
        'incentive',
        expect.anything(),
      );

      expect(mockAnswerRepo.updateAnswer).toHaveBeenCalledWith(
        answerId,
        expect.objectContaining({
          answer: 'Approved answer',
          sources: [],
          isFinalAnswer: true,
          status: 'approved',
        }),
        expect.anything(),
      );

      expect(
        mockUserRepo.removeAssignedQuestionFromAllModerators,
      ).toHaveBeenCalledWith(questionId, expect.anything());
    });
    it('edits an existing final answer on a closed question', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const questionId = '507f1f77bcf86cd799439012';
      const answerId = '507f1f77bcf86cd799439013';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Sample question',
        status: 'closed',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        isFinalAnswer: true,
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockAnswerRepo.updateAnswer.mockResolvedValue({
        modifiedCount: 1,
      });

      const result = await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Updated final answer',
        sources: ['source-1'],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        expect.objectContaining({
          text: expect.any(String),
          embedding: [],
        }),
        expect.anything(),
        true,
      );

      expect(mockAnswerRepo.updateAnswer).toHaveBeenCalledWith(
        answerId,
        expect.objectContaining({
          answer: 'Updated final answer',
          sources: ['source-1'],
          embedding: [],
        }),
        expect.anything(),
      );
    });
    it('throws when trying to edit a non-final answer on a closed question', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const questionId = '507f1f77bcf86cd799439012';
      const answerId = '507f1f77bcf86cd799439013';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Sample question',
        status: 'closed',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        isFinalAnswer: false,
      });

      await expect(
        service.approveAnswer(moderatorId, {
          questionId,
          answerId,
          answer: 'Updated answer',
          sources: [],
        } as any),
      ).rejects.toThrow(
        `Can't edit this answer: ${answerId}. It is not the final answer for a closed question.`,
      );

      expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();
      expect(mockAnswerRepo.updateAnswer).not.toHaveBeenCalled();
    });
    it('approves an answer successfully for an in-review question', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const expertId = '507f1f77bcf86cd799439012';
      const questionId = '507f1f77bcf86cd799439013';
      const answerId = '507f1f77bcf86cd799439014';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Sample question',
        status: 'in-review',
        source: 'WEB',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: 'submission-1',
      });

      mockUserRepo.findById
        // moderator
        .mockResolvedValueOnce({
          _id: moderatorId,
          role: 'moderator',
        })
        // author
        .mockResolvedValueOnce({
          _id: expertId,
          firstName: 'John',
          lastName: 'Doe',
        });

      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        authorId: expertId,
      });

      mockUserRepo.updatePenaltyAndIncentive.mockResolvedValue(undefined);

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockUserRepo.removeAssignedQuestionFromAllModerators.mockResolvedValue(
        undefined,
      );

      mockAnswerRepo.updateAnswer.mockResolvedValue({
        modifiedCount: 1,
      });

      const result = await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Final approved answer',
        sources: ['source-1'],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(mockUserRepo.updatePenaltyAndIncentive).toHaveBeenCalledWith(
        expertId,
        'incentive',
        expect.anything(),
      );

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        expect.objectContaining({
          status: 'closed',
          closedAt: expect.any(Date),
          text: expect.any(String),
          embedding: [],
        }),
        expect.anything(),
        true,
      );

      expect(
        mockUserRepo.removeAssignedQuestionFromAllModerators,
      ).toHaveBeenCalledWith(questionId, expect.anything());

      expect(mockAnswerRepo.updateAnswer).toHaveBeenCalledWith(
        answerId,
        expect.objectContaining({
          answer: 'Final approved answer',
          sources: ['source-1'],
          approvedBy: expect.any(Object),
          isFinalAnswer: true,
          status: 'approved',
        }),
        expect.anything(),
      );
    });
    it('throws when answer does not exist after submission validation', async () => {
      setupApproveAnswer();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Sample question',
        status: 'in-review',
        source: 'WEB',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: 'submission-1',
      });

      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockAnswerRepo.getById.mockResolvedValue(null);

      await expect(
        service.approveAnswer(moderatorId, {
          questionId,
          answerId,
          answer: 'Approved answer',
          sources: [],
        } as any),
      ).rejects.toThrow(`Answer with ID ${answerId} not found`);

      expect(mockUserRepo.updatePenaltyAndIncentive).not.toHaveBeenCalled();
      expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();
      expect(mockAnswerRepo.updateAnswer).not.toHaveBeenCalled();
    });
    it('propagates updateAnswer repository errors', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const expertId = '507f1f77bcf86cd799439012';
      const questionId = '507f1f77bcf86cd799439013';
      const answerId = '507f1f77bcf86cd799439014';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Sample question',
        status: 'in-review',
        source: 'WEB',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: 'submission-1',
      });

      mockUserRepo.findById
        .mockResolvedValueOnce({
          _id: moderatorId,
          role: 'moderator',
        })
        .mockResolvedValueOnce({
          _id: expertId,
          firstName: 'John',
          lastName: 'Doe',
        });

      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        authorId: expertId,
      });

      mockUserRepo.updatePenaltyAndIncentive.mockResolvedValue(undefined);

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockUserRepo.removeAssignedQuestionFromAllModerators.mockResolvedValue(
        undefined,
      );

      mockAnswerRepo.updateAnswer.mockRejectedValue(
        new Error('Database update failed'),
      );

      await expect(
        service.approveAnswer(moderatorId, {
          questionId,
          answerId,
          answer: 'Updated answer',
          sources: [],
        } as any),
      ).rejects.toThrow('Database update failed');

      expect(mockAnswerRepo.updateAnswer).toHaveBeenCalledTimes(1);
    });
    it('continues approval when removing assigned question from moderators fails', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const expertId = '507f1f77bcf86cd799439012';
      const questionId = '507f1f77bcf86cd799439013';
      const answerId = '507f1f77bcf86cd799439014';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Sample question',
        status: 'in-review',
        source: 'WEB',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: 'submission-1',
      });

      mockUserRepo.findById
        .mockResolvedValueOnce({
          _id: moderatorId,
          role: 'moderator',
        })
        .mockResolvedValueOnce({
          _id: expertId,
          firstName: 'John',
          lastName: 'Doe',
        });

      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        authorId: expertId,
      });

      mockUserRepo.updatePenaltyAndIncentive.mockResolvedValue(undefined);

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockUserRepo.removeAssignedQuestionFromAllModerators.mockRejectedValue(
        new Error('Database unavailable'),
      );

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      mockAnswerRepo.updateAnswer.mockResolvedValue({
        modifiedCount: 1,
      });

      const result = await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved answer',
        sources: [],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(
        mockUserRepo.removeAssignedQuestionFromAllModerators,
      ).toHaveBeenCalled();

      expect(consoleSpy).toHaveBeenCalled();

      expect(mockAnswerRepo.updateAnswer).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
    it('marks static_dynamic questions as dynamic_closed when approving', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const expertId = '507f1f77bcf86cd799439012';
      const questionId = '507f1f77bcf86cd799439013';
      const answerId = '507f1f77bcf86cd799439014';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Sample question',
        status: 'in-review',
        source: 'WEB',
        tag: 'static_dynamic',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: 'submission-1',
      });

      mockUserRepo.findById
        .mockResolvedValueOnce({
          _id: moderatorId,
          role: 'moderator',
        })
        .mockResolvedValueOnce({
          _id: expertId,
          firstName: 'John',
          lastName: 'Doe',
        });

      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        authorId: expertId,
      });

      mockUserRepo.updatePenaltyAndIncentive.mockResolvedValue(undefined);
      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);
      mockUserRepo.removeAssignedQuestionFromAllModerators.mockResolvedValue(
        undefined,
      );

      mockAnswerRepo.updateAnswer.mockResolvedValue({
        modifiedCount: 1,
      });

      const result = await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved answer',
        sources: [],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        expect.objectContaining({
          status: 'dynamic_closed',
          closedAt: expect.any(Date),
        }),
        expect.anything(),
        true,
      );
    });
    it('marks customer as notified when WhatsApp webhook succeeds', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const expertId = '507f1f77bcf86cd799439012';
      const questionId = '507f1f77bcf86cd799439013';
      const answerId = '507f1f77bcf86cd799439014';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Sample question',
        status: 'in-review',
        source: 'WHATSAPP',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: 'submission-1',
      });

      mockUserRepo.findById
        .mockResolvedValueOnce({
          _id: moderatorId,
          role: 'moderator',
        })
        .mockResolvedValueOnce({
          _id: expertId,
          firstName: 'John',
          lastName: 'Doe',
        });

      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        authorId: expertId,
      });

      mockUserRepo.updatePenaltyAndIncentive.mockResolvedValue(undefined);

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockUserRepo.removeAssignedQuestionFromAllModerators.mockResolvedValue(
        undefined,
      );

      mockAnswerRepo.updateAnswer.mockResolvedValue({
        modifiedCount: 1,
      });

      vi.mocked(triggerWebhook).mockResolvedValue(undefined);

      await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved answer',
        sources: [],
      } as any);

      expect(triggerWebhook).toHaveBeenCalledTimes(1);

      expect(mockQuestionRepo.updateQuestion).toHaveBeenLastCalledWith(
        questionId,
        {
          isCustomerNotified: true,
        },
        expect.anything(),
        false,
      );
    });
    it('approves answer when question status is pae_submitted', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const expertId = '507f1f77bcf86cd799439012';
      const questionId = '507f1f77bcf86cd799439013';
      const answerId = '507f1f77bcf86cd799439014';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Sample question',
        status: 'pae_submitted',
        source: 'WEB',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: 'submission-1',
      });

      mockUserRepo.findById
        .mockResolvedValueOnce({
          _id: moderatorId,
          role: 'moderator',
        })
        .mockResolvedValueOnce({
          _id: expertId,
          firstName: 'John',
          lastName: 'Doe',
        });

      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        authorId: expertId,
      });

      mockUserRepo.updatePenaltyAndIncentive.mockResolvedValue(undefined);
      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);
      mockUserRepo.removeAssignedQuestionFromAllModerators.mockResolvedValue(
        undefined,
      );

      mockAnswerRepo.updateAnswer.mockResolvedValue({
        modifiedCount: 1,
      });

      const result = await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved',
        sources: [],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });
    });
    it('throws when editing closed question and answer does not exist', async () => {
      appConfig.isDevelopment = true;

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        question: 'Sample',
        status: 'closed',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById.mockResolvedValue({
        _id: 'moderator-1',
        role: 'moderator',
      });

      mockAnswerRepo.getById.mockResolvedValue(null);

      await expect(
        service.approveAnswer('moderator-1', {
          questionId: 'question-1',
          answerId: 'answer-1',
          answer: 'Updated',
        } as any),
      ).rejects.toThrow('Answer with ID answer-1 not found');
    });
    it('propagates addAnswer failure in duplicate flow', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        question: 'Question',
        status: 'duplicate',
        source: 'WEB',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockAnswerRepo.addAnswer.mockRejectedValue(new Error('Insert failed'));

      await expect(
        service.approveAnswer(moderatorId, {
          questionId: 'question-1',
          answer: 'Approved',
          sources: [],
        } as any),
      ).rejects.toThrow('Insert failed');
    });
    it('propagates updateQuestion failure in duplicate flow', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        question: 'Question',
        status: 'duplicate',
        source: 'WEB',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockAnswerRepo.addAnswer.mockResolvedValue({
        insertedId: '507f1f77bcf86cd799439099',
      });
      mockQuestionService.freeRoleAssigneeOnStatusChange.mockResolvedValue(
        undefined,
      );
      mockQuestionRepo.updateQuestion.mockRejectedValue(
        new Error('Update failed'),
      );

      await expect(
        service.approveAnswer(moderatorId, {
          questionId: 'question-1',
          answer: 'Approved',
          sources: [],
        } as any),
      ).rejects.toThrow('Update failed');
    });
    it('propagates incentive update failure', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const expertId = '507f1f77bcf86cd799439012';
      const questionId = '507f1f77bcf86cd799439013';
      const answerId = '507f1f77bcf86cd799439014';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        status: 'in-review',
        source: 'WEB',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById
        .mockResolvedValueOnce({
          _id: moderatorId,
          role: 'moderator',
        })
        .mockResolvedValueOnce({
          _id: expertId,
        });

      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        authorId: expertId,
      });

      mockUserRepo.updatePenaltyAndIncentive.mockRejectedValue(
        new Error('Incentive failed'),
      );

      await expect(
        service.approveAnswer(moderatorId, {
          questionId,
          answerId,
          answer: 'Approved',
          sources: [],
        } as any),
      ).rejects.toThrow('Incentive failed');
    });

    it('continues approval when author lookup returns null', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const expertId = '507f1f77bcf86cd799439012';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        question: 'Question',
        status: 'in-review',
        source: 'WEB',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById
        .mockResolvedValueOnce({
          _id: moderatorId,
          role: 'moderator',
        })
        .mockResolvedValueOnce(null);

      mockAnswerRepo.getById.mockResolvedValue({
        _id: 'answer-1',
        authorId: expertId,
      });

      mockUserRepo.updatePenaltyAndIncentive.mockResolvedValue(undefined);
      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);
      mockUserRepo.removeAssignedQuestionFromAllModerators.mockResolvedValue(
        undefined,
      );

      mockAnswerRepo.updateAnswer.mockResolvedValue({
        modifiedCount: 1,
      });

      const result = await service.approveAnswer(moderatorId, {
        questionId: 'question-1',
        answerId: 'answer-1',
        answer: 'Approved',
        sources: [],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });
    });
    it('throws when editing a closed question and answer is not final', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        question: 'Question',
        status: 'closed',
        source: 'WEB',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockAnswerRepo.getById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439014',
        isFinalAnswer: false,
      });

      await expect(
        service.approveAnswer(moderatorId, {
          questionId: '507f1f77bcf86cd799439013',
          answerId: '507f1f77bcf86cd799439014',
          answer: 'Updated answer',
          sources: [],
        } as any),
      ).rejects.toThrow('It is not the final answer');
    });
    it('updates a final answer on a closed question', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const questionId = '507f1f77bcf86cd799439013';
      const answerId = '507f1f77bcf86cd799439014';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        status: 'closed',
        source: 'WEB',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        isFinalAnswer: true,
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockAnswerRepo.updateAnswer.mockResolvedValue({
        modifiedCount: 1,
      });

      const result = await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Updated answer',
        sources: [],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalled();

      expect(mockAnswerRepo.updateAnswer).toHaveBeenCalledWith(
        answerId,
        expect.objectContaining({
          answer: 'Updated answer',
        }),
        expect.anything(),
      );
    });
    it('propagates updateAnswer failure while editing final answer', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        question: 'Question',
        status: 'closed',
        source: 'WEB',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockAnswerRepo.getById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439014',
        isFinalAnswer: true,
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockAnswerRepo.updateAnswer.mockRejectedValue(new Error('Update failed'));

      await expect(
        service.approveAnswer(moderatorId, {
          questionId: '507f1f77bcf86cd799439013',
          answerId: '507f1f77bcf86cd799439014',
          answer: 'Updated answer',
          sources: [],
        } as any),
      ).rejects.toThrow('Update failed');
    });
    it('throws when answer cannot be found', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';
      const questionId = '507f1f77bcf86cd799439013';
      const answerId = '507f1f77bcf86cd799439014';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        status: 'in-review',
        source: 'WEB',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockAnswerRepo.getById.mockResolvedValue(null);

      await expect(
        service.approveAnswer(moderatorId, {
          questionId,
          answerId,
          answer: 'Approved',
          sources: [],
        } as any),
      ).rejects.toThrow(`Answer with ID ${answerId} not found`);
    });
    it('throws when submission is missing', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        question: 'Question',
        status: 'in-review',
        source: 'WEB',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(null);

      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      await expect(
        service.approveAnswer(moderatorId, {
          questionId: 'question-1',
          answerId: 'answer-1',
          answer: 'Approved',
          sources: [],
        } as any),
      ).rejects.toThrow('Submission details');
    });
    it('throws when question is not in review or pae submitted', async () => {
      appConfig.isDevelopment = true;

      const moderatorId = '507f1f77bcf86cd799439011';

      mockQuestionRepo.getById.mockResolvedValue({
        _id: 'question-1',
        question: 'Question',
        status: 'open',
        source: 'WEB',
        tag: '',
      });

      mockQuestionService.ensureNormalisedCrop.mockResolvedValue('Paddy');

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({});

      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      await expect(
        service.approveAnswer(moderatorId, {
          questionId: 'question-1',
          answerId: 'answer-1',
          answer: 'Approved',
          sources: [],
        } as any),
      ).rejects.toThrow('currently question is not in review or pae submitted');
    });
    it('continues when removing assigned moderator fails', async () => {
      setupApproveAnswer();

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      mockUserRepo.removeAssignedQuestionFromAllModerators.mockRejectedValue(
        new Error('Mongo failure'),
      );

      const result = await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved',
        sources: [],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
    it('throws when answer is missing', async () => {
      setupApproveAnswer();

      mockAnswerRepo.getById.mockResolvedValue(null);

      await expect(
        service.approveAnswer(moderatorId, {
          questionId,
          answerId,
          answer: 'Approved',
          sources: [],
        } as any),
      ).rejects.toThrow(`Answer with ID ${answerId} not found`);
    });
    it('propagates incentive update failure', async () => {
      setupApproveAnswer();

      mockUserRepo.updatePenaltyAndIncentive.mockRejectedValue(
        new Error('Incentive update failed'),
      );

      await expect(
        service.approveAnswer(moderatorId, {
          questionId,
          answerId,
          answer: 'Approved',
          sources: [],
        } as any),
      ).rejects.toThrow('Incentive update failed');

      expect(mockAnswerRepo.updateAnswer).not.toHaveBeenCalled();
    });
    it('propagates question update failure', async () => {
      setupApproveAnswer();

      mockQuestionRepo.updateQuestion.mockRejectedValue(
        new Error('Question update failed'),
      );

      await expect(
        service.approveAnswer(moderatorId, {
          questionId,
          answerId,
          answer: 'Approved',
          sources: [],
        } as any),
      ).rejects.toThrow('Question update failed');

      expect(mockAnswerRepo.updateAnswer).not.toHaveBeenCalled();
    });
    it('propagates updateAnswer repository failure', async () => {
      setupApproveAnswer();

      mockAnswerRepo.updateAnswer.mockRejectedValue(
        new Error('Update answer failed'),
      );

      await expect(
        service.approveAnswer(moderatorId, {
          questionId,
          answerId,
          answer: 'Approved',
          sources: [],
        } as any),
      ).rejects.toThrow('Update answer failed');
    });
    it('removes assigned question from moderators', async () => {
      setupApproveAnswer();

      await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved',
        sources: [],
      } as any);

      expect(
        mockUserRepo.removeAssignedQuestionFromAllModerators,
      ).toHaveBeenCalledWith(questionId, expect.anything());
    });
    it('continues approval when WhatsApp webhook fails', async () => {
      setupApproveAnswer();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        status: 'in-review',
        source: 'WHATSAPP',
        tag: '',
      });

      (triggerWebhook as any).mockRejectedValue(new Error('Webhook failed'));

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved',
        sources: [],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(mockQuestionRepo.updateQuestion).toHaveBeenLastCalledWith(
        questionId,
        {
          isCustomerNotified: false,
        },
        expect.anything(),
        false,
      );

      consoleSpy.mockRestore();
    });
    it('marks customer as notified when AJRASAKHA webhook succeeds', async () => {
      setupApproveAnswer();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        status: 'in-review',
        source: 'AJRASAKHA',
        tag: '',
        messageId: 'msg-1',
        threadId: 'thread-1',
      });

      await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved',
        sources: [],
      } as any);

      expect(triggerWebhook).toHaveBeenCalled();

      expect(mockQuestionRepo.updateQuestion).toHaveBeenLastCalledWith(
        questionId,
        {
          isCustomerNotified: true,
        },
        expect.anything(),
        false,
      );
    });
    it('continues approval when AJRASAKHA webhook fails', async () => {
      setupApproveAnswer();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        status: 'in-review',
        source: 'AJRASAKHA',
        tag: '',
        messageId: 'msg-1',
        threadId: 'thread-1',
      });

      (triggerWebhook as any).mockRejectedValue(new Error('Webhook failed'));

      const result = await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved',
        sources: [],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(mockQuestionRepo.updateQuestion).toHaveBeenLastCalledWith(
        questionId,
        {
          isCustomerNotified: false,
        },
        expect.anything(),
        false,
      );
    });
    it('does not update customer notification for WEB questions', async () => {
      setupApproveAnswer();

      await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved',
        sources: [],
      } as any);

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledTimes(1);

      expect(triggerWebhook).not.toHaveBeenCalled();
    });
    it('closes question as dynamic_closed for static_dynamic tag', async () => {
      setupApproveAnswer();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        status: 'in-review',
        source: 'WEB',
        tag: 'static_dynamic',
      });

      await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved',
        sources: [],
      } as any);

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        expect.objectContaining({
          status: 'dynamic_closed',
        }),
        expect.anything(),
        true,
      );
    });
    it('closes question with closed status for normal questions', async () => {
      setupApproveAnswer();

      await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved',
        sources: [],
      } as any);

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        expect.objectContaining({
          status: 'closed',
        }),
        expect.anything(),
        true,
      );
    });
    it('marks answer as final and approved', async () => {
      setupApproveAnswer();

      await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved',
        sources: ['source'],
      } as any);

      expect(mockAnswerRepo.updateAnswer).toHaveBeenCalledWith(
        answerId,
        expect.objectContaining({
          isFinalAnswer: true,
          status: 'approved',
          answer: 'Approved',
          sources: ['source'],
        }),
        expect.anything(),
      );
    });
    it('increments author incentive', async () => {
      setupApproveAnswer();

      await service.approveAnswer(moderatorId, {
        questionId,
        answerId,
        answer: 'Approved',
        sources: [],
      } as any);

      expect(mockUserRepo.updatePenaltyAndIncentive).toHaveBeenCalledWith(
        expertId,
        'incentive',
        expect.anything(),
      );
    });
  });
  describe('approveLLMAnswer', () => {
    it('throws when source is not AJRASAKHA or WHATSAPP', async () => {
      await expect(
        service.approveLLMAnswer(moderatorId, {
          source: 'WEB',
          questionId,
        } as any),
      ).rejects.toThrow(
        'Only AJRASAKHA or WHATSAPP sources are supported for this action',
      );
    });
    it('throws when questionId is missing', async () => {
      await expect(
        service.approveLLMAnswer(moderatorId, {
          source: 'AJRASAKHA',
        } as any),
      ).rejects.toThrow('questionId is required');
    });
    it('throws when user is not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.approveLLMAnswer(moderatorId, {
          source: 'AJRASAKHA',
          questionId,
        } as any),
      ).rejects.toThrow("You don't have permission to approve an answer!");
    });
    it('throws when question is not found', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.approveLLMAnswer(moderatorId, {
          source: 'AJRASAKHA',
          questionId,
        } as any),
      ).rejects.toThrow(`Question with ID ${questionId} not found`);
    });
    it('throws when expert tries to approve', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
      });

      await expect(
        service.approveLLMAnswer(expertId, {
          source: 'AJRASAKHA',
          questionId,
        } as any),
      ).rejects.toThrow("You don't have permission to approve an answer!");
    });
    it('throws when question is already in-review', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'in-review',
      });

      await expect(
        service.approveLLMAnswer(moderatorId, {
          source: 'AJRASAKHA',
          questionId,
        } as any),
      ).rejects.toThrow(
        "Can't approve this answer. Current question status is 'in-review'.",
      );
    });
    it('throws when question is already closed', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'closed',
      });

      await expect(
        service.approveLLMAnswer(moderatorId, {
          source: 'AJRASAKHA',
          questionId,
        } as any),
      ).rejects.toThrow(
        "Can't approve this answer. Current question status is 'closed'.",
      );
    });
    it('approves an AJRASAKHA LLM answer successfully', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        moderatorId,
        source: 'AJRASAKHA',
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockUserRepo.removeAssignedQuestion.mockResolvedValue(undefined);

      const result = await service.approveLLMAnswer(moderatorId, {
        questionId,
        source: 'AJRASAKHA',
        answer: 'Approved answer',
        sources: ['source-1'],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        expect.objectContaining({
          aiInitialAnswer: 'Approved answer',
          aiApprovedSources: ['source-1'],
          status: 'open',
          moderatorId: null,
          moderatorAssignedAt: null,
          isAutoAllocate: true,
        }),
        expect.anything(),
        true,
      );
    });
    it('removes assigned moderator after approval', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        source: 'AJRASAKHA',
        moderatorId,
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockUserRepo.removeAssignedQuestion.mockResolvedValue(undefined);

      await service.approveLLMAnswer(moderatorId, {
        questionId,
        source: 'AJRASAKHA',
        answer: 'Approved',
        sources: [],
      } as any);

      expect(mockUserRepo.removeAssignedQuestion).toHaveBeenCalledWith(
        moderatorId,
        questionId,
      );
    });
    it('does not remove moderator when no moderator is assigned', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        source: 'AJRASAKHA',
        moderatorId: null,
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      await service.approveLLMAnswer(moderatorId, {
        questionId,
        source: 'AJRASAKHA',
        answer: 'Approved',
        sources: [],
      } as any);

      expect(mockUserRepo.removeAssignedQuestion).not.toHaveBeenCalled();
    });
    it('approves a WHATSAPP LLM answer successfully', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        source: 'WHATSAPP',
        moderatorId,
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockUserRepo.removeAssignedQuestion.mockResolvedValue(undefined);

      const result = await service.approveLLMAnswer(moderatorId, {
        questionId,
        source: 'WHATSAPP',
        answer: 'Approved',
        sources: [],
      } as any);

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalled();
    });
    it('propagates updateQuestion errors', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        source: 'AJRASAKHA',
      });

      mockQuestionRepo.updateQuestion.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.approveLLMAnswer(moderatorId, {
          questionId,
          source: 'AJRASAKHA',
          answer: 'Approved',
          sources: [],
        } as any),
      ).rejects.toThrow('Database failure');
    });
    it('does not remove assigned moderator when moderatorId is undefined', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        source: 'AJRASAKHA',
      });

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      await service.approveLLMAnswer(moderatorId, {
        questionId,
        source: 'AJRASAKHA',
        answer: 'Approved',
        sources: [],
      } as any);

      expect(mockUserRepo.removeAssignedQuestion).not.toHaveBeenCalled();
    });
  });
  describe('reviewAnswer', () => {
    it('throws when user is not an expert', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        role: 'moderator',
      });

      await expect(
        service.reviewAnswer(moderatorId, {} as any),
      ).rejects.toThrow('You are not authorized to perform reviews');

      expect(mockQuestionRepo.getById).not.toHaveBeenCalled();
    });
    it('throws when question is not found', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
        } as any),
      ).rejects.toThrow('Failed to find question');

      expect(mockQuestionSubmissionRepo.getByQuestionId).not.toHaveBeenCalled();
    });
    it('throws when submission details are missing', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(null);

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
        } as any),
      ).rejects.toThrow('Failed to find submission details for this question.');
    });
    it('throws when first reviewer is not assigned reviewer', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        history: [],
        queue: ['another-user'],
      });

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
        } as any),
      ).rejects.toThrow('You are not authorized to review this question.');
    });
    it('throws when another expert is currently reviewing', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [
          {
            updatedBy: 'someone-else',
          },
        ],
      });

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
        } as any),
      ).rejects.toThrow(
        'This question is currently being reviewed by another expert.',
      );
    });
    it('throws when reviewer information is missing', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [{}],
      });

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
        } as any),
      ).rejects.toThrow('Unable to find reviewer info for this question.');
    });
    it('throws when no answer exists for review', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [],
      });

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
          status: 'accepted',
          approvedAnswer: answerId,
        } as any),
      ).rejects.toThrow(
        'No answer found for review. Please check submission history.',
      );
    });
    it('throws when approvedAnswer does not match current answer', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
          status: 'accepted',
          approvedAnswer: '507f1f77bcf86cd799439099',
        } as any),
      ).rejects.toThrow(
        'You are reviewing an answer that is not currently under review.',
      );
    });
    it('throws when rejectedAnswer does not match current answer', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
          status: 'rejected',
          rejectedAnswer: '507f1f77bcf86cd799439099',
        } as any),
      ).rejects.toThrow(
        'You are reviewing an answer that is not currently under review.',
      );
    });
    it('throws when review creation fails', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      mockReviewRepo.createReview.mockResolvedValue({});

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
          status: 'accepted',
          approvedAnswer: answerId,
        } as any),
      ).rejects.toThrow('Failed to create review entry. Please try again.');
    });
    it('throws when review creation fails', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      mockReviewRepo.createReview.mockResolvedValue({});

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
          status: 'accepted',
          approvedAnswer: answerId,
        } as any),
      ).rejects.toThrow('Failed to create review entry. Please try again.');
    });
    it('marks AJRASAKHA question as opened by expert', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        source: 'AJRASAKHA',
      });

      mockQuestionSubmissionRepo.getByQuestionId
        .mockResolvedValueOnce({
          queue: [expertId],
          history: [],
        })
        .mockResolvedValueOnce({
          currentExpertOpenedAt: null,
        });

      vi.spyOn(service, 'addAnswer').mockResolvedValue({
        insertedId: answerId,
      } as any);

      mockQuestionSubmissionRepo.update.mockResolvedValue(undefined);

      mockQuestionSubmissionRepo.markQuestionOpenedByExpert.mockResolvedValue(
        undefined,
      );

      mockQuestionSubmissionRepo.clearCurrentExpertTracking.mockResolvedValue(
        undefined,
      );

      mockUserRepo.updateReputationScore.mockResolvedValue(undefined);

      await service.reviewAnswer(expertId, {
        questionId,
        answer: 'Sample answer',
        sources: [],
      } as any);

      expect(
        mockQuestionSubmissionRepo.markQuestionOpenedByExpert,
      ).toHaveBeenCalledWith(questionId, expertId);
    });
    it('does not mark question opened if already opened', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        source: 'AJRASAKHA',
      });

      mockQuestionSubmissionRepo.getByQuestionId
        .mockResolvedValueOnce({
          queue: [expertId],
          history: [],
        })
        .mockResolvedValueOnce({
          currentExpertOpenedAt: new Date(),
        });

      vi.spyOn(service, 'addAnswer').mockResolvedValue({
        insertedId: answerId,
      } as any);

      mockQuestionSubmissionRepo.update.mockResolvedValue(undefined);
      mockQuestionSubmissionRepo.clearCurrentExpertTracking.mockResolvedValue(
        undefined,
      );
      mockUserRepo.updateReputationScore.mockResolvedValue(undefined);

      await service.reviewAnswer(expertId, {
        questionId,
        answer: 'Answer',
        sources: [],
      } as any);

      expect(
        mockQuestionSubmissionRepo.markQuestionOpenedByExpert,
      ).not.toHaveBeenCalled();
    });
    it('marks question as pae_submitted for PAE expert', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'pae_expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        source: 'WEB',
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [],
      });

      vi.spyOn(service, 'addAnswer').mockResolvedValue({
        insertedId: answerId,
      } as any);

      mockQuestionSubmissionRepo.update.mockResolvedValue(undefined);

      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

      mockQuestionSubmissionRepo.clearCurrentExpertTracking.mockResolvedValue(
        undefined,
      );

      mockUserRepo.updateReputationScore.mockResolvedValue(undefined);

      await service.reviewAnswer(expertId, {
        questionId,
        answer: 'Answer',
        sources: [],
      } as any);

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        {status: 'pae_submitted'},
        expect.anything(),
      );
    });
    it('moves answer to pending-with-moderator after three approvals', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        question: 'Question',
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      mockReviewRepo.createReview.mockResolvedValue({
        insertedId: '507f1f77bcf86cd799439015',
      });

      vi.spyOn(service, 'incrementApprovalCount').mockResolvedValue(3);

      mockQuestionSubmissionRepo.updateHistoryByUserId.mockResolvedValue(
        undefined,
      );
      mockAnswerRepo.updateAnswerStatus.mockResolvedValue(undefined);
      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);
      mockUserRepo.updateReputationScore.mockResolvedValue(undefined);
      mockQuestionSubmissionRepo.clearCurrentExpertTracking.mockResolvedValue(
        undefined,
      );

      vi.spyOn(
        service as any,
        'notifyModeratorsAndAdminsForApproval',
      ).mockResolvedValue(undefined);

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
      } as any);

      expect(mockAnswerRepo.updateAnswerStatus).toHaveBeenCalledWith(
        answerId,
        {
          status: 'pending-with-moderator',
        },
        expect.anything(),
      );
    });
    it('marks original expert as approved after three approvals', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        question: 'Question',
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      mockReviewRepo.createReview.mockResolvedValue({
        insertedId: '507f1f77bcf86cd799439015',
      });

      vi.spyOn(service, 'incrementApprovalCount').mockResolvedValue(3);

      mockQuestionSubmissionRepo.updateHistoryByUserId.mockResolvedValue(
        undefined,
      );
      mockAnswerRepo.updateAnswerStatus.mockResolvedValue(undefined);
      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);
      mockUserRepo.updateReputationScore.mockResolvedValue(undefined);
      mockQuestionSubmissionRepo.clearCurrentExpertTracking.mockResolvedValue(
        undefined,
      );

      vi.spyOn(
        service as any,
        'notifyModeratorsAndAdminsForApproval',
      ).mockResolvedValue(undefined);

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
      } as any);

      expect(
        mockQuestionSubmissionRepo.updateHistoryByUserId,
      ).toHaveBeenCalledWith(
        questionId,
        expertId,
        expect.objectContaining({
          status: 'approved',
        }),
        expect.anything(),
      );
    });
    it('updates question to in-review after enough approvals', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        question: 'Question',
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      mockReviewRepo.createReview.mockResolvedValue({
        insertedId: '507f1f77bcf86cd799439015',
      });

      vi.spyOn(service, 'incrementApprovalCount').mockResolvedValue(3);

      mockQuestionSubmissionRepo.updateHistoryByUserId.mockResolvedValue(
        undefined,
      );
      mockAnswerRepo.updateAnswerStatus.mockResolvedValue(undefined);
      mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);
      mockUserRepo.updateReputationScore.mockResolvedValue(undefined);
      mockQuestionSubmissionRepo.clearCurrentExpertTracking.mockResolvedValue(
        undefined,
      );

      vi.spyOn(
        service as any,
        'notifyModeratorsAndAdminsForApproval',
      ).mockResolvedValue(undefined);

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
      } as any);

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        {status: 'in-review'},
        expect.anything(),
      );
    });
    it('rejects an answer successfully', async () => {
      setupRejectedReview();

      const result = await service.reviewAnswer(expertId, {
        questionId,
        status: 'rejected',
        rejectedAnswer: answerId,
        answer: 'New Answer',
        reasonForRejection: 'Incorrect',
        sources: [],
      } as any);

      expect(mockUserRepo.updatePenaltyAndIncentive).toHaveBeenCalledWith(
        expertId,
        'penalty',
        expect.anything(),
      );

      expect(mockAnswerRepo.updateAnswerStatus).toHaveBeenCalledWith(answerId, {
        status: 'rejected',
      });

      expect(service.addAnswer).toHaveBeenCalled();

      expect(result).toEqual({
        message: 'Your response recorded sucessfully, thankyou!',
      });
    });
    it('throws when rejected replacement answer is identical', async () => {
      setupRejectedReview();

      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        answer: 'Same Answer',
        authorId: moderatorId,
      });

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
          status: 'rejected',
          rejectedAnswer: answerId,
          answer: 'Same Answer',
          reasonForRejection: 'Wrong',
          sources: [],
        } as any),
      ).rejects.toThrow(
        'The submitted answer is either identical to the existing answer',
      );

      expect(service.addAnswer).not.toHaveBeenCalled();
    });
    it('modifies an answer successfully', async () => {
      setupModifiedReview();

      const result = await service.reviewAnswer(expertId, {
        questionId,
        status: 'modified',
        modifiedAnswer: answerId,
        answer: 'Updated Answer',
        reasonForModification: 'Grammar',
        sources: [],
      } as any);

      expect(mockAnswerRepo.updateAnswer).toHaveBeenCalled();

      expect(mockAnswerRepo.resetApprovalCount).toHaveBeenCalledWith(
        answerId,
        expect.anything(),
      );

      expect(mockAnswerRepo.addAnswerModification).toHaveBeenCalled();

      expect(result).toEqual({
        message: 'Your response recorded sucessfully, thankyou!',
      });
    });
    it('throws when modified answer is identical', async () => {
      setupModifiedReview();

      mockAnswerRepo.getById.mockResolvedValue({
        _id: answerId,
        answer: 'Same Answer',
        authorId: expertId,
      });

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
          status: 'modified',
          modifiedAnswer: answerId,
          answer: 'Same Answer',
          reasonForModification: 'Grammar',
          sources: [],
        } as any),
      ).rejects.toThrow(
        'The submitted answer is identical to the existing answer',
      );

      expect(mockAnswerRepo.updateAnswer).not.toHaveBeenCalled();
    });
    it('resets approval count after modification', async () => {
      setupModifiedReview();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'modified',
        modifiedAnswer: answerId,
        answer: 'Updated Answer',
        reasonForModification: 'Grammar',
        sources: [],
      } as any);

      expect(mockAnswerRepo.resetApprovalCount).toHaveBeenCalledWith(
        answerId,
        expect.anything(),
      );
    });
    it('stores answer modification history', async () => {
      setupModifiedReview();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'modified',
        modifiedAnswer: answerId,
        answer: 'Updated Answer',
        reasonForModification: 'Grammar',
        sources: [],
      } as any);

      expect(mockAnswerRepo.addAnswerModification).toHaveBeenCalledTimes(1);
    });
    it('sends notification after modification', async () => {
      setupModifiedReview();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'modified',
        modifiedAnswer: answerId,
        answer: 'Updated Answer',
        reasonForModification: 'Grammar',
        sources: [],
      } as any);

      expect(
        mockNotificationService.saveTheNotifications,
      ).toHaveBeenCalledTimes(1);
    });
    it('allocates review to the next expert in queue', async () => {
      setupQueueAllocationReview();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockQuestionSubmissionRepo.update).toHaveBeenCalled();

      expect(mockUserRepo.updateReputationScore).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439099',
        true,
        expect.anything(),
      );

      expect(mockNotificationService.saveTheNotifications).toHaveBeenCalled();
    });
    it('auto allocates more experts when current reviewer is last in queue', async () => {
      setupQueueAllocationReview();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        source: 'WEB',
        status: 'open',
        isAutoAllocate: true,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockQuestionService.autoAllocateExperts).toHaveBeenCalledWith(
        questionId,
        expect.anything(),
      );
    });
    it('does not auto allocate experts for AJRASAKHA questions', async () => {
      setupQueueAllocationReview();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        source: 'AJRASAKHA',
        status: 'open',
        isAutoAllocate: true,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockQuestionService.autoAllocateExperts).not.toHaveBeenCalled();
    });
    it('does not auto allocate experts for WhatsApp questions', async () => {
      setupQueueAllocationReview();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        source: 'WHATSAPP',
        status: 'open',
        isAutoAllocate: true,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockQuestionService.autoAllocateExperts).not.toHaveBeenCalled();
    });
    it('does not auto allocate experts when auto allocation is disabled', async () => {
      setupQueueAllocationReview();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        source: 'WEB',
        status: 'open',
        isAutoAllocate: false,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockQuestionService.autoAllocateExperts).not.toHaveBeenCalled();
    });
    it('moves question to in-review after ten reviews', async () => {
      setupQueueAllocationReview();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        source: 'WEB',
        status: 'open',
        isAutoAllocate: false,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: Array.from({length: 10}, () => ({
          updatedBy: expertId,
          answer: answerId,
          status: 'reviewed',
        })),
      });

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        {
          status: 'in-review',
        },
        expect.anything(),
      );
    });
    it('notifies moderators when review history reaches ten', async () => {
      setupQueueAllocationReview();

      vi.spyOn(
        service as any,
        'notifyModeratorsAndAdminsForApproval',
      ).mockResolvedValue(undefined);

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: Array.from({length: 10}, () => ({
          updatedBy: expertId,
          answer: answerId,
          status: 'reviewed',
        })),
      });

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(
        (service as any).notifyModeratorsAndAdminsForApproval,
      ).toHaveBeenCalledWith(questionId, 'Question', expect.anything());
    });
    it('clears current expert tracking after review', async () => {
      setupQueueAllocationReview();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(
        mockQuestionSubmissionRepo.clearCurrentExpertTracking,
      ).toHaveBeenCalledWith(questionId, expect.anything());
    });
    it('decrements reviewer workload after review', async () => {
      setupQueueAllocationReview();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockUserRepo.updateReputationScore).toHaveBeenLastCalledWith(
        expertId,
        false,
        expect.anything(),
      );
    });
    it('does not notify moderators when question is already in-review', async () => {
      setupQueueAllocationReview();

      const notifySpy = vi
        .spyOn(service as any, 'notifyModeratorsAndAdminsForApproval')
        .mockResolvedValue(undefined);

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        source: 'WEB',
        status: 'in-review',
        isAutoAllocate: false,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: Array.from({length: 10}, () => ({
          updatedBy: expertId,
          answer: answerId,
          status: 'reviewed',
        })),
      });

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(notifySpy).not.toHaveBeenCalled();
    });
    it('does not allocate next reviewer when current reviewer is not in queue', async () => {
      setupQueueAllocationReview();

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: ['507f1f77bcf86cd799439099'],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockQuestionSubmissionRepo.update).not.toHaveBeenCalled();
    });
    it('does not allocate next reviewer when current reviewer is last in queue', async () => {
      setupQueueAllocationReview();

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [
          {
            updatedBy: expertId,
            answer: answerId,
            status: 'in-review',
          },
        ],
      });

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockQuestionSubmissionRepo.update).not.toHaveBeenCalled();
    });
    it('does not allocate another reviewer when history already has ten entries', async () => {
      setupQueueAllocationReview();

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId, '507f1f77bcf86cd799439099'],
        history: Array.from({length: 10}, () => ({
          updatedBy: expertId,
          answer: answerId,
          status: 'reviewed',
        })),
      });

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockQuestionSubmissionRepo.update).not.toHaveBeenCalled();
    });
    it('marks answer as pending with moderator after three approvals', async () => {
      setupAcceptedReviewWithThreeApprovals();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockAnswerRepo.updateAnswerStatus).toHaveBeenCalledWith(
        answerId,
        {
          status: 'pending-with-moderator',
        },
        expect.anything(),
      );
    });
    it('marks expert history as approved after three approvals', async () => {
      setupAcceptedReviewWithThreeApprovals();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(
        mockQuestionSubmissionRepo.updateHistoryByUserId,
      ).toHaveBeenLastCalledWith(
        questionId,
        expertId,
        {
          status: 'approved',
        },
        expect.anything(),
      );
    });
    it('updates question to in-review after three approvals', async () => {
      setupAcceptedReviewWithThreeApprovals();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        {
          status: 'in-review',
        },
        expect.anything(),
      );
    });
    it('clears current expert tracking after three approvals', async () => {
      setupAcceptedReviewWithThreeApprovals();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(
        mockQuestionSubmissionRepo.clearCurrentExpertTracking,
      ).toHaveBeenCalledWith(questionId, expect.anything());
    });
    it('returns success immediately after three approvals', async () => {
      setupAcceptedReviewWithThreeApprovals();

      const result = await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(result).toEqual({
        message: 'Your response recorded sucessfully, thankyou!',
      });

      expect(mockQuestionSubmissionRepo.update).not.toHaveBeenCalled();
    });
    it('creates the first answer successfully', async () => {
      setupFirstSubmissionReview();

      const result = await service.reviewAnswer(expertId, {
        questionId,
        answer: 'First answer',
        sources: [],
        remarks: 'remarks',
      } as any);

      expect(service.addAnswer).toHaveBeenCalledWith(
        questionId,
        expertId,
        'First answer',
        [],
        expect.anything(),
        'in-review',
        'remarks',
      );

      expect(mockQuestionSubmissionRepo.update).toHaveBeenCalled();

      expect(result).toEqual({
        message: 'Your response recorded sucessfully, thankyou!',
      });
    });
    it('stores first answer in submission history', async () => {
      setupFirstSubmissionReview();

      await service.reviewAnswer(expertId, {
        questionId,
        answer: 'First answer',
        sources: [],
      } as any);

      expect(mockQuestionSubmissionRepo.update).toHaveBeenCalledWith(
        questionId,
        expect.objectContaining({
          answer: expect.anything(),
          status: 'in-review',
        }),
        expect.anything(),
      );
    });
    it('clears expert tracking after first submission', async () => {
      setupFirstSubmissionReview();

      await service.reviewAnswer(expertId, {
        questionId,
        answer: 'First answer',
        sources: [],
      } as any);

      expect(
        mockQuestionSubmissionRepo.clearCurrentExpertTracking,
      ).toHaveBeenCalledWith(questionId, expect.anything());
    });
    it('decrements expert workload after first submission', async () => {
      setupFirstSubmissionReview();

      await service.reviewAnswer(expertId, {
        questionId,
        answer: 'First answer',
        sources: [],
      } as any);

      expect(mockUserRepo.updateReputationScore).toHaveBeenLastCalledWith(
        expertId,
        false,
        expect.anything(),
      );
    });
    it('marks question as pae_submitted for PAE expert', async () => {
      setupFirstSubmissionReview();

      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'pae_expert',
      });

      await service.reviewAnswer(expertId, {
        questionId,
        answer: 'Answer',
        sources: [],
      } as any);

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        {
          status: 'pae_submitted',
        },
        expect.anything(),
      );

      expect(mockUserRepo.updateReputationScore).toHaveBeenCalledWith(
        expertId,
        false,
        expect.anything(),
      );

      expect(
        mockQuestionSubmissionRepo.clearCurrentExpertTracking,
      ).toHaveBeenCalledWith(questionId, expect.anything());
    });
    it('marks AJRASAKHA question as opened by expert', async () => {
      setupFirstSubmissionReview();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        source: 'AJRASAKHA',
        status: 'open',
      });

      mockQuestionSubmissionRepo.getByQuestionId
        .mockResolvedValueOnce({
          queue: [expertId],
          history: [],
        })
        .mockResolvedValueOnce({
          currentExpertOpenedAt: null,
        });

      await service.reviewAnswer(expertId, {
        questionId,
        answer: 'Answer',
        sources: [],
      } as any);

      expect(
        mockQuestionSubmissionRepo.markQuestionOpenedByExpert,
      ).toHaveBeenCalledWith(questionId, expertId);
    });
    it('marks WhatsApp question as opened by expert', async () => {
      setupFirstSubmissionReview();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        source: 'WHATSAPP',
        status: 'open',
      });

      mockQuestionSubmissionRepo.getByQuestionId
        .mockResolvedValueOnce({
          queue: [expertId],
          history: [],
        })
        .mockResolvedValueOnce({
          currentExpertOpenedAt: null,
        });

      await service.reviewAnswer(expertId, {
        questionId,
        answer: 'Answer',
        sources: [],
      } as any);

      expect(
        mockQuestionSubmissionRepo.markQuestionOpenedByExpert,
      ).toHaveBeenCalledWith(questionId, expertId);
    });
    it('does not mark question opened when currentExpertOpenedAt already exists', async () => {
      setupFirstSubmissionReview();

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Question',
        source: 'AJRASAKHA',
        status: 'open',
      });

      mockQuestionSubmissionRepo.getByQuestionId
        .mockResolvedValueOnce({
          queue: [expertId],
          history: [],
        })
        .mockResolvedValueOnce({
          currentExpertOpenedAt: new Date(),
        });

      await service.reviewAnswer(expertId, {
        questionId,
        answer: 'Answer',
        sources: [],
      } as any);

      expect(
        mockQuestionSubmissionRepo.markQuestionOpenedByExpert,
      ).not.toHaveBeenCalled();
    });
    it('throws when review creation fails', async () => {
      setupQueueAllocationReview();

      mockReviewRepo.createReview.mockResolvedValue({});

      await expect(
        service.reviewAnswer(expertId, {
          questionId,
          status: 'accepted',
          approvedAnswer: answerId,
          answer: 'Approved',
        } as any),
      ).rejects.toThrow('Failed to create review entry. Please try again.');
    });
    it('creates an accepted review entry', async () => {
      setupQueueAllocationReview();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'accepted',
        approvedAnswer: answerId,
        answer: 'Approved',
      } as any);

      expect(mockReviewRepo.createReview).toHaveBeenCalledWith(
        'answer',
        'accepted',
        questionId,
        expertId,
        answerId,
        '',
        undefined,
        false,
        expect.anything(),
      );
    });
    it('stores rejection reason in review', async () => {
      setupRejectedReview();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'rejected',
        rejectedAnswer: answerId,
        answer: 'New Answer',
        reasonForRejection: 'Incorrect',
        sources: [],
      } as any);

      expect(mockReviewRepo.createReview).toHaveBeenCalledWith(
        'answer',
        'rejected',
        questionId,
        expertId,
        answerId,
        'Incorrect',
        undefined,
        false,
        expect.anything(),
      );
    });
    it('stores modification reason in review', async () => {
      setupModifiedReview();

      await service.reviewAnswer(expertId, {
        questionId,
        status: 'modified',
        modifiedAnswer: answerId,
        answer: 'Updated',
        reasonForModification: 'Grammar',
        sources: [],
      } as any);

      expect(mockReviewRepo.createReview).toHaveBeenCalledWith(
        'answer',
        'modified',
        questionId,
        expertId,
        answerId,
        'Grammar',
        undefined,
        false,
        expect.anything(),
      );
    });
    it('does not create a review entry for first submission', async () => {
      setupFirstSubmissionReview();

      await service.reviewAnswer(expertId, {
        questionId,
        answer: 'First Answer',
        sources: [],
      } as any);

      expect(mockReviewRepo.createReview).not.toHaveBeenCalled();
    });
  });
});
