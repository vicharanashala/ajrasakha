import 'reflect-metadata';

import {beforeEach, describe, expect, it, vi} from 'vitest';

import {ReRouteService} from '../services/ReRouteService.js';

vi.mock('#root/modules/core/index.js', () => ({
  NotificationService: class {},
}));

describe('ReRouteService', () => {
  // ==========================================================
  // Shared Constants
  // ==========================================================

  const moderatorId = '507f1f77bcf86cd799439011';
  const expertId = '507f1f77bcf86cd799439012';
  const questionId = '507f1f77bcf86cd799439013';
  const answerId = '507f1f77bcf86cd799439016';
  const rerouteId = '507f1f77bcf86cd799439015';

  // ==========================================================
  // Repository Mocks
  // ==========================================================

  const mockReRouteRepository = {
    findByQuestionId: vi.fn(),
    addrerouteAnswer: vi.fn(),
    pushRerouteHistory: vi.fn(),
    getAllocatedQuestions: vi.fn(),
    getAllocatedQuestionsByID: vi.fn(),
    rejectRerouteRequest: vi.fn(),
    getRerouteHistory: vi.fn(),
    updateStatus: vi.fn(),
  };

  const mockUserRepo = {
    findById: vi.fn(),
    updateReputationScore: vi.fn(),
  };

  const mockNotificationService = {
    saveTheNotifications: vi.fn(),
  };

  const mockQuestionRepo = {
    getById: vi.fn(),
    updateQuestionStatus: vi.fn(),
  };

  const mockMongoDatabase = {};

  // ==========================================================
  // Service
  // ==========================================================

  let service: ReRouteService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new ReRouteService(
      mockMongoDatabase as any,
      mockReRouteRepository as any,
      mockUserRepo as any,
      mockNotificationService as any,
      mockQuestionRepo as any,
    );

    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback({}),
    );
  });

  // ==========================================================
  // Helper Functions
  // ==========================================================

  function setupAddRerouteAnswer() {
    mockUserRepo.findById.mockResolvedValue({
      _id: expertId,
      role: 'expert',
      firstName: 'John',
      lastName: 'Doe',
    });

    mockReRouteRepository.findByQuestionId.mockResolvedValue(null);

    mockReRouteRepository.addrerouteAnswer.mockResolvedValue({
      insertedId: rerouteId,
    });

    mockUserRepo.updateReputationScore.mockResolvedValue(undefined);

    mockQuestionRepo.updateQuestionStatus.mockResolvedValue(undefined);

    mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);
  }

  function setupExistingReroute() {
    setupAddRerouteAnswer();

    mockReRouteRepository.findByQuestionId.mockResolvedValue({
      _id: rerouteId,
      answerId,
      questionId,
      reroutes: [
        {
          status: 'completed',
        },
      ],
    });

    mockReRouteRepository.pushRerouteHistory.mockResolvedValue(undefined);
  }

  function setupGetAllocatedQuestions() {
    mockUserRepo.findById.mockResolvedValue({
      _id: expertId,
      role: 'expert',
    });

    mockReRouteRepository.getAllocatedQuestions.mockResolvedValue([
      {
        questionId,
        answerId,
        status: 'pending',
      },
    ]);
  }

  function setupGetQuestionById() {
    mockQuestionRepo.getById.mockResolvedValue({
      _id: questionId,
      question: 'How do I grow wheat?',
      source: 'WEB',
      details: {
        crop: 'Wheat',
      },
      status: 're-routed',
      priority: 'high',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-02'),
      totalAnswersCount: 2,
      pae_review: false,
    });

    mockReRouteRepository.getAllocatedQuestionsByID.mockResolvedValue([
      {
        answerId,
        status: 'pending',
      },
    ]);
  }

  function setupRejectExpertReroute() {
    mockReRouteRepository.findByQuestionId.mockResolvedValue({
      _id: rerouteId,
      reroutes: [
        {
          status: 'pending',
        },
      ],
    });

    mockReRouteRepository.rejectRerouteRequest.mockResolvedValue(undefined);

    mockUserRepo.findById.mockResolvedValue({
      _id: expertId,
      email: 'expert@test.com',
    });

    mockUserRepo.updateReputationScore.mockResolvedValue(undefined);

    mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);

    mockQuestionRepo.updateQuestionStatus.mockResolvedValue(undefined);
  }

  function setupGetRerouteHistory() {
    mockReRouteRepository.getRerouteHistory.mockResolvedValue([
      {
        answerId,
        status: 'pending',
        comment: 'Need domain expert',
      },
    ]);
  }

  function setupModeratorReject() {
    mockReRouteRepository.updateStatus.mockResolvedValue(undefined);
  }

  // ==========================================================
  // addrerouteAnswer
  // ==========================================================

  describe('addrerouteAnswer', () => {
    it('creates a reroute successfully', async () => {
      setupAddRerouteAnswer();

      await service.addrerouteAnswer(
        questionId,
        expertId,
        answerId,
        moderatorId,
        'Need domain expert',
        'pending',
      );

      expect(mockUserRepo.findById).toHaveBeenCalledWith(expertId, {});

      expect(mockReRouteRepository.findByQuestionId).toHaveBeenCalledWith(
        questionId,
        expect.anything(),
      );

      expect(mockReRouteRepository.addrerouteAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          questionId: expect.any(Object),
          answerId: expect.any(Object),
          reroutes: [
            expect.objectContaining({
              status: 'pending',
              comment: 'Need domain expert',
            }),
          ],
        }),
        expect.anything(),
      );

      expect(mockUserRepo.updateReputationScore).toHaveBeenCalledWith(
        expertId,
        true,
        expect.anything(),
      );
    });

    it('updates question status to re-routed', async () => {
      setupAddRerouteAnswer();

      await service.addrerouteAnswer(
        questionId,
        expertId,
        answerId,
        moderatorId,
        'Need domain expert',
        'pending',
      );

      expect(mockQuestionRepo.updateQuestionStatus).toHaveBeenCalledWith(
        questionId,
        're-routed',
        null,
        expect.anything(),
      );
    });

    it('sends notification to the assigned expert', async () => {
      setupAddRerouteAnswer();

      await service.addrerouteAnswer(
        questionId,
        expertId,
        answerId,
        moderatorId,
        'Need domain expert',
        'pending',
      );

      expect(mockNotificationService.saveTheNotifications).toHaveBeenCalled();
    });

    it('increments expert workload after rerouting', async () => {
      setupAddRerouteAnswer();

      await service.addrerouteAnswer(
        questionId,
        expertId,
        answerId,
        moderatorId,
        'Need domain expert',
        'pending',
      );

      expect(mockUserRepo.updateReputationScore).toHaveBeenCalledWith(
        expertId,
        true,
        expect.anything(),
      );
    });
  });

  // ==========================================================
  // getAllocatedQuestions
  // ==========================================================

  describe('getAllocatedQuestions', () => {
    it('pushes reroute history when a reroute already exists', async () => {
      setupExistingReroute();

      await service.addrerouteAnswer(
        questionId,
        expertId,
        answerId,
        moderatorId,
        'Need domain expert',
        'pending',
      );

      expect(mockReRouteRepository.addrerouteAnswer).not.toHaveBeenCalled();

      expect(mockReRouteRepository.pushRerouteHistory).toHaveBeenCalledWith(
        answerId,
        rerouteId,
        expect.objectContaining({
          status: 'pending',
          comment: 'Need domain expert',
        }),
        expect.any(Date),
        expect.anything(),
      );
    });

    it('throws when expert is not found', async () => {
      setupAddRerouteAnswer();

      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.addrerouteAnswer(
          questionId,
          expertId,
          answerId,
          moderatorId,
          'Need domain expert',
          'pending',
        ),
      ).rejects.toThrow('Failed to add expert: Expert not found');

      expect(mockReRouteRepository.addrerouteAnswer).not.toHaveBeenCalled();
    });
    it('throws when latest reroute is already pending', async () => {
      setupAddRerouteAnswer();

      mockReRouteRepository.findByQuestionId.mockResolvedValue({
        _id: rerouteId,
        reroutes: [
          {
            status: 'pending',
          },
        ],
      });

      await expect(
        service.addrerouteAnswer(
          questionId,
          expertId,
          answerId,
          moderatorId,
          'Need domain expert',
          'pending',
        ),
      ).rejects.toThrow(
        'Failed to add expert: The answer is already rerouted, you cannot assign a new expert. Please reload',
      );

      expect(mockReRouteRepository.pushRerouteHistory).not.toHaveBeenCalled();
    });
    it('returns allocated questions successfully', async () => {
      setupGetAllocatedQuestions();

      const query = {
        page: 1,
        limit: 10,
      };

      const body = {};

      const result = await service.getAllocatedQuestions(
        expertId,
        query as any,
        body as any,
      );

      expect(mockUserRepo.findById).toHaveBeenCalledWith(expertId);

      expect(mockReRouteRepository.getAllocatedQuestions).toHaveBeenCalledWith(
        expertId,
        query,
        expect.anything(),
        body,
      );
      expect(result).toEqual([
        {
          questionId,
          answerId,
          status: 'pending',
        },
      ]);
    });
    it('throws when expert is not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      const query = {};
      const body = {};

      await expect(
        service.getAllocatedQuestions(expertId, query as any, body as any),
      ).rejects.toThrow('Expert not found');

      expect(
        mockReRouteRepository.getAllocatedQuestions,
      ).not.toHaveBeenCalled();
    });

    it('returns an empty array when no questions are allocated', async () => {
      setupGetAllocatedQuestions();

      mockReRouteRepository.getAllocatedQuestions.mockResolvedValue([]);

      const query = {
        page: 1,
        limit: 10,
      };

      const body = {};

      const result = await service.getAllocatedQuestions(
        expertId,
        query as any,
        body as any,
      );

      expect(result).toEqual([]);
    });
  });

  // ==========================================================
  // getQuestionById
  // ==========================================================

  describe('getQuestionById', () => {
    it('returns question details successfully', async () => {
      setupGetQuestionById();

      const result = await service.getQuestionById(questionId, expertId);

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith(questionId);

      expect(
        mockReRouteRepository.getAllocatedQuestionsByID,
      ).toHaveBeenCalledWith(questionId, expertId, expect.anything());

      expect(result).toEqual({
        id: questionId,
        text: 'How do I grow wheat?',
        source: 'WEB',
        details: {
          crop: 'Wheat',
        },
        status: 're-routed',
        priority: 'high',
        aiInitialAnswer: '',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        totalAnswersCount: 2,
        history: [
          {
            answerId,
            status: 'pending',
          },
        ],
        pae_review: false,
      });
    });

    it('throws when question is not found', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.getQuestionById(questionId, expertId),
      ).rejects.toThrow(`Failed to find question with id: ${questionId}`);

      expect(
        mockReRouteRepository.getAllocatedQuestionsByID,
      ).not.toHaveBeenCalled();
    });

    it('returns an empty history when no reroute history exists', async () => {
      setupGetQuestionById();

      mockReRouteRepository.getAllocatedQuestionsByID.mockResolvedValue([]);

      const result = await service.getQuestionById(questionId, expertId);

      expect(result.history).toEqual([]);
    });
  });

  // ==========================================================
  // rejectRerouteRequest
  // ==========================================================

  describe('rejectRerouteRequest', () => {
    it('allows expert to reject a reroute request', async () => {
      setupRejectExpertReroute();

      await service.rejectRerouteRequest(
        rerouteId,
        questionId,
        expertId,
        moderatorId,
        'Not my domain',
        'expert',
      );

      expect(mockReRouteRepository.rejectRerouteRequest).toHaveBeenCalledWith(
        rerouteId,
        'Not my domain',
        'expert',
        expect.anything(),
      );

      expect(mockUserRepo.updateReputationScore).toHaveBeenCalledWith(
        expertId,
        false,
        expect.anything(),
      );

      expect(mockNotificationService.saveTheNotifications).toHaveBeenCalledWith(
        expect.stringContaining('expert@test.com'),
        'Re Route request rejected',
        questionId,
        moderatorId,
        're-routed-rejected-expert',
        expect.anything(),
      );

      expect(mockQuestionRepo.updateQuestionStatus).toHaveBeenCalledWith(
        questionId,
        'in-review',
        null,
        expect.anything(),
      );
    });

    it('allows moderator to reject a reroute request', async () => {
      setupRejectExpertReroute();

      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,
        email: 'moderator@test.com',
      });

      await service.rejectRerouteRequest(
        rerouteId,
        questionId,
        expertId,
        moderatorId,
        'Rejected',
        'moderator',
      );

      expect(mockReRouteRepository.rejectRerouteRequest).toHaveBeenCalledWith(
        rerouteId,
        'Rejected',
        'moderator',
        expect.anything(),
      );

      expect(mockNotificationService.saveTheNotifications).toHaveBeenCalledWith(
        expect.stringContaining('moderator@test.com'),
        'Re Route request rejected',
        questionId,
        expertId,
        're-routed-rejected-moderator',
        expect.anything(),
      );

      expect(mockQuestionRepo.updateQuestionStatus).toHaveBeenCalledWith(
        questionId,
        'in-review',
        null,
        expect.anything(),
      );
    });

    it('throws when reroute has already been rejected by expert', async () => {
      setupRejectExpertReroute();

      mockReRouteRepository.findByQuestionId.mockResolvedValue({
        reroutes: [
          {
            status: 'expert_rejected',
          },
        ],
      });

      await expect(
        service.rejectRerouteRequest(
          rerouteId,
          questionId,
          expertId,
          moderatorId,
          'Rejected',
          'expert',
        ),
      ).rejects.toThrow(
        'You have already rejected the response please refresh the page',
      );

      expect(mockReRouteRepository.rejectRerouteRequest).not.toHaveBeenCalled();
    });

    it('throws when reroute has already been rejected by moderator', async () => {
      setupRejectExpertReroute();

      mockReRouteRepository.findByQuestionId.mockResolvedValue({
        reroutes: [
          {
            status: 'moderator_rejected',
          },
        ],
      });

      await expect(
        service.rejectRerouteRequest(
          rerouteId,
          questionId,
          expertId,
          moderatorId,
          'Rejected',
          'moderator',
        ),
      ).rejects.toThrow(
        'You have already rejected the response please refresh the page',
      );

      expect(mockReRouteRepository.rejectRerouteRequest).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // getRerouteHistory
  // ==========================================================

  describe('getRerouteHistory', () => {
    it('returns reroute history successfully', async () => {
      setupGetRerouteHistory();

      const result = await service.getRerouteHistory(answerId);

      expect(mockReRouteRepository.getRerouteHistory).toHaveBeenCalledWith(
        answerId,
        expect.anything(),
      );

      expect(result).toEqual([
        {
          answerId,
          status: 'pending',
          comment: 'Need domain expert',
        },
      ]);
    });

    it('returns an empty history when none exists', async () => {
      mockReRouteRepository.getRerouteHistory.mockResolvedValue([]);

      const result = await service.getRerouteHistory(answerId);

      expect(result).toEqual([]);
    });
  });

  // ==========================================================
  // moderatorReject
  // ==========================================================

  describe('moderatorReject', () => {
    it('updates reroute status successfully', async () => {
      setupModeratorReject();

      await service.moderatorReject(
        questionId,
        expertId,
        'moderator_rejected',
        'Duplicate request',
      );

      expect(mockReRouteRepository.updateStatus).toHaveBeenCalledWith(
        questionId,
        expertId,
        'moderator_rejected',
        undefined,
        'Duplicate request',
        expect.anything(),
      );
    });

    it('propagates repository errors', async () => {
      mockReRouteRepository.updateStatus.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.moderatorReject(
          questionId,
          expertId,
          'moderator_rejected',
          'Duplicate request',
        ),
      ).rejects.toThrow('Database failure');
    });
  });
});
