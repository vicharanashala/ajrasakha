import {beforeEach, describe, expect, it, vi} from 'vitest';

import {notifyUser} from '#root/utils/pushNotification.js';

import {RequestService} from '../services/RequestService.js';

vi.mock('#root/modules/core/index.js', () => ({
  NotificationService: class {},
}));

vi.mock('#root/utils/pushNotification.js', () => ({
  notifyUser: vi.fn(),
}));

describe('RequestService', () => {
  // ==========================================================

  // Shared Constants

  // ==========================================================

  const moderatorId = '507f1f77bcf86cd799439011';

  const moderatorId2 = '507f1f77bcf86cd799439012';

  const requesterId = '507f1f77bcf86cd799439013';

  const questionId = '507f1f77bcf86cd799439014';

  const requestId = '507f1f77bcf86cd799439015';

  // ==========================================================

  // Repository Mocks

  // ==========================================================

  const mockRequestRepository = {
    createRequest: vi.fn(),

    getAllRequests: vi.fn(),

    getRequestById: vi.fn(),

    updateStatus: vi.fn(),

    softDeleteById: vi.fn(),

    getRequestStatusById: vi.fn(),
  };

  const mockQuestionRepo = {
    getById: vi.fn(),

    updateQuestion: vi.fn(),
  };

  const mockUserRepo = {
    findById: vi.fn(),

    findModerators: vi.fn(),
  };

  const mockNotificationRepository = {
    addNotification: vi.fn(),

    getSubscriptionByUserId: vi.fn(),
  };

  const mockNotificationService = {
    deleteExpiredSubscriptionForUser: vi.fn(),
  };

  const mockMongoDatabase = {};

  // ==========================================================

  // Service

  // ==========================================================

  let service: RequestService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new RequestService(
      mockRequestRepository as any,

      mockQuestionRepo as any,

      mockUserRepo as any,

      mockNotificationRepository as any,

      mockNotificationService as any,

      mockMongoDatabase as any,
    );

    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback({}),
    );
  });

  // ==========================================================

  // Helper Functions

  // ==========================================================

  function setupCreateRequest() {
    mockRequestRepository.createRequest.mockResolvedValue({
      _id: requestId,

      entityId: questionId,

      requestType: 'question_flag',
    });

    mockUserRepo.findModerators.mockResolvedValue([
      {_id: moderatorId},

      {_id: moderatorId2},
    ]);

    mockNotificationRepository.addNotification.mockResolvedValue(undefined);
  }

  function setupGetAllRequests() {
    mockUserRepo.findById.mockResolvedValue({
      _id: moderatorId,

      role: 'moderator',
    });

    mockRequestRepository.getAllRequests.mockResolvedValue({
      requests: [
        {
          _id: requestId,

          entityId: questionId,
        },
      ],

      totalPages: 1,

      totalCount: 1,
    });
  }

  function setupUpdateStatus() {
    mockRequestRepository.getRequestById.mockResolvedValue({
      _id: requestId,

      entityId: questionId,

      requestedBy: requesterId,

      status: 'pending',

      requestType: 'question_flag',

      details: {
        crop: 'Rice',
      },
    });

    mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

    mockRequestRepository.updateStatus.mockResolvedValue({
      status: 'approved',

      response: 'Looks good',
    });

    mockNotificationRepository.getSubscriptionByUserId.mockResolvedValue({
      endpoint: 'endpoint',
    });

    mockNotificationRepository.addNotification.mockResolvedValue(undefined);

    vi.mocked(notifyUser).mockResolvedValue(undefined);
  }

  function setupUpdateStatusRejected() {}

  function setupGetRequestDiff() {
    mockRequestRepository.getRequestById.mockResolvedValue({
      _id: requestId,

      entityId: questionId,

      requestType: 'question_flag',

      details: {
        crop: 'Rice',

        status: 'approved',
      },

      responses: [
        {
          reviewedBy: moderatorId,

          response: 'Looks good',
        },
      ],
    });

    mockQuestionRepo.getById.mockResolvedValue({
      _id: questionId,

      crop: 'Wheat',

      status: 'pending',

      question: 'Question',

      createdAt: new Date(),

      updatedAt: new Date(),

      userId: requesterId,

      contextId: 'context',

      text: 'embedding text',

      metrics: {},

      embedding: [],
    });
  }

  function setupSoftDeleteRequest() {
    mockUserRepo.findById.mockResolvedValue({
      _id: moderatorId,

      role: 'moderator',
    });

    mockRequestRepository.getRequestById.mockResolvedValue({
      _id: requestId,

      isDeleted: false,
    });

    mockRequestRepository.softDeleteById.mockResolvedValue(undefined);
  }

  // ==========================================================

  // createRequest

  // ==========================================================

  describe('createRequest', () => {
    it('creates a request successfully', async () => {
      setupCreateRequest();

      const body = {
        entityId: questionId,

        requestType: 'question_flag',

        details: {},
      };

      const result = await service.createRequest(body as any, requesterId);

      expect(mockRequestRepository.createRequest).toHaveBeenCalledWith(
        body,

        requesterId,

        expect.anything(),
      );

      expect(result).toEqual({
        _id: requestId,

        entityId: questionId,

        requestType: 'question_flag',
      });
    });

    it('creates notifications for all moderators', async () => {
      setupCreateRequest();

      const body = {
        entityId: questionId,

        requestType: 'question_flag',

        details: {},
      };

      await service.createRequest(body as any, requesterId);

      expect(mockNotificationRepository.addNotification).toHaveBeenCalledTimes(
        2,
      );

      expect(
        mockNotificationRepository.addNotification,
      ).toHaveBeenNthCalledWith(
        1,

        moderatorId,

        questionId,

        'flag',

        `A new Question Flag raised QuestionId ${questionId}`,

        'New Flag Raised',
      );

      expect(
        mockNotificationRepository.addNotification,
      ).toHaveBeenNthCalledWith(
        2,

        moderatorId2,

        questionId,

        'flag',

        `A new Question Flag raised QuestionId ${questionId}`,

        'New Flag Raised',
      );
    });

    it('creates request even when there are no moderators', async () => {
      setupCreateRequest();

      mockUserRepo.findModerators.mockResolvedValue([]);

      const body = {
        entityId: questionId,

        requestType: 'question_flag',

        details: {},
      };

      const result = await service.createRequest(body as any, requesterId);

      expect(mockRequestRepository.createRequest).toHaveBeenCalled();

      expect(mockNotificationRepository.addNotification).not.toHaveBeenCalled();

      expect(result).toEqual({
        _id: requestId,

        entityId: questionId,

        requestType: 'question_flag',
      });
    });

    it('throws InternalServerError when request creation fails', async () => {
      mockRequestRepository.createRequest.mockRejectedValue(
        new Error('Database error'),
      );

      mockUserRepo.findModerators.mockResolvedValue([]);

      const body = {
        entityId: questionId,

        requestType: 'question_flag',

        details: {},
      };

      await expect(
        service.createRequest(body as any, requesterId),
      ).rejects.toThrow('Failed to create this request Error: Database error');

      expect(mockNotificationRepository.addNotification).not.toHaveBeenCalled();
    });
  });

  // ==========================================================

  // getAllRequests

  // ==========================================================

  describe('getAllRequests', () => {
    it('returns all requests successfully', async () => {
      setupGetAllRequests();

      const query = {
        page: 1,

        limit: 10,
      };

      const result = await service.getAllRequests(moderatorId, query as any);

      expect(mockUserRepo.findById).toHaveBeenCalledWith(
        moderatorId,

        expect.anything(),
      );

      expect(mockRequestRepository.getAllRequests).toHaveBeenCalledWith(query);

      expect(result).toEqual({
        requests: [
          {
            _id: requestId,

            entityId: questionId,
          },
        ],

        totalPages: 1,

        totalCount: 1,
      });
    });

    it('throws when user is not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.getAllRequests(moderatorId, {} as any),
      ).rejects.toThrow("You don't have permission to add question");

      expect(mockRequestRepository.getAllRequests).not.toHaveBeenCalled();
    });

    it('throws when user is an expert', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,

        role: 'expert',
      });

      await expect(
        service.getAllRequests(moderatorId, {} as any),
      ).rejects.toThrow("You don't have permission to add question");

      expect(mockRequestRepository.getAllRequests).not.toHaveBeenCalled();
    });
  });

  // ==========================================================

  // updateStatus

  // ==========================================================

  describe('updateStatus', () => {
    it('approves a request successfully', async () => {
      setupUpdateStatus();

      const result = await service.updateStatus(
        requestId,

        'approved',

        'Looks good',

        moderatorId,
      );

      expect(mockRequestRepository.updateStatus).toHaveBeenCalledWith(
        requestId,

        'approved',

        'Looks good',

        moderatorId,

        expect.anything(),
      );

      expect(result).toEqual({
        status: 'approved',

        response: 'Looks good',
      });
    });

    it('updates the question when approving a question flag', async () => {
      setupUpdateStatus();

      await service.updateStatus(
        requestId,

        'approved',

        'Looks good',

        moderatorId,
      );

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,

        {
          crop: 'Rice',
        },

        expect.anything(),
      );
    });

    it('creates a notification for the requester', async () => {
      setupUpdateStatus();

      await service.updateStatus(
        requestId,

        'approved',

        'Looks good',

        moderatorId,
      );

      expect(mockNotificationRepository.addNotification).toHaveBeenCalledWith(
        requesterId,

        questionId,

        'flag_response',

        'Response: Looks good',

        'Your Flag has Been approved',

        expect.anything(),
      );
    });

    it('sends a push notification to the requester', async () => {
      setupUpdateStatus();

      await service.updateStatus(
        requestId,

        'approved',

        'Looks good',

        moderatorId,
      );

      expect(notifyUser).toHaveBeenCalledWith(
        requesterId,

        'Your Flag has Been approved',

        {
          endpoint: 'endpoint',
        },

        expect.any(Function),
      );
    });

    it('throws when request is not found', async () => {
      mockRequestRepository.getRequestById.mockResolvedValue(null);

      await expect(
        service.updateStatus(requestId, 'approved', 'Looks good', moderatorId),
      ).rejects.toThrow('Failed to get request');

      expect(mockRequestRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('throws when request is already approved', async () => {
      setupUpdateStatus();

      mockRequestRepository.getRequestById.mockResolvedValue({
        _id: requestId,

        entityId: questionId,

        requestedBy: requesterId,

        status: 'approved',

        requestType: 'question_flag',

        details: {},
      });

      await expect(
        service.updateStatus(requestId, 'approved', 'Looks good', moderatorId),
      ).rejects.toThrow('Request already closed!');

      expect(mockRequestRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('throws when request is already rejected', async () => {
      setupUpdateStatus();

      mockRequestRepository.getRequestById.mockResolvedValue({
        _id: requestId,

        entityId: questionId,

        requestedBy: requesterId,

        status: 'rejected',

        requestType: 'question_flag',

        details: {},
      });

      await expect(
        service.updateStatus(requestId, 'approved', 'Looks good', moderatorId),
      ).rejects.toThrow('Request already closed!');

      expect(mockRequestRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects a request successfully', async () => {
      setupUpdateStatus();

      mockRequestRepository.updateStatus.mockResolvedValue({
        status: 'rejected',

        response: 'Rejected',
      });

      const result = await service.updateStatus(
        requestId,

        'rejected',

        'Rejected',

        moderatorId,
      );

      expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();

      expect(result).toEqual({
        status: 'rejected',

        response: 'Rejected',
      });
    });

    it('does not update question for non-question_flag requests', async () => {
      setupUpdateStatus();

      mockRequestRepository.getRequestById.mockResolvedValue({
        _id: requestId,

        entityId: questionId,

        requestedBy: requesterId,

        status: 'pending',

        requestType: 'other',

        details: {
          crop: 'Rice',
        },
      });

      await service.updateStatus(
        requestId,

        'approved',

        'Looks good',

        moderatorId,
      );

      expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();
    });
  });

  // ==========================================================

  // getRequestDiff

  // ==========================================================

  describe('getRequestDiff', () => {
    it('returns request diff successfully', async () => {
      setupGetRequestDiff();

      const result = await service.getRequestDiff(moderatorId, requestId);

      expect(mockRequestRepository.getRequestById).toHaveBeenCalledWith(
        requestId,
      );

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith(
        questionId,

        expect.anything(),
      );

      expect(result.responses).toEqual([
        {
          reviewedBy: moderatorId,

          response: 'Looks good',
        },
      ]);

      expect(result.currentDoc).toEqual({
        crop: 'Rice',

        status: 'approved',

        question: 'Question',
      });

      expect(result.existingDoc).toEqual({
        crop: 'Wheat',

        status: 'pending',

        question: 'Question',
      });
    });

    it('throws when request is not found', async () => {
      mockRequestRepository.getRequestById.mockResolvedValue(null);

      await expect(
        service.getRequestDiff(moderatorId, requestId),
      ).rejects.toThrow('Request not found');

      expect(mockQuestionRepo.getById).not.toHaveBeenCalled();
    });

    it('throws when question is not found', async () => {
      setupGetRequestDiff();

      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.getRequestDiff(moderatorId, requestId),
      ).rejects.toThrow(`Question not found for ID: ${questionId}`);
    });

    it('returns null documents for unsupported request type', async () => {
      mockRequestRepository.getRequestById.mockResolvedValue({
        _id: requestId,

        requestType: 'other',

        entityId: questionId,

        responses: [],
      });

      const result = await service.getRequestDiff(moderatorId, requestId);

      expect(result).toEqual({
        currentDoc: null,

        existingDoc: null,

        responses: [],
      });

      expect(mockQuestionRepo.getById).not.toHaveBeenCalled();
    });
  });

  // ==========================================================

  // softDeleteRequest

  // ==========================================================

  describe('softDeleteRequest', () => {
    it('soft deletes a request successfully', async () => {
      setupSoftDeleteRequest();

      await service.softDeleteRequest(requestId, moderatorId);

      expect(mockUserRepo.findById).toHaveBeenCalledWith(
        moderatorId,

        expect.anything(),
      );

      expect(mockRequestRepository.getRequestById).toHaveBeenCalledWith(
        requestId,

        expect.anything(),
      );

      expect(mockRequestRepository.softDeleteById).toHaveBeenCalledWith(
        requestId,

        moderatorId,

        expect.anything(),
      );
    });

    it('throws when user is not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.softDeleteRequest(requestId, moderatorId),
      ).rejects.toThrow('Only moderators can delete requests');

      expect(mockRequestRepository.getRequestById).not.toHaveBeenCalled();
    });

    it('throws when user is not a moderator', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: moderatorId,

        role: 'expert',
      });

      await expect(
        service.softDeleteRequest(requestId, moderatorId),
      ).rejects.toThrow('Only moderators can delete requests');

      expect(mockRequestRepository.getRequestById).not.toHaveBeenCalled();
    });

    it('throws when request is not found', async () => {
      setupSoftDeleteRequest();

      mockRequestRepository.getRequestById.mockResolvedValue(null);

      await expect(
        service.softDeleteRequest(requestId, moderatorId),
      ).rejects.toThrow('Request not found');

      expect(mockRequestRepository.softDeleteById).not.toHaveBeenCalled();
    });

    it('throws when request is already deleted', async () => {
      setupSoftDeleteRequest();

      mockRequestRepository.getRequestById.mockResolvedValue({
        _id: requestId,

        isDeleted: true,
      });

      await expect(
        service.softDeleteRequest(requestId, moderatorId),
      ).rejects.toThrow('Request not found');

      expect(mockRequestRepository.softDeleteById).not.toHaveBeenCalled();
    });

    it('returns request status by id', async () => {
      mockRequestRepository.getRequestStatusById.mockResolvedValue('approved');

      const result = await service.getRequestStatusById(requestId);

      expect(mockRequestRepository.getRequestStatusById).toHaveBeenCalledWith(
        requestId,
      );

      expect(result).toBe('approved');
    });

    it('returns null when request status does not exist', async () => {
      mockRequestRepository.getRequestStatusById.mockResolvedValue(null);

      const result = await service.getRequestStatusById(requestId);

      expect(result).toBeNull();
    });

    it('returns request by id', async () => {
      const request = {
        _id: requestId,

        entityId: questionId,

        requestType: 'question_flag',
      };

      mockRequestRepository.getRequestById.mockResolvedValue(request);

      const result = await service.getRequestById(requestId);

      expect(mockRequestRepository.getRequestById).toHaveBeenCalledWith(
        requestId,
      );

      expect(result).toEqual(request);
    });
  });

  // ==========================================================

  // getRequestStatusById

  // ==========================================================

  describe('getRequestStatusById', () => {
    it('returns request status by id', async () => {
      mockRequestRepository.getRequestStatusById.mockResolvedValue('approved');

      const result = await service.getRequestStatusById(requestId);

      expect(mockRequestRepository.getRequestStatusById).toHaveBeenCalledWith(
        requestId,
      );

      expect(result).toBe('approved');
    });

    it('returns null when request status does not exist', async () => {
      mockRequestRepository.getRequestStatusById.mockResolvedValue(null);

      const result = await service.getRequestStatusById(requestId);

      expect(result).toBeNull();
    });
  });

  // ==========================================================

  // getRequestById

  // ==========================================================

  describe('getRequestById', () => {
    it('returns request by id', async () => {
      const request = {
        _id: requestId,

        entityId: questionId,

        requestType: 'question_flag',
      };

      mockRequestRepository.getRequestById.mockResolvedValue(request);

      const result = await service.getRequestById(requestId);

      expect(mockRequestRepository.getRequestById).toHaveBeenCalledWith(
        requestId,
      );

      expect(result).toEqual(request);
    });

    it('returns null when request is not found', async () => {
      mockRequestRepository.getRequestById.mockResolvedValue(null);

      const result = await service.getRequestById(requestId);

      expect(result).toBeNull();
    });
  });
});
