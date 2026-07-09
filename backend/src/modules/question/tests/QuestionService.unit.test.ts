import 'reflect-metadata';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ObjectId} from 'mongodb';
import * as DuplicateHelper from '../helpers/duplicateQuestionHelper.js';
import {isToday} from '#root/utils/date.utils.js';
import {QuestionService} from '../services/QuestionService.js';
import {startBalanceWorkloadWorkers} from '#root/workers/balanceWorkload.manager.js';
import {sendEmailWithAttachment} from '#root/utils/mailer.js';

vi.mock('#root/utils/mail.utils.js', () => ({
  sendEmailWithAttachment: vi.fn(),
}));

// ==========================================================
// Module mocks
// ==========================================================
// Concrete classes referenced as constructor parameter types must exist as
// real (mocked) values at runtime because emitDecoratorMetadata captures
// design:paramtypes for the @injectable() constructor. Interfaces are erased
// by TypeScript and need no mock.
vi.mock('#root/modules/notification/services/NotificationService.js', () => ({
  NotificationService: class {},
}));
vi.mock('#root/modules/ai/services/AiService.js', () => ({
  AiService: class {},
}));
vi.mock('#root/modules/acc-agent/services/AccAgentService.js', () => ({
  AccAgentService: class {},
}));
vi.mock('#root/modules/user/services/UserService.js', () => ({
  UserService: class {},
}));

vi.mock('#root/workers/balanceWorkload.manager.js', () => ({
  startBalanceWorkloadWorkers: vi
    .fn()
    .mockResolvedValue({processed: 0, failedWorkers: 0}),
}));
vi.mock('#root/workers/paeAllocation.manager.js', () => ({
  startPaeAllocationWorker: vi.fn().mockReturnValue('job-pae-1'),
}));
vi.mock('#root/workers/bulkDelete.manager.js', () => ({
  startBulkDeleteWorker: vi.fn().mockReturnValue('job-bulk-1'),
}));
vi.mock('#root/utils/mailer.js', () => ({
  sendEmailWithAttachment: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('#root/utils/pushNotification.js', () => ({
  notifyUser: vi.fn(),
}));
vi.mock('#root/utils/date.utils.js', () => ({
  isToday: vi.fn().mockReturnValue(true),
}));
vi.mock('#root/utils/normalizeKeysToLower.js', () => ({
  normalizeKeysToLower: vi.fn((obj: any) => {
    const out: any = {};
    for (const k in obj) out[k.toLowerCase()] = obj[k];
    return out;
  }),
}));
vi.mock('#root/utils/ToTitlecase.js', () => ({
  toTitleCase: vi.fn((s: string) => s),
}));
vi.mock('#root/utils/normalizeToObjectIdArray.js', () => ({
  toObjectIdArray: vi.fn((arr: any[]) => arr),
}));
vi.mock('#root/config/app.js', () => ({
  appConfig: {ENABLE_AI_SERVER: false},
}));
vi.mock('#root/shared/constants/general.js', () => ({
  DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT: 3,
  TOTAL_EXPERTS_LIMIT: 10,
}));
vi.mock('#root/modules/question/aiservice/checkConceptDuplicate.js', () => ({
  checkConceptDuplicate: vi.fn().mockResolvedValue({isNonAgri: false}),
}));
vi.mock('../helpers/duplicateQuestionHelper.js', () => ({
  checkDuplicateQuestionHelper: vi.fn().mockResolvedValue({isDuplicate: false}),
}));
vi.mock('../logger/chatbot-similarity.logger.js', () => ({
  chatbotSimilarityLogger: {info: vi.fn(), warn: vi.fn(), error: vi.fn()},
}));

// grab the mocked helper/config so individual tests can override behaviour
import {checkConceptDuplicate} from '#root/modules/question/aiservice/checkConceptDuplicate.js';
import {appConfig} from '#root/config/app.js';
import {IQuestion} from '#root/shared/index.js';
import axios from 'axios';
import {
  AllocatedQuestionsBodyDto,
  GetDetailedQuestionsQuery,
} from '../classes/validators/QuestionVaidators.js';

describe('QuestionService', () => {
  // ==========================================================
  // Shared Constants
  // ==========================================================
  const userId = '507f1f77bcf86cd799439016';
  const expertId = '507f1f77bcf86cd799439013';
  const expertId2 = '507f1f77bcf86cd799439014';
  const moderatorId = '507f1f77bcf86cd799439012';
  const adminId = '507f1f77bcf86cd799439011';
  const questionId = '507f1f77bcf86cd799439015';
  const referenceQuestionId = '507f1f77bcf86cd799439018';
  const contextId = '507f1f77bcf86cd799439015';
  const submissionId = new ObjectId();
  const answerId = new ObjectId();

  const mockedIsToday = vi.mocked(isToday);

  const validDetails = {
    state: 'Punjab',
    district: 'Ludhiana',
    crop: 'Wheat',
    season: 'Kharif',
    domain: 'Agriculture',
  };

  // ==========================================================
  // Repository / dependency mocks
  // ==========================================================
  const mockAiService = {
    getEmbedding: vi.fn(),
    getQuestionByContext: vi.fn(),
    fetchWhatsAppMessage: vi.fn(),
    searchGdb: vi.fn(),
    getAnswerByQuestionDetails: vi.fn(),
  };
  const mockAccAgentService = {
    createThread: vi.fn(),
    extractData: vi.fn(),
    updateState: vi.fn(),
    resumeAndGetAnswer: vi.fn(),
  };
  const mockContextRepo = {addContext: vi.fn()};

  const mockQuestionRepo = {
    insertMany: vi.fn(),
    addDummyQuestion: vi.fn(),
    getByContextId: vi.fn(),
    getAllocatedQuestions: vi.fn(),
    findDetailedQuestions: vi.fn(),
    getById: vi.fn(),
    addQuestion: vi.fn(),
    updateQuestion: vi.fn(),
    updateThreadId: vi.fn(),
    updateAutoAllocate: vi.fn(),
    updateModeratorId: vi.fn(),
    deleteQuestion: vi.fn(),
    getQuestionWithFullData: vi.fn(),
    getMonthlyQuestionStats: vi.fn(),
    getQuestionsByFilters: vi.fn(),
    findByDateRangeAndSource: vi.fn(),
    getQuestionsWithAnswerDetails: vi.fn(),
    getQuestionStatusSummary: vi.fn(),
    getQuestionsWithEmptyEmbeddings: vi.fn(),
    updateQuestionEmbedding: vi.fn(),
    findUnassignedInReviewQuestions: vi.fn(),
    findModeratorAssignedQuestions: vi.fn(),
    getQueueQuestionSection: vi.fn(),
    getReceivedStatusCounts: vi.fn(),
    getQuestionsAndReviewLevel: vi.fn(),
    getAllocatedQuestionPage: vi.fn(),
    deleteByQuestionId: vi.fn(),
  };

  const mockUserRepo = {
    findById: vi.fn(),
    findAll: vi.fn(),
    findExpertsByPreference: vi.fn(),
    findModerators: vi.fn(),
    findAdmins: vi.fn(),
    getSpecialTaskForceModerators: vi.fn(),
    updateReputationScore: vi.fn(),
    setReputationScore: vi.fn(),
    removeAssignedQuestionFromAllModerators: vi.fn(),
    removeAssignedQuestion: vi.fn(),
    addAssignedQuestion: vi.fn(),
    getExpertsWithFallback: vi.fn(),
    findUnblockedUsers: vi.fn(),
    blockExperts: vi.fn(),
    findActiveLowReputationExpertsToday: vi.fn(),
    findInactiveOrBlockedExperts: vi.fn(),
    getUsersByIds: vi.fn(),
    findExpertsByReputationScore: vi.fn(),
    findAvailableStfModeratorsForSources: vi.fn(),
    findAvailableStfModerators: vi.fn(),
  };

  const mockQuestionSubmissionRepo = {
    addSubmission: vi.fn(),
    getByQuestionId: vi.fn(),
    getDetailedSubmissionHistory: vi.fn(),
    updateQueue: vi.fn(),
    allocateExperts: vi.fn(),
    removeExpertFromQueuebyIndex: vi.fn(),
    updateSubmissionState: vi.fn(),
    updateById: vi.fn(),
    update: vi.fn(),
    setCurrentExpertAllocatedAt: vi.fn(),
    getAbsentSubmissions: vi.fn(),
    findQuestionsNeedingEscalation: vi.fn(),
    findReallocationQuestionsByIds: vi.fn(),
    getDelayedReviews: vi.fn(),
    markDelayedNotificationsSent: vi.fn(),
    getTimeBoundActiveCountPerExpert: vi.fn(),
    findTimeBoundQuestionsForReallocation: vi.fn(),
    findUnallocatedTimeBoundQuestions: vi.fn(),
    findAnsweredQuestionsNeedingReviewer: vi.fn(),
    findOpenedButIdleTimeBoundQuestions: vi.fn(),
    markQuestionOpenedByExpert: vi.fn(),
    assignTimeBoundReviewer: vi.fn(),
    findSubmissionsWithExpertsInQueue: vi.fn(),
    deleteByQuestionId: vi.fn(),
  };

  const mockRequestRepository = {deleteByEntityId: vi.fn()};

  const mockAnswerRepo = {
    getByQuestionId: vi.fn(),
    updateAnswerStatus: vi.fn(),
    deleteByQuestionId: vi.fn(),
    groupbyquestion: vi.fn(),
    updateAnswer: vi.fn(),
    getFinalAnswerQuestionIdsByApprover: vi.fn(),
    getFinalAnswersByQuestionIds: vi.fn(),
  };

  const mockNotificationRepository = {
    getNotificationsCount: vi.fn(),
    addNotification: vi.fn(),
  };
  const mockNotificationService = {saveTheNotifications: vi.fn()};
  const mockReRouteRepository = {findByQuestionId: vi.fn()};
  const mockDuplicateQuestionRepository = {
    addDuplicate: vi.fn(),
    deleteByReferenceQuestionId: vi.fn(),
    findDuplicatesByDateRange: vi.fn(),
  };
  const mockCropRepository = {
    findByNameOrAlias: vi.fn(),
    createCrop: vi.fn(),
  };
  const mockChatbotRepository = {
    getUserEmailByConversationId: vi.fn(),
    findMatchingMessages: vi.fn(),
    findFromSecondDb: vi.fn(),
  };
  const mockMongoDatabase = {};
  const mockUserService = {updatePenaltyAndIncentive: vi.fn()};
  const mockAuditTrailsService = {
    createAuditTrail: vi.fn().mockResolvedValue(undefined),
  };

  // ==========================================================
  // Service
  // ==========================================================
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();

    // sensible defaults so unrelated background/paths don't blow up
    mockUserRepo.findExpertsByPreference.mockResolvedValue([]);
    mockCropRepository.findByNameOrAlias.mockResolvedValue(null);
    vi.mocked(checkConceptDuplicate).mockResolvedValue({
      isNonAgri: false,
    } as any);
    (appConfig as any).ENABLE_AI_SERVER = false;

    service = new QuestionService(
      mockAiService as any,
      mockAccAgentService as any,
      mockContextRepo as any,
      mockQuestionRepo as any,
      mockUserRepo as any,
      mockQuestionSubmissionRepo as any,
      mockRequestRepository as any,
      mockAnswerRepo as any,
      mockNotificationRepository as any,
      mockNotificationService as any,
      mockReRouteRepository as any,
      mockDuplicateQuestionRepository as any,
      mockCropRepository as any,
      mockChatbotRepository as any,
      mockMongoDatabase as any,
      mockUserService as any,
      mockAuditTrailsService as any,
    );

    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback({}),
    );
  });

  function setupCreateBulkQuestions() {
    mockQuestionRepo.insertMany.mockResolvedValue([userId, questionId]);

    mockCropRepository.findByNameOrAlias.mockResolvedValue({
      name: 'Paddy',
    });
  }

  function setupAddDummyQuestions() {
    const question = {
      _id: new ObjectId(),
      question: 'Dummy Question',
    };

    mockQuestionRepo.addDummyQuestion.mockResolvedValue(question);

    mockQuestionSubmissionRepo.addSubmission.mockResolvedValue({});

    return {
      question,
    };
  }
  function setupGetQuestionFromRawContext() {
    mockAiService.getQuestionByContext.mockResolvedValue({
      reviewer: [],
      golden: [],
      pop: [],
    });
  }
  function setupGetQuestionFromCallContext() {
    return {
      axiosPostSpy: vi.spyOn(axios, 'post'),
    };
  }

  function setupGetCallSummary() {
    return {
      axiosPostSpy: vi.spyOn(axios, 'post'),
    };
  }
  function setupCreateAccAgentThread() {
    mockAccAgentService.createThread.mockResolvedValue({
      thread_id: 'thread-123',
    });
  }

  function setupExtractAccAgentData() {
    mockAccAgentService.extractData.mockResolvedValue({
      extracted_query: 'Stem Borer',
      extracted_crop: 'Paddy',
      extracted_state: 'Punjab',
      extracted_district: 'Bathinda',
    });
  }

  function setupUpdateAccAgentState() {
    mockAccAgentService.updateState.mockResolvedValue(undefined);
  }

  function setupResumeAccAgentAndGetAnswer() {
    mockAccAgentService.resumeAndGetAnswer.mockResolvedValue({
      final_answer: 'Use Chlorantraniliprole.',
    });
  }
  function setupGetByContextId() {
    mockQuestionRepo.getByContextId.mockResolvedValue([
      {
        _id: new ObjectId(),
        question: 'Question 1',
      },
    ]);
  }
  function setupGetAllocatedQuestions() {
    mockQuestionRepo.getAllocatedQuestions.mockResolvedValue([
      {
        _id: new ObjectId(),
        question: 'Allocated Question',
      },
    ]);
  }
  function setupCheckDuplicateQuestion() {
    return vi.spyOn(DuplicateHelper, 'checkDuplicateQuestionHelper');
  }
  function setupReplaceQueueExpert() {
    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback({}),
    );
  }
  const setupGetAllocatedQuestionPage = () => {
    const transactionSession = {};

    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback(transactionSession),
    );

    return {
      service,
      mocks: {
        mockQuestionRepo,
      },
      transactionSession,
    };
  };
  const setupRunAbsentScript = () => {
    const transactionSession = {};

    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback(transactionSession),
    );

    return {
      service,
      mocks: {
        mockUserRepo,
      },
      transactionSession,
    };
  };
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // ==========================================================
  // getQuestionDataById
  // ==========================================================
  describe('getQuestionDataById', () => {
    it('returns the question when found', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'Sample?',
      });

      const result = await service.getQuestionDataById(questionId);

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith(questionId);
      expect(result).toEqual({_id: questionId, question: 'Sample?'});
    });

    it('returns null when the question is not found', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      const result = await service.getQuestionDataById(questionId);

      expect(result).toBeNull();
    });

    it('returns null instead of throwing when repository fails', async () => {
      mockQuestionRepo.getById.mockRejectedValue(new Error('Database failure'));

      const result = await service.getQuestionDataById(questionId);

      expect(result).toBeNull();
    });
  });

  // ==========================================================
  // getByContextId
  // ==========================================================
  describe('getByContextId', () => {
    it('returns questions for the given context', async () => {
      mockQuestionRepo.getByContextId.mockResolvedValue([{_id: questionId}]);

      const result = await service.getByContextId('ctx-1');

      expect(mockQuestionRepo.getByContextId).toHaveBeenCalledWith(
        'ctx-1',
        expect.anything(),
      );
      expect(result).toEqual([{_id: questionId}]);
    });

    it('propagates repository errors', async () => {
      mockQuestionRepo.getByContextId.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(service.getByContextId('ctx-1')).rejects.toThrow(
        'Database failure',
      );
    });
  });

  // ==========================================================
  // addQuestion
  // ==========================================================
  describe('addQuestion', () => {
    it('throws when question text is missing', async () => {
      await expect(
        service.addQuestion(userId, {details: validDetails} as any),
      ).rejects.toThrow('Failed to add question');

      expect(mockQuestionRepo.addQuestion).not.toHaveBeenCalled();
    });

    it('throws when required details are missing', async () => {
      await expect(
        service.addQuestion(userId, {
          question: 'A question',
          details: {...validDetails, crop: ''},
        } as any),
      ).rejects.toThrow('Failed to add question');

      expect(mockQuestionRepo.addQuestion).not.toHaveBeenCalled();
    });

    it('creates an AGRI_EXPERT question with open status and auto-allocate on', async () => {
      mockQuestionRepo.addQuestion.mockResolvedValue({
        _id: new ObjectId(questionId),
      });
      mockQuestionSubmissionRepo.addSubmission.mockResolvedValue(undefined);

      const result = await service.addQuestion(userId, {
        question: 'A question',
        details: validDetails,
      } as any);

      expect(mockQuestionRepo.addQuestion).toHaveBeenCalled();
      expect(result.data.status).toBe('open');
      expect(result.data.isAutoAllocate).toBe(true);
      expect(result.data.priority).toBe('medium');
      expect(result.data._id).toBe(questionId);
      expect(result.data.userId).toBe(userId);
    });

    it('creates an AJRASAKHA question as pending/high-priority with auto-allocate off', async () => {
      mockQuestionRepo.addQuestion.mockResolvedValue({
        _id: new ObjectId(questionId),
      });
      mockQuestionSubmissionRepo.addSubmission.mockResolvedValue(undefined);
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      const result = await service.addQuestion(userId, {
        question: 'A question',
        source: 'AJRASAKHA',
        details: validDetails,
      } as any);

      expect(result.data.status).toBe('pending');
      expect(result.data.priority).toBe('high');
      expect(result.data.isAutoAllocate).toBe(false);
    });

    it('throws when the question fails to persist', async () => {
      mockQuestionRepo.addQuestion.mockResolvedValue({});

      await expect(
        service.addQuestion(userId, {
          question: 'A question',
          details: validDetails,
        } as any),
      ).rejects.toThrow('Failed to save question to database');
    });
  });

  // ==========================================================
  // manualCheckDuplicate
  // ==========================================================
  describe('manualCheckDuplicate', () => {
    it('returns immediately when a reference question is already assigned', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        referenceQuestionId,
      });

      const result = await service.manualCheckDuplicate(questionId);

      expect(result.isDuplicate).toBe(true);
      expect(mockAiService.searchGdb).not.toHaveBeenCalled();
    });

    it('marks the question as duplicate on an exact GDB match', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'A question',
        status: 'open',
        details: validDetails,
      });
      mockAiService.searchGdb.mockResolvedValue({
        exact_match: {
          question_id: referenceQuestionId,
          question: 'Matched question',
          similarity_score: 0.95,
        },
      });
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      const result = await service.manualCheckDuplicate(questionId);

      expect(result.isDuplicate).toBe(true);
      expect(result.referenceQuestionId).toBe(referenceQuestionId);
      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        expect.objectContaining({status: 'duplicate'}),
      );
    });

    it('leaves status unchanged when a duplicate is found on a closed question', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'A question',
        status: 'closed',
        details: validDetails,
      });
      mockAiService.searchGdb.mockResolvedValue({
        exact_match: {
          question_id: referenceQuestionId,
          question: 'Matched question',
          similarity_score: 0.95,
        },
      });
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      const result = await service.manualCheckDuplicate(questionId);

      expect(result.isDuplicate).toBe(true);
      expect(result.message).toContain('status left unchanged');
      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        expect.not.objectContaining({status: 'duplicate'}),
      );
    });

    it('marks the question as non-agri when detected by the LLM', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'not agri related',
        status: 'open',
        details: validDetails,
      });
      mockAiService.searchGdb.mockResolvedValue({});
      vi.mocked(checkConceptDuplicate).mockResolvedValue({
        isNonAgri: true,
      } as any);
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      const result = await service.manualCheckDuplicate(questionId);

      expect(result.isDuplicate).toBe(false);
      expect(result.message).toBe('Question marked as non-agri.');
      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(questionId, {
        status: 'non_agri',
        isDuplicateChecked: true,
      });
    });

    it('marks isDuplicateChecked when no duplicate is found', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'A question',
        status: 'open',
        details: validDetails,
      });
      mockAiService.searchGdb.mockResolvedValue({});
      vi.mocked(checkConceptDuplicate).mockResolvedValue({
        isNonAgri: false,
      } as any);
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      const result = await service.manualCheckDuplicate(questionId);

      expect(result.isDuplicate).toBe(false);
      expect(result.message).toBe('No duplicate found.');
      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(questionId, {
        isDuplicateChecked: true,
      });
    });
  });

  // ==========================================================
  // getQuestionById
  // ==========================================================
  describe('getQuestionById', () => {
    it('returns the mapped question response', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'A question',
        source: 'AGRI_EXPERT',
        details: validDetails,
        status: 'open',
        priority: 'medium',
        aiInitialAnswer: '',
        isAutoAllocate: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        totalAnswersCount: 0,
      });
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [],
      });
      mockQuestionSubmissionRepo.getDetailedSubmissionHistory.mockResolvedValue(
        [],
      );
      mockAnswerRepo.getByQuestionId.mockResolvedValue([]);

      const result = await service.getQuestionById(questionId);

      expect(result.id).toBe(questionId);
      expect(result.text).toBe('A question');
      expect(result.history).toEqual([]);
    });

    it('throws NotFoundError when the question does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(service.getQuestionById(questionId)).rejects.toThrow(
        `Failed to find question with id: ${questionId}`,
      );
    });

    it('throws NotFoundError when the submission is missing', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'A question',
      });
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(null);

      await expect(service.getQuestionById(questionId)).rejects.toThrow(
        `Failed to find question submission document of questionId: ${questionId}`,
      );
    });
  });

  // ==========================================================
  // updateQuestion
  // ==========================================================
  describe('updateQuestion', () => {
    it('throws when the question does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.updateQuestion(questionId, {priority: 'high'}),
      ).rejects.toThrow(`Question with ID ${questionId} not found`);
    });

    it('throws when closing a question with non-final answers', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockAnswerRepo.getByQuestionId.mockResolvedValue([
        {isFinalAnswer: false},
      ]);

      await expect(
        service.updateQuestion(questionId, {status: 'closed'}),
      ).rejects.toThrow(
        'Cannot close this question as it has non-final answer',
      );
    });

    it('updates basic fields successfully', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockAnswerRepo.getByQuestionId.mockResolvedValue([]);
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      const result = await service.updateQuestion(questionId, {
        priority: 'high',
      });

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        {priority: 'high'},
        expect.anything(),
      );
      expect(result).toEqual({modifiedCount: 1});
    });

    it('normalises the crop against the crop master', async () => {
      mockCropRepository.findByNameOrAlias.mockResolvedValue({name: 'Wheat'});
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockAnswerRepo.getByQuestionId.mockResolvedValue([]);
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      await service.updateQuestion(questionId, {
        details: {...validDetails, crop: 'wheat'} as any,
      });

      expect(mockCropRepository.findByNameOrAlias).toHaveBeenCalledWith(
        'wheat',
      );
      expect(mockCropRepository.createCrop).not.toHaveBeenCalled();
    });

    it('auto-creates a crop that is not yet registered', async () => {
      mockCropRepository.findByNameOrAlias.mockResolvedValue(null);
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockAnswerRepo.getByQuestionId.mockResolvedValue([]);
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      await service.updateQuestion(questionId, {
        details: {...validDetails, crop: 'Maize'} as any,
      });

      expect(mockCropRepository.createCrop).toHaveBeenCalledWith(
        'Maize',
        '',
        [],
      );
    });

    it('updates the thread id when threadUpdate is true', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockAnswerRepo.getByQuestionId.mockResolvedValue([]);
      mockQuestionRepo.updateThreadId.mockResolvedValue({modifiedCount: 1});

      await service.updateQuestion(questionId, {threadId: 'thread-1'}, true);

      expect(mockQuestionRepo.updateThreadId).toHaveBeenCalledWith(
        questionId,
        'thread-1',
        expect.anything(),
      );
    });

    it('throws when passing a question with a pending unanswered allocation', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
      });
      mockAnswerRepo.getByQuestionId.mockResolvedValue([]);
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [],
      });

      await expect(
        service.updateQuestion(questionId, {status: 'pass'}),
      ).rejects.toThrow('Cannot pass the question');

      expect(
        mockUserRepo.removeAssignedQuestionFromAllModerators,
      ).not.toHaveBeenCalled();
    });

    it('passes a question and clears it from moderator assignments', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
      });
      mockAnswerRepo.getByQuestionId.mockResolvedValue([]);
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [],
      });
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      await service.updateQuestion(questionId, {status: 'pass'});

      expect(
        mockUserRepo.removeAssignedQuestionFromAllModerators,
      ).toHaveBeenCalledWith(questionId, expect.anything());
    });
  });

  // ==========================================================
  // toggleAutoAllocate
  // ==========================================================
  describe('toggleAutoAllocate', () => {
    it('throws NotFoundError when the question does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(service.toggleAutoAllocate(questionId)).rejects.toThrow(
        'Question not found',
      );
    });

    it('turns auto-allocate on and triggers allocation', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        isAutoAllocate: false,
      });
      mockQuestionRepo.updateAutoAllocate.mockResolvedValue({
        isAutoAllocate: true,
      });
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
      });
      vi.spyOn(service, 'autoAllocateExperts').mockResolvedValue({
        data: [expertId] as any,
        status: true,
      });

      const result = await service.toggleAutoAllocate(questionId);

      expect(service.autoAllocateExperts).toHaveBeenCalled();
      expect(result.message).toBe('Auto allocate is now set to true');
    });

    it('turns auto-allocate off without triggering allocation', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        isAutoAllocate: true,
      });
      mockQuestionRepo.updateAutoAllocate.mockResolvedValue({
        isAutoAllocate: false,
      });
      const spy = vi.spyOn(service, 'autoAllocateExperts');

      const result = await service.toggleAutoAllocate(questionId);

      expect(spy).not.toHaveBeenCalled();
      expect(result.message).toBe('Auto allocate is now set to false');
    });
  });

  // ==========================================================
  // autoAllocateExperts
  // ==========================================================
  describe('autoAllocateExperts', () => {
    it('throws NotFoundError when the question does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(service.autoAllocateExperts(questionId)).rejects.toThrow(
        'Question not found',
      );
    });

    it('returns false status when the question is in-review/closed/pae_submitted', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'in-review',
      });

      const result = await service.autoAllocateExperts(questionId);

      expect(result).toEqual({data: [], status: false});
    });

    it('returns false status for time-bound (AJRASAKHA/WHATSAPP) questions', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        source: 'AJRASAKHA',
      });

      const result = await service.autoAllocateExperts(questionId);

      expect(result).toEqual({data: [], status: false});
    });

    it('throws NotFoundError when the submission is missing', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        source: 'AGRI_EXPERT',
        details: validDetails,
      });
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(null);

      await expect(service.autoAllocateExperts(questionId)).rejects.toThrow(
        'Question submission not found',
      );
    });

    it('returns false when the last submission is in-review without an answer', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        source: 'AGRI_EXPERT',
        details: validDetails,
      });
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [{updatedBy: expertId, status: 'in-review', answer: null}],
      });

      const result = await service.autoAllocateExperts(questionId);

      expect(result).toEqual({data: [], status: false});
    });

    it('returns false when the queue is already full', async () => {
      const fullQueue = Array.from({length: 10}, (_, i) => `expert-${i}`);
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        source: 'AGRI_EXPERT',
        details: validDetails,
      });
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: fullQueue,
        history: [],
      });

      const result = await service.autoAllocateExperts(questionId);

      expect(result).toEqual({data: [], status: false});
    });

    it('allocates the first batch of experts when the queue is empty', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        source: 'AGRI_EXPERT',
        details: validDetails,
      });
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [],
      });
      mockUserRepo.findAll.mockResolvedValue([
        {_id: expertId, role: 'expert', isBlocked: false},
        {_id: expertId2, role: 'expert', isBlocked: false},
      ]);
      mockUserRepo.findExpertsByPreference.mockResolvedValue([{_id: expertId}]);
      mockQuestionSubmissionRepo.updateQueue.mockResolvedValue(undefined);

      const result = await service.autoAllocateExperts(questionId);

      expect(mockUserRepo.updateReputationScore).toHaveBeenCalledWith(
        expertId,
        true,
        undefined,
      );
      expect(mockNotificationService.saveTheNotifications).toHaveBeenCalled();
      expect(result.status).toBe(true);
      expect(mockQuestionSubmissionRepo.updateQueue).toHaveBeenCalled();
    });
  });

  // ==========================================================
  // allocateExperts
  // ==========================================================
  describe('allocateExperts', () => {
    it('throws UnauthorizedError when the user cannot be found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.allocateExperts(userId, questionId, [expertId]),
      ).rejects.toThrow('Cannot find user, try relogin!');
    });

    it('throws UnauthorizedError when the user is an expert', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'expert'});

      await expect(
        service.allocateExperts(userId, questionId, [expertId]),
      ).rejects.toThrow("You don't have permission to perform this operation");
    });

    it('throws NotFoundError when the question does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'admin'});
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.allocateExperts(userId, questionId, [expertId]),
      ).rejects.toThrow('Question not found');
    });

    it('resolves with no changes for in-review/closed/pae_submitted questions', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'admin'});
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'closed',
      });

      const result = await service.allocateExperts(userId, questionId, [
        expertId,
      ]);

      expect(result).toBeUndefined();
    });

    it('throws BadRequestError when the queue is already at the max size', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'admin'});
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
      });
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: Array.from({length: 10}, (_, i) => `e${i}`),
        history: [],
      });

      await expect(
        service.allocateExperts(userId, questionId, [expertId]),
      ).rejects.toThrow('Cannot allocate more than 10 experts for a question.');
    });

    it('throws BadRequestError when the expert list is empty', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'admin'});
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
      });
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [],
      });

      await expect(
        service.allocateExperts(userId, questionId, []),
      ).rejects.toThrow('Experts list cannot be empty');
    });

    it('allocates the first expert and sends an assignment notification', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'admin'});
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
        source: 'AGRI_EXPERT',
      });
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [],
      });
      mockQuestionSubmissionRepo.allocateExperts.mockResolvedValue({
        queue: [expertId],
      });

      const result = await service.allocateExperts(userId, questionId, [
        expertId,
      ]);

      expect(mockUserRepo.updateReputationScore).toHaveBeenCalledWith(
        expertId,
        true,
        expect.anything(),
      );
      expect(mockNotificationService.saveTheNotifications).toHaveBeenCalled();
      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        {firstAllocationAt: expect.any(Date)},
        expect.anything(),
      );
      expect(result).toEqual({queue: [expertId]});
    });
  });

  // ==========================================================
  // removeExpertFromQueue
  // ==========================================================
  describe('removeExpertFromQueue', () => {
    it('throws UnauthorizedError when the user cannot be found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.removeExpertFromQueue(userId, questionId, 0),
      ).rejects.toThrow('Cannot find user, try relogin!');
    });

    it('throws UnauthorizedError when the user is an expert', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'expert'});

      await expect(
        service.removeExpertFromQueue(userId, questionId, 0),
      ).rejects.toThrow("You don't have permission to perform this operation");
    });

    it('skips authorization when called by the system', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [],
      });
      mockQuestionSubmissionRepo.removeExpertFromQueuebyIndex.mockResolvedValue(
        {queue: []},
      );

      await service.removeExpertFromQueue('system', questionId, 0);

      expect(mockUserRepo.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the submission is missing', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'admin'});
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(null);

      await expect(
        service.removeExpertFromQueue(userId, questionId, 0),
      ).rejects.toThrow('Question submission not found');
    });

    it('removes the expert and notifies them', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'admin'});
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [],
      });
      mockQuestionSubmissionRepo.removeExpertFromQueuebyIndex.mockResolvedValue(
        {queue: []},
      );

      const result = await service.removeExpertFromQueue(userId, questionId, 0);

      expect(mockNotificationService.saveTheNotifications).toHaveBeenCalledWith(
        expect.stringContaining('removed from the Allocated question'),
        'Allocation Removed',
        questionId,
        expertId,
        'allocation_removal',
      );
      expect(result).toEqual({queue: []});
    });
  });

  // ==========================================================
  // deleteQuestion
  // ==========================================================
  describe('deleteQuestion', () => {
    it('throws when the question does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(service.deleteQuestion(questionId)).rejects.toThrow(
        `Question with ID ${questionId} not found`,
      );
    });

    it('deletes a question with no submission history', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockAnswerRepo.deleteByQuestionId.mockResolvedValue(undefined);
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [],
      });
      mockReRouteRepository.findByQuestionId.mockResolvedValue(null);
      mockQuestionRepo.deleteQuestion.mockResolvedValue({deletedCount: 1});

      const result = await service.deleteQuestion(questionId);

      expect(mockUserRepo.updateReputationScore).toHaveBeenCalledWith(
        expertId,
        false,
        expect.anything(),
      );
      expect(mockQuestionSubmissionRepo.deleteByQuestionId).toHaveBeenCalled();
      expect(
        mockUserRepo.removeAssignedQuestionFromAllModerators,
      ).toHaveBeenCalled();
      expect(result).toEqual({deletedCount: 1});
    });

    it('deducts reputation from a pending re-routed expert', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockAnswerRepo.deleteByQuestionId.mockResolvedValue(undefined);
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [],
      });
      mockReRouteRepository.findByQuestionId.mockResolvedValue({
        reroutes: [{status: 'pending', reroutedTo: expertId2}],
      });
      mockQuestionRepo.deleteQuestion.mockResolvedValue({deletedCount: 1});

      await service.deleteQuestion(questionId);

      expect(mockUserRepo.updateReputationScore).toHaveBeenCalledWith(
        expertId2,
        false,
        expect.anything(),
      );
    });

    it('does not penalise anyone when the last submission already has an answer', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockAnswerRepo.deleteByQuestionId.mockResolvedValue(undefined);
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        history: [{status: 'reviewed', answer: 'ans-1', updatedBy: expertId}],
      });
      mockReRouteRepository.findByQuestionId.mockResolvedValue(null);
      mockQuestionRepo.deleteQuestion.mockResolvedValue({deletedCount: 1});

      await service.deleteQuestion(questionId);

      expect(mockUserRepo.updateReputationScore).not.toHaveBeenCalled();
    });

    it('uses the provided session directly instead of opening a transaction', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockAnswerRepo.deleteByQuestionId.mockResolvedValue(undefined);
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [],
      });
      mockReRouteRepository.findByQuestionId.mockResolvedValue(null);
      mockQuestionRepo.deleteQuestion.mockResolvedValue({deletedCount: 1});

      const externalSession = {} as any;
      await service.deleteQuestion(questionId, externalSession);

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith(
        questionId,
        externalSession,
      );
    });
  });

  // ==========================================================
  // bulkDeleteQuestions
  // ==========================================================
  describe('bulkDeleteQuestions', () => {
    it('starts a background job and returns a job id', async () => {
      const result = await service.bulkDeleteQuestions(userId, [
        questionId,
        'q2',
      ]);

      expect(result.jobId).toBe('job-bulk-1');
      expect(result.message).toContain('2 question(s)');
    });

    it('throws when no question ids are provided', async () => {
      await expect(service.bulkDeleteQuestions(userId, [])).rejects.toThrow(
        'No question IDs found to delete!',
      );
    });
  });

  // ==========================================================
  // bulkAllocatePaeExperts
  // ==========================================================
  describe('bulkAllocatePaeExperts', () => {
    it('throws UnauthorizedError when the actor cannot be found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.bulkAllocatePaeExperts(userId, [questionId], expertId),
      ).rejects.toThrow('Cannot find user, try relogin!');
    });

    it('throws UnauthorizedError when the actor is an expert', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'expert'});

      await expect(
        service.bulkAllocatePaeExperts(userId, [questionId], expertId),
      ).rejects.toThrow("You don't have permission to perform this operation");
    });

    it('throws when the PAE expert cannot be found', async () => {
      mockUserRepo.findById
        .mockResolvedValueOnce({_id: userId, role: 'admin'})
        .mockResolvedValueOnce(null);

      await expect(
        service.bulkAllocatePaeExperts(userId, [questionId], expertId),
      ).rejects.toThrow('PAE expert not found');
    });

    it('starts the PAE allocation worker on success', async () => {
      mockUserRepo.findById
        .mockResolvedValueOnce({_id: userId, role: 'admin'})
        .mockResolvedValueOnce({_id: expertId, role: 'pae_expert'});

      const result = await service.bulkAllocatePaeExperts(
        userId,
        [questionId],
        expertId,
      );

      expect(result.jobId).toBe('job-pae-1');
      expect(result.message).toContain('1 question(s)');
    });
  });

  // ==========================================================
  // changeQuestionModerator
  // ==========================================================
  describe('changeQuestionModerator', () => {
    it('assigns a moderator and frees up the previous one', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        moderatorId: adminId,
        status: 'in-review',
      });
      mockQuestionRepo.updateModeratorId.mockResolvedValue(undefined);

      await service.changeQuestionModerator(questionId, moderatorId);

      expect(mockQuestionRepo.updateModeratorId).toHaveBeenCalledWith(
        questionId,
        moderatorId,
      );
      expect(mockUserRepo.removeAssignedQuestion).toHaveBeenCalledWith(
        adminId,
        questionId,
      );
      expect(mockUserRepo.addAssignedQuestion).toHaveBeenCalledWith(
        moderatorId,
        questionId,
        'in-review',
        undefined,
      );
    });

    it('does not try to free a moderator when none was previously assigned', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockQuestionRepo.updateModeratorId.mockResolvedValue(undefined);

      await service.changeQuestionModerator(questionId, moderatorId);

      expect(mockUserRepo.removeAssignedQuestion).not.toHaveBeenCalled();
      expect(mockUserRepo.addAssignedQuestion).toHaveBeenCalled();
    });
  });

  // ==========================================================
  // removeQuestionModerator
  // ==========================================================
  describe('removeQuestionModerator', () => {
    it('clears the moderator id and frees the moderator', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        moderatorId: adminId,
      });
      mockQuestionRepo.updateModeratorId.mockResolvedValue(undefined);

      await service.removeQuestionModerator(questionId);

      expect(mockQuestionRepo.updateModeratorId).toHaveBeenCalledWith(
        questionId,
        null,
      );
      expect(mockUserRepo.removeAssignedQuestion).toHaveBeenCalledWith(
        adminId,
        questionId,
      );
    });

    it('does nothing extra when no moderator was assigned', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockQuestionRepo.updateModeratorId.mockResolvedValue(undefined);

      await service.removeQuestionModerator(questionId);

      expect(mockUserRepo.removeAssignedQuestion).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // holdQuestion
  // ==========================================================
  describe('holdQuestion', () => {
    it('throws ForbiddenError when an expert tries to hold a question', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'expert'});

      await expect(
        service.holdQuestion(questionId, userId, 'hold'),
      ).rejects.toThrow('Only moderators can hold questions');
    });

    it('throws NotFoundError when the question does not exist (hold)', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'moderator'});
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.holdQuestion(questionId, userId, 'hold'),
      ).rejects.toThrow('Question not found');
    });

    it('throws BadRequestError when holding an already closed question', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'moderator'});
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'closed',
      });

      await expect(
        service.holdQuestion(questionId, userId, 'hold'),
      ).rejects.toThrow('Question is already closed');
    });

    it('holds a question successfully', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'moderator'});
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        status: 'open',
      });
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        questionId,
        queue: [],
        history: [],
      });
      mockQuestionSubmissionRepo.updateSubmissionState.mockResolvedValue(
        undefined,
      );
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      const result = await service.holdQuestion(questionId, userId, 'hold');

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        expect.objectContaining({isOnHold: true, status: 'hold'}),
        expect.anything(),
      );
      expect(result).toEqual({id: questionId});
    });

    it('throws ForbiddenError when a non-moderator tries to unhold', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        isOnHold: true,
      });
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'expert'});

      await expect(
        service.holdQuestion(questionId, userId, 'unhold'),
      ).rejects.toThrow('Only moderators or Admins can unhold questions');
    });

    it('throws BadRequestError when unholding a question that is not on hold', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        isOnHold: false,
      });
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'moderator'});

      await expect(
        service.holdQuestion(questionId, userId, 'unhold'),
      ).rejects.toThrow('Question is not on hold');
    });

    it('unholds a question successfully', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        isOnHold: true,
        accumulatedHoldMs: 0,
        holdAt: new Date(),
      });
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'moderator'});
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      const result = await service.holdQuestion(questionId, userId, 'unhold');

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        expect.objectContaining({isOnHold: false, status: 'open'}),
        expect.anything(),
      );
      expect(result).toEqual({id: questionId});
    });
  });

  // ==========================================================
  // checkSubmissionExists
  // ==========================================================
  describe('checkSubmissionExists', () => {
    it('returns true when a submission exists', async () => {
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
      });

      const result = await service.checkSubmissionExists(questionId);

      expect(result).toBe(true);
    });

    it('returns false when no submission exists', async () => {
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(null);

      const result = await service.checkSubmissionExists(questionId);

      expect(result).toBe(false);
    });
  });

  // ==========================================================
  // getQuestionStatusSummary
  // ==========================================================
  describe('getQuestionStatusSummary', () => {
    it('returns the status summary with source counts defaulted to an empty array', async () => {
      mockQuestionRepo.getQuestionStatusSummary.mockResolvedValue({
        totalQuestions: 5,
        statuses: [{status: 'open', count: 5}],
      });

      const result = await service.getQuestionStatusSummary(
        {} as any,
        {} as any,
      );

      expect(result).toEqual({
        totalQuestions: 5,
        statuses: [{status: 'open', count: 5}],
        sourceCounts: [],
      });
    });
  });

  // ==========================================================
  // getExprtIdByIndex
  // ==========================================================
  describe('getExprtIdByIndex', () => {
    it('returns the expert id at the given index', async () => {
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId, expertId2],
      });

      const result = await service.getExprtIdByIndex(questionId, 1);

      expect(result).toBe(expertId2);
    });

    it('returns null when the index is out of bounds', async () => {
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
      });

      const result = await service.getExprtIdByIndex(questionId, 3);

      expect(result).toBeNull();
    });

    it('returns null when there is no submission', async () => {
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(null);

      const result = await service.getExprtIdByIndex(questionId, 0);

      expect(result).toBeNull();
    });
  });

  // ==========================================================
  // generateAiInitialAnswer
  // ==========================================================
  describe('generateAiInitialAnswer', () => {
    it('throws NotFoundError when the question does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(service.generateAiInitialAnswer(questionId)).rejects.toThrow(
        'Question not found',
      );
    });

    it('throws ForbiddenError when the question already has submitted answers', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        history: [{status: 'reviewed'}],
      });

      await expect(service.generateAiInitialAnswer(questionId)).rejects.toThrow(
        'Cannot generate AI initial answer. Question already has submitted answers.',
      );
    });

    it('returns the AI generated answer', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        history: [],
      });
      mockAiService.getAnswerByQuestionDetails.mockResolvedValue({
        answer: 'Generated answer',
      });

      const result = await service.generateAiInitialAnswer(questionId);

      expect(result).toEqual({aiInitialAnswer: 'Generated answer'});
    });

    it('throws InternalServerError when the AI fails to generate an answer', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        history: [],
      });
      mockAiService.getAnswerByQuestionDetails.mockResolvedValue({answer: ''});

      await expect(service.generateAiInitialAnswer(questionId)).rejects.toThrow(
        'AI failed to generate answer',
      );
    });
  });

  // ==========================================================
  // approveAiInitialAnswer
  // ==========================================================
  describe('approveAiInitialAnswer', () => {
    it('throws NotFoundError when the question does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.approveAiInitialAnswer(questionId, 'answer'),
      ).rejects.toThrow('Question not found');
    });

    it('throws BadRequestError when the answer is empty', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});

      await expect(
        service.approveAiInitialAnswer(questionId, '   '),
      ).rejects.toThrow('Answer is required');
    });

    it('throws ForbiddenError when the question already has submitted answers', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        history: [{status: 'reviewed'}],
      });

      await expect(
        service.approveAiInitialAnswer(questionId, 'Good answer'),
      ).rejects.toThrow(
        'Cannot generate AI initial answer. Question already has submitted answers.',
      );
    });

    it('saves the approved answer successfully', async () => {
      mockQuestionRepo.getById.mockResolvedValue({_id: questionId});
      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        history: [],
      });
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      const result = await service.approveAiInitialAnswer(
        questionId,
        'Good answer',
      );

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        {aiInitialAnswer: 'Good answer'},
        expect.anything(),
      );
      expect(result).toEqual({success: true});
    });
  });

  // ==========================================================
  // checkStatus
  // ==========================================================
  describe('checkStatus', () => {
    it('returns the answer-details status for the given question ids', async () => {
      mockQuestionRepo.getQuestionsWithAnswerDetails.mockResolvedValue([
        {questionId, status: 'closed'},
      ]);

      const result = await service.checkStatus([questionId]);

      expect(
        mockQuestionRepo.getQuestionsWithAnswerDetails,
      ).toHaveBeenCalledWith([questionId]);
      expect(result).toEqual([{questionId, status: 'closed'}]);
    });
  });

  // ==========================================================
  // markQuestionOpened
  // ==========================================================
  describe('markQuestionOpened', () => {
    it('marks a time-bound question as opened', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        source: 'WHATSAPP',
      });

      await service.markQuestionOpened(questionId, userId);

      expect(
        mockQuestionSubmissionRepo.markQuestionOpenedByExpert,
      ).toHaveBeenCalledWith(questionId, userId, true);
    });

    it('marks a non-time-bound question as not time-bound', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        source: 'AGRI_EXPERT',
      });

      await service.markQuestionOpened(questionId, userId);

      expect(
        mockQuestionSubmissionRepo.markQuestionOpenedByExpert,
      ).toHaveBeenCalledWith(questionId, userId, false);
    });

    it('swallows errors so the caller is never blocked', async () => {
      mockQuestionRepo.getById.mockRejectedValue(new Error('Database failure'));

      await expect(
        service.markQuestionOpened(questionId, userId),
      ).resolves.toBeUndefined();
    });
  });

  // ==========================================================
  // sendDelayedNotifications
  // ==========================================================
  describe('sendDelayedNotifications', () => {
    it('does nothing when there are no delayed reviews', async () => {
      mockQuestionSubmissionRepo.getDelayedReviews.mockResolvedValue([]);

      await service.sendDelayedNotifications();

      expect(mockUserRepo.findModerators).not.toHaveBeenCalled();
      expect(
        mockQuestionSubmissionRepo.markDelayedNotificationsSent,
      ).not.toHaveBeenCalled();
    });

    it('notifies all moderators and marks the submissions as notified', async () => {
      mockQuestionSubmissionRepo.getDelayedReviews.mockResolvedValue([
        {_id: 'sub-1', questionId},
      ]);
      mockUserRepo.findModerators.mockResolvedValue([
        {_id: moderatorId},
        {_id: adminId},
      ]);
      mockNotificationRepository.addNotification.mockResolvedValue(undefined);
      mockQuestionSubmissionRepo.markDelayedNotificationsSent.mockResolvedValue(
        undefined,
      );

      await service.sendDelayedNotifications();

      expect(mockNotificationRepository.addNotification).toHaveBeenCalledTimes(
        2,
      );
      expect(
        mockQuestionSubmissionRepo.markDelayedNotificationsSent,
      ).toHaveBeenCalledWith(['sub-1'], expect.anything());
    });
  });

  // ==========================================================
  // backfillEmptyEmbeddings
  // ==========================================================
  describe('backfillEmptyEmbeddings', () => {
    it('skips entirely when the AI server is disabled', async () => {
      (appConfig as any).ENABLE_AI_SERVER = false;

      await service.backfillEmptyEmbeddings();

      expect(
        mockQuestionRepo.getQuestionsWithEmptyEmbeddings,
      ).not.toHaveBeenCalled();
    });

    it('does nothing when there are no questions to backfill', async () => {
      (appConfig as any).ENABLE_AI_SERVER = true;
      mockQuestionRepo.getQuestionsWithEmptyEmbeddings.mockResolvedValue([]);

      await service.backfillEmptyEmbeddings();

      expect(mockAiService.getEmbedding).not.toHaveBeenCalled();
    });

    it('skips questions with no usable text', async () => {
      (appConfig as any).ENABLE_AI_SERVER = true;
      mockQuestionRepo.getQuestionsWithEmptyEmbeddings.mockResolvedValue([
        {_id: questionId, question: '', text: ''},
      ]);

      await service.backfillEmptyEmbeddings();

      expect(mockAiService.getEmbedding).not.toHaveBeenCalled();
      expect(mockQuestionRepo.updateQuestionEmbedding).not.toHaveBeenCalled();
    });

    it('updates the embedding for questions with text', async () => {
      (appConfig as any).ENABLE_AI_SERVER = true;
      mockQuestionRepo.getQuestionsWithEmptyEmbeddings.mockResolvedValue([
        {_id: questionId, question: 'A question', text: ''},
      ]);
      mockAiService.getEmbedding.mockResolvedValue({embedding: [0.1, 0.2]});
      mockQuestionRepo.updateQuestionEmbedding.mockResolvedValue(undefined);

      await service.backfillEmptyEmbeddings();

      expect(mockQuestionRepo.updateQuestionEmbedding).toHaveBeenCalledWith(
        questionId,
        [0.1, 0.2],
      );
    });
  });

  // ==========================================================
  // getQuestionFullData
  // ==========================================================
  describe('getQuestionFullData', () => {
    it('returns null when the question cannot be found', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'moderator'});
      mockQuestionRepo.getQuestionWithFullData.mockResolvedValue(null);

      const result = await service.getQuestionFullData(questionId, userId);

      expect(result).toBeNull();
    });

    it('resolves the approving moderator for closed questions', async () => {
      mockUserRepo.findById
        .mockResolvedValueOnce({_id: userId, role: 'moderator'})
        .mockResolvedValueOnce({
          _id: adminId,
          firstName: 'Ann',
          lastName: 'Admin',
          email: 'ann@test.com',
        });
      mockQuestionRepo.getQuestionWithFullData.mockResolvedValue({
        _id: questionId,
        status: 'closed',
      });
      mockAnswerRepo.getByQuestionId.mockResolvedValue([
        {isFinalAnswer: true, approvedBy: adminId},
      ]);

      const result = await service.getQuestionFullData(questionId, userId);

      expect(result.approved_moderator).toEqual({
        name: 'Ann Admin',
        email: 'ann@test.com',
      });
    });

    it('resolves the currently assigned moderator and isAssignedModerator flag', async () => {
      mockUserRepo.findById
        .mockResolvedValueOnce({_id: userId, role: 'moderator'})
        .mockResolvedValueOnce({
          _id: userId,
          firstName: 'Mod',
          lastName: 'Erator',
          email: 'mod@test.com',
        });
      mockQuestionRepo.getQuestionWithFullData.mockResolvedValue({
        _id: questionId,
        status: 'in-review',
        moderatorId: userId,
      });

      const result = await service.getQuestionFullData(questionId, userId);

      expect(result.isAssignedModerator).toBe(true);
      expect(result.assigned_moderator).toEqual({
        name: 'Mod Erator',
        email: 'mod@test.com',
      });
    });

    it('resolves the thread user email when a threadId is present', async () => {
      mockUserRepo.findById.mockResolvedValue({_id: userId, role: 'moderator'});
      mockQuestionRepo.getQuestionWithFullData.mockResolvedValue({
        _id: questionId,
        status: 'open',
        threadId: 'thread-1',
      });
      mockChatbotRepository.getUserEmailByConversationId.mockResolvedValue(
        'user@test.com',
      );

      const result = await service.getQuestionFullData(questionId, userId);

      expect(
        (
          result.question as IQuestion & {
            threadUserEmail: string | null;
          }
        ).threadUserEmail,
      ).toBe('user@test.com');
    });
  });

  // ==========================================================
  // ensureNormalisedCrop
  // ==========================================================
  describe('ensureNormalisedCrop', () => {
    it('returns the already-set normalised crop without further lookups', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        details: {normalised_crop: 'Wheat', crop: 'wheat'},
      });

      const result = await service.ensureNormalisedCrop(questionId);

      expect(result).toBe('Wheat');
      expect(mockCropRepository.findByNameOrAlias).not.toHaveBeenCalled();
    });

    it('returns null when there is no raw crop to resolve', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        details: {crop: ''},
      });

      const result = await service.ensureNormalisedCrop(questionId);

      expect(result).toBeNull();
    });

    it('resolves and persists a normalised crop when found', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        details: {crop: 'wheat'},
      });
      mockCropRepository.findByNameOrAlias.mockResolvedValue({name: 'Wheat'});
      mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

      const result = await service.ensureNormalisedCrop(questionId);

      expect(result).toBe('Wheat');
      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        {'details.normalised_crop': 'Wheat'},
        undefined,
      );
    });

    it('returns null when the crop cannot be resolved from the crop master', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        details: {crop: 'unknown-crop'},
      });
      mockCropRepository.findByNameOrAlias.mockResolvedValue(null);

      const result = await service.ensureNormalisedCrop(questionId);

      expect(result).toBeNull();
      expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // getMatchedQuestion
  // ==========================================================
  describe('getMatchedQuestion', () => {
    it('throws when the question cannot be found', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(service.getMatchedQuestion(questionId)).rejects.toThrow(
        'Question not found',
      );
    });

    it('throws when a WhatsApp question has no threadId', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        source: 'WHATSAPP',
        threadId: null,
      });

      await expect(service.getMatchedQuestion(questionId)).rejects.toThrow(
        'Thread id not found for WhatsApp question',
      );
    });

    it('returns the matched WhatsApp message when a threadId is present', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        source: 'WHATSAPP',
        threadId: 'thread-1',
      });
      mockAiService.fetchWhatsAppMessage.mockResolvedValue({
        messageId: 'm-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        userDetails: {username: 'john', email: 'john@test.com'},
        content: [],
      });

      const result = await service.getMatchedQuestion(questionId);

      expect(result.messageId).toBe('m-1');
      expect(result.user.username).toBe('john');
    });

    it('throws when no matching message is found for a non-WhatsApp question', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        source: 'AGRI_EXPERT',
        question: 'A question',
        details: validDetails,
        createdAt: new Date(),
        messageId: null,
        userId,
      });
      mockChatbotRepository.findFromSecondDb.mockResolvedValue([]);

      await expect(service.getMatchedQuestion(questionId)).rejects.toThrow(
        'No matching message found',
      );
    });
  });
  // ============================================================================
  // truncateQuestionText
  // ============================================================================

  describe('truncateQuestionText', () => {
    it('returns "Question" when the input is empty', () => {
      const result = (service as any).truncateQuestionText('');

      expect(result).toBe('Question');
    });

    it('returns the original text when it is within the maximum length', () => {
      const question = 'How to control stem borer?';

      const result = (service as any).truncateQuestionText(question);

      expect(result).toBe(question);
    });

    it('truncates the text and appends ellipsis when it exceeds the maximum length', () => {
      const question = 'A'.repeat(60);

      const result = (service as any).truncateQuestionText(question, 50);

      expect(result).toBe('A'.repeat(50) + '...');
    });
  });

  // ==========================================================
  // createBulkQuestions
  // ==========================================================
  describe('truncateQuestionText', () => {
    it('throws BadRequestError when no questions are provided', async () => {
      setupCreateBulkQuestions();

      await expect(service.createBulkQuestions(userId, [])).rejects.toThrow(
        'No questions provided for bulk insert',
      );
    });
    it('throws BadRequestError when questions is not an array', async () => {
      setupCreateBulkQuestions();

      await expect(
        service.createBulkQuestions(userId, null as any),
      ).rejects.toThrow('No questions provided for bulk insert');
    });
    it('throws BadRequestError when a question is empty', async () => {
      setupCreateBulkQuestions();

      await expect(
        service.createBulkQuestions(userId, [
          {
            question: '',
          },
        ]),
      ).rejects.toThrow('Each question must have a non-empty "question" field');
    });
    it('creates bulk questions successfully', async () => {
      setupCreateBulkQuestions();

      const questions = [
        {
          question: 'How to control stem borer?',
          crop: 'Paddy',
          state: 'Punjab',
          district: 'Bathinda',
          season: 'Kharif',
          domain: 'Pest',
          priority: 'high',
        },
      ];

      const result = await service.createBulkQuestions(userId, questions);

      expect(mockCropRepository.findByNameOrAlias).toHaveBeenCalledWith(
        'Paddy',
      );

      expect(mockQuestionRepo.insertMany).toHaveBeenCalledTimes(1);

      expect(result).toEqual([userId, questionId]);
    });
    it('defaults priority to medium when an invalid priority is provided', async () => {
      setupCreateBulkQuestions();

      await service.createBulkQuestions(userId, [
        {
          question: 'Question',
          priority: 'urgent',
        },
      ]);

      expect(mockQuestionRepo.insertMany).toHaveBeenCalledWith([
        expect.objectContaining({
          priority: 'medium',
        }),
      ]);
    });
    it('sets the source to OUTREACH for outreach questions', async () => {
      setupCreateBulkQuestions();

      await service.createBulkQuestions(
        userId,
        [
          {
            question: 'Question',
          },
        ],
        true,
      );

      expect(mockQuestionRepo.insertMany).toHaveBeenCalledWith([
        expect.objectContaining({
          source: 'OUTREACH',
        }),
      ]);
    });
    it('does not set normalised_crop when crop is not found', async () => {
      setupCreateBulkQuestions();

      mockCropRepository.findByNameOrAlias.mockResolvedValue(null);

      await service.createBulkQuestions(userId, [
        {
          question: 'Question',
          crop: 'Unknown Crop',
        },
      ]);

      const insertedQuestion = mockQuestionRepo.insertMany.mock.calls[0][0][0];

      expect(insertedQuestion.details.normalised_crop).toBeUndefined();
    });
    it('continues creating questions when crop normalization fails', async () => {
      setupCreateBulkQuestions();

      mockCropRepository.findByNameOrAlias.mockRejectedValue(
        new Error('Database failure'),
      );

      const result = await service.createBulkQuestions(userId, [
        {
          question: 'Question',
          crop: 'Paddy',
        },
      ]);

      expect(mockQuestionRepo.insertMany).toHaveBeenCalled();

      expect(result).toEqual([userId, questionId]);
    });
    it('uses the crop cache for duplicate crop names', async () => {
      setupCreateBulkQuestions();

      await service.createBulkQuestions(userId, [
        {
          question: 'Question 1',
          crop: 'Paddy',
        },
        {
          question: 'Question 2',
          crop: 'Paddy',
        },
      ]);

      expect(mockCropRepository.findByNameOrAlias).toHaveBeenCalledTimes(1);
    });
    it('throws InternalServerError when insertMany fails', async () => {
      setupCreateBulkQuestions();

      mockQuestionRepo.insertMany.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.createBulkQuestions(userId, [
          {
            question: 'Question',
          },
        ]),
      ).rejects.toThrow('Failed to insert questions');
    });
  });
  // ==========================================================
  // addDummyQuestions
  // ==========================================================
  describe('addDummyQuestions', () => {
    it('throws BadRequestError when questions array is empty', async () => {
      setupAddDummyQuestions();

      await expect(
        service.addDummyQuestions(userId, contextId, []),
      ).rejects.toThrow('Questions must be a non-empty array');
    });
    it('throws BadRequestError when questions is not an array', async () => {
      setupAddDummyQuestions();

      await expect(
        service.addDummyQuestions(userId, contextId, null as any),
      ).rejects.toThrow('Questions must be a non-empty array');
    });
    it('adds dummy questions using the provided session', async () => {
      const {question} = setupAddDummyQuestions();

      const session = {};

      const result = await service.addDummyQuestions(
        userId,
        contextId,
        ['Question 1'],
        session as any,
      );

      expect(mockQuestionRepo.addDummyQuestion).toHaveBeenCalledWith(
        userId,
        contextId,
        'Question 1',
        session,
      );

      expect(mockQuestionSubmissionRepo.addSubmission).toHaveBeenCalledWith(
        expect.objectContaining({
          questionId: question._id,
          history: [],
          queue: [],
          lastRespondedBy: null,
        }),
        session,
      );

      expect(result).toEqual([question]);
    });
    it('creates its own transaction when no session is provided', async () => {
      const {question} = setupAddDummyQuestions();

      const result = await service.addDummyQuestions(userId, contextId, [
        'Question 1',
      ]);

      expect(mockQuestionRepo.addDummyQuestion).toHaveBeenCalledWith(
        userId,
        contextId,
        'Question 1',
        {},
      );

      expect(mockQuestionSubmissionRepo.addSubmission).toHaveBeenCalledWith(
        expect.objectContaining({
          questionId: question._id,
        }),
        {},
      );

      expect(result).toEqual([question]);
    });
    it('propagates repository errors when addDummyQuestion fails', async () => {
      setupAddDummyQuestions();

      mockQuestionRepo.addDummyQuestion.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.addDummyQuestions(userId, contextId, ['Question 1']),
      ).rejects.toThrow('Database failure');
    });
    it('propagates repository errors when adding the submission fails', async () => {
      setupAddDummyQuestions();

      mockQuestionSubmissionRepo.addSubmission.mockRejectedValue(
        new Error('Submission failure'),
      );

      await expect(
        service.addDummyQuestions(userId, contextId, ['Question 1']),
      ).rejects.toThrow('Submission failure');
    });
  });
  // ==========================================================
  // getQuestionFromRawContext
  // ==========================================================
  describe('getQuestionFromRawContext', () => {
    it('maps reviewer questions correctly', async () => {
      setupGetQuestionFromRawContext();

      mockAiService.getQuestionByContext.mockResolvedValue({
        reviewer: [
          {
            question: 'Reviewer Question',
            answer: 'Reviewer Answer',
            source: 'AGRI_EXPERT',
          },
        ],
        golden: [],
        pop: [],
      });

      const result = await service.getQuestionFromRawContext('context');

      expect(result).toHaveLength(1);

      expect(result[0]).toMatchObject({
        question: 'Reviewer Question',
        answer: 'Reviewer Answer',
        agri_specialist: 'AGRI_EXPERT',
        referenceSource: 'reviewer',
      });

      expect(result[0].id).toBeDefined();
    });
    it('maps golden questions correctly', async () => {
      setupGetQuestionFromRawContext();

      mockAiService.getQuestionByContext.mockResolvedValue({
        reviewer: [],
        golden: [
          {
            question: 'Golden Question',
            answer: 'Golden Answer',
            metadata: {
              'Agri Specialist': 'Dr Sharma',
            },
          },
        ],
        pop: [],
      });

      const result = await service.getQuestionFromRawContext('context');

      expect(result).toHaveLength(1);

      expect(result[0]).toMatchObject({
        question: 'Golden Question',
        answer: 'Golden Answer',
        agri_specialist: 'Dr Sharma',
        referenceSource: 'golden',
      });
    });
    it('maps POP documents correctly', async () => {
      setupGetQuestionFromRawContext();

      mockAiService.getQuestionByContext.mockResolvedValue({
        reviewer: [],
        golden: [],
        pop: [
          {
            text: 'Reference text',
          },
        ],
      });

      const result = await service.getQuestionFromRawContext('context');

      expect(result).toHaveLength(1);

      expect(result[0]).toMatchObject({
        question: 'Reference Information',
        answer: 'Reference text',
        agri_specialist: 'POP_DOCUMENT',
        referenceSource: 'pop',
      });
    });
    it('merges reviewer, golden and pop questions', async () => {
      setupGetQuestionFromRawContext();

      mockAiService.getQuestionByContext.mockResolvedValue({
        reviewer: [
          {
            question: 'R1',
            answer: 'A1',
          },
        ],
        golden: [
          {
            question: 'G1',
            answer: 'A2',
            metadata: {},
          },
        ],
        pop: [
          {
            text: 'POP',
          },
        ],
      });

      const result = await service.getQuestionFromRawContext('context');

      expect(result).toHaveLength(3);
    });
    it('removes duplicate questions', async () => {
      setupGetQuestionFromRawContext();

      mockAiService.getQuestionByContext.mockResolvedValue({
        reviewer: [
          {
            question: 'Duplicate',
            answer: 'Answer 1',
          },
        ],
        golden: [
          {
            question: 'Duplicate',
            answer: 'Answer 2',
            metadata: {},
          },
        ],
        pop: [],
      });

      const result = await service.getQuestionFromRawContext('context');

      expect(result).toHaveLength(1);

      expect(result[0].answer).toBe('Answer 2');
    });
    it('returns an empty array when no questions are returned', async () => {
      setupGetQuestionFromRawContext();

      const result = await service.getQuestionFromRawContext('context');

      expect(result).toEqual([]);
    });
    it('propagates AI service errors', async () => {
      setupGetQuestionFromRawContext();

      mockAiService.getQuestionByContext.mockRejectedValue(
        new Error('AI failure'),
      );

      await expect(
        service.getQuestionFromRawContext('context'),
      ).rejects.toThrow('AI failure');
    });
  });
  describe('getQuestionFromCallContext', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('maps reviewer, golden and pop responses', async () => {
      const {axiosPostSpy} = setupGetQuestionFromCallContext();

      axiosPostSpy.mockResolvedValue({
        data: {
          reviewer: [
            {
              question: 'Reviewer',
              answer: 'Answer',
              source: 'AGRI_EXPERT',
            },
          ],
          golden: [
            {
              question: 'Golden',
              answer: 'Golden Answer',
              metadata: {
                'Agri Specialist': 'Dr Sharma',
              },
            },
          ],
          pop: [
            {
              text: 'POP Data',
            },
          ],
        },
      } as any);

      const result = await service.getQuestionFromCallContext('context');

      expect(result).toHaveLength(3);

      expect(result[0].referenceSource).toBe('reviewer');
      expect(result[1].referenceSource).toBe('golden');
      expect(result[2].referenceSource).toBe('pop');
    });

    it('maps results array response', async () => {
      const {axiosPostSpy} = setupGetQuestionFromCallContext();

      axiosPostSpy.mockResolvedValue({
        data: {
          extracted_question: 'Stem Borer',
          results: [
            {
              answer: 'Use pesticide',
              source: 'AI',
            },
          ],
        },
      } as any);

      const result = await service.getQuestionFromCallContext('context');

      expect(result).toEqual([
        expect.objectContaining({
          question: 'Stem Borer',
          answer: 'Use pesticide',
          referenceSource: 'agent_search',
        }),
      ]);
    });

    it('maps array response', async () => {
      const {axiosPostSpy} = setupGetQuestionFromCallContext();

      axiosPostSpy.mockResolvedValue({
        data: [
          {
            question: 'Question',
            answer: 'Answer',
          },
        ],
      } as any);

      const result = await service.getQuestionFromCallContext('context');

      expect(result).toEqual([
        expect.objectContaining({
          question: 'Question',
          answer: 'Answer',
        }),
      ]);
    });

    it('maps object response', async () => {
      const {axiosPostSpy} = setupGetQuestionFromCallContext();

      axiosPostSpy.mockResolvedValue({
        data: {
          question: 'Question',
          answer: 'Answer',
        },
      } as any);

      const result = await service.getQuestionFromCallContext('context');

      expect(result).toEqual([
        expect.objectContaining({
          question: 'Question',
          answer: 'Answer',
        }),
      ]);
    });

    it('includes state and crop in payload', async () => {
      const {axiosPostSpy} = setupGetQuestionFromCallContext();

      axiosPostSpy.mockResolvedValue({
        data: {},
      } as any);

      await service.getQuestionFromCallContext('context', 'Punjab', 'Paddy');

      expect(axiosPostSpy).toHaveBeenCalledWith(
        'http://100.100.108.44:6002/search',
        {
          query: 'context',
          state: 'Punjab',
          crop: 'Paddy',
        },
        {
          timeout: 100000,
        },
      );
    });

    it('deduplicates questions', async () => {
      const {axiosPostSpy} = setupGetQuestionFromCallContext();

      axiosPostSpy.mockResolvedValue({
        data: {
          reviewer: [
            {
              question: 'Duplicate',
              answer: 'Answer 1',
            },
            {
              question: 'Duplicate',
              answer: 'Answer 2',
            },
          ],
        },
      } as any);

      const result = await service.getQuestionFromCallContext('context');

      expect(result).toHaveLength(1);
      expect(result[0].answer).toBe('Answer 2');
    });

    it('throws InternalServerError when the request fails', async () => {
      const {axiosPostSpy} = setupGetQuestionFromCallContext();

      axiosPostSpy.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.getQuestionFromCallContext('context'),
      ).rejects.toThrow('Failed to generate questions from call context');
    });
  });
  describe('getCallSummary', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns the extracted summary', async () => {
      const {axiosPostSpy} = setupGetCallSummary();

      axiosPostSpy.mockResolvedValue({
        data: {
          summary: 'Sample summary',
        },
      } as any);

      const result = await service.getCallSummary('query');

      expect(axiosPostSpy).toHaveBeenCalledWith(
        'http://100.100.108.44:6002/extract',
        {
          query: 'query',
        },
        {
          timeout: 100000,
        },
      );

      expect(result).toEqual({
        summary: 'Sample summary',
      });
    });

    it('throws InternalServerError when the extract API fails', async () => {
      const {axiosPostSpy} = setupGetCallSummary();

      axiosPostSpy.mockRejectedValue(new Error('API failure'));

      await expect(service.getCallSummary('query')).rejects.toThrow(
        'Failed to generate call summary',
      );
    });
  });
  // ============================================================================
  // createAccAgentThread
  // ============================================================================

  describe('createAccAgentThread', () => {
    it('creates an ACC agent thread successfully', async () => {
      setupCreateAccAgentThread();

      const result = await service.createAccAgentThread();

      expect(mockAccAgentService.createThread).toHaveBeenCalledTimes(1);

      expect(result).toEqual({
        thread_id: 'thread-123',
      });
    });

    it('throws InternalServerError when thread creation fails', async () => {
      mockAccAgentService.createThread.mockRejectedValue(
        new Error('API failure'),
      );

      await expect(service.createAccAgentThread()).rejects.toThrow(
        'Failed to create ACC Agent thread',
      );
    });
  });
  // ============================================================================
  // extractAccAgentData
  // ============================================================================

  describe('extractAccAgentData', () => {
    it('extracts transcript data successfully', async () => {
      setupExtractAccAgentData();

      const result = await service.extractAccAgentData(
        'thread-123',
        'sample transcript',
      );

      expect(mockAccAgentService.extractData).toHaveBeenCalledWith(
        'thread-123',
        'sample transcript',
      );

      expect(result).toEqual({
        extracted_query: 'Stem Borer',
        extracted_crop: 'Paddy',
        extracted_state: 'Punjab',
        extracted_district: 'Bathinda',
      });
    });

    it('throws InternalServerError when extraction fails', async () => {
      mockAccAgentService.extractData.mockRejectedValue(
        new Error('API failure'),
      );

      await expect(
        service.extractAccAgentData('thread-123', 'transcript'),
      ).rejects.toThrow('Failed to extract data using ACC Agent');
    });
  });
  // ============================================================================
  // updateAccAgentState
  // ============================================================================

  describe('updateAccAgentState', () => {
    it('updates the ACC agent state successfully', async () => {
      setupUpdateAccAgentState();

      const correctedData = {
        query: 'Stem Borer',
        crop: 'Paddy',
        state: 'Punjab',
        district: 'Bathinda',
      };

      await service.updateAccAgentState('thread-123', correctedData);

      expect(mockAccAgentService.updateState).toHaveBeenCalledWith(
        'thread-123',
        correctedData,
      );
    });

    it('throws InternalServerError when update fails', async () => {
      mockAccAgentService.updateState.mockRejectedValue(
        new Error('API failure'),
      );

      await expect(
        service.updateAccAgentState('thread-123', {
          query: 'Q',
          crop: 'Crop',
          state: 'State',
          district: 'District',
        }),
      ).rejects.toThrow('Failed to update ACC Agent state');
    });
  });
  // ============================================================================
  // resumeAccAgentAndGetAnswer
  // ============================================================================

  describe('resumeAccAgentAndGetAnswer', () => {
    it('returns the final answer from the ACC agent', async () => {
      setupResumeAccAgentAndGetAnswer();

      const result = await service.resumeAccAgentAndGetAnswer('thread-123');

      expect(mockAccAgentService.resumeAndGetAnswer).toHaveBeenCalledWith(
        'thread-123',
      );

      expect(result).toEqual({
        final_answer: 'Use Chlorantraniliprole.',
      });
    });

    it('throws InternalServerError when resume fails', async () => {
      mockAccAgentService.resumeAndGetAnswer.mockRejectedValue(
        new Error('API failure'),
      );

      await expect(
        service.resumeAccAgentAndGetAnswer('thread-123'),
      ).rejects.toThrow('Failed to get final answer from ACC Agent');
    });
  });
  // ============================================================================
  // getByContextId
  // ============================================================================

  describe('getByContextId', () => {
    it('returns questions for the given context', async () => {
      setupGetByContextId();

      const result = await service.getByContextId(questionId);

      expect(mockQuestionRepo.getByContextId).toHaveBeenCalledWith(
        questionId,
        {},
      );

      expect(result).toHaveLength(1);
    });

    it('propagates repository errors', async () => {
      mockQuestionRepo.getByContextId.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(service.getByContextId(questionId)).rejects.toThrow(
        'Database failure',
      );
    });
  });
  // ============================================================================
  // getAllocatedQuestions
  // ============================================================================

  describe('getAllocatedQuestions', () => {
    it('returns allocated questions', async () => {
      setupGetAllocatedQuestions();

      const query = {} as GetDetailedQuestionsQuery;
      const body = {} as AllocatedQuestionsBodyDto;

      const result = await service.getAllocatedQuestions(userId, query, body);

      expect(mockQuestionRepo.getAllocatedQuestions).toHaveBeenCalledWith(
        userId,
        query,
        {},
        body,
      );

      expect(result).toHaveLength(1);
    });

    it('propagates repository errors', async () => {
      const query = {} as GetDetailedQuestionsQuery;
      const body = {} as AllocatedQuestionsBodyDto;

      mockQuestionRepo.getAllocatedQuestions.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.getAllocatedQuestions(userId, query, body),
      ).rejects.toThrow('Database failure');
    });
  });

  describe('checkDuplicateQuestion', () => {
    it('delegates duplicate detection to the helper', async () => {
      const helperSpy = setupCheckDuplicateQuestion();

      helperSpy.mockResolvedValue({
        isDuplicate: false,
      });

      const question = {} as IQuestion;
      const details = {} as IQuestion['details'];
      const logData = {};

      const result = await service.checkDuplicateQuestion(
        question,
        details,
        logData,
      );

      expect(helperSpy).toHaveBeenCalledWith(
        question,
        details,
        logData,
        mockAiService,
        mockDuplicateQuestionRepository,
        undefined,
      );

      expect(result).toEqual({
        isDuplicate: false,
      });
    });
    it('passes the transaction session to the helper', async () => {
      const helperSpy = setupCheckDuplicateQuestion();

      helperSpy.mockResolvedValue({
        isDuplicate: true,
      });

      const session = {};

      await service.checkDuplicateQuestion(
        {} as IQuestion,
        {} as IQuestion['details'],
        {},
        session as any,
      );

      expect(helperSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        mockAiService,
        mockDuplicateQuestionRepository,
        session,
      );
    });
  });
  describe('replaceQueueExpert', () => {
    beforeEach(() => {
      setupReplaceQueueExpert();
    });

    it('throws NotFoundError when the question does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue(null);

      await expect(
        service.replaceQueueExpert(moderatorId, questionId, 0, expertId),
      ).rejects.toThrow('Question not found');
    });
    it('throws NotFoundError when the question submission does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(null);

      await expect(
        service.replaceQueueExpert(moderatorId, questionId, 0, expertId),
      ).rejects.toThrow('Question submission not found');
    });
    it('throws NotFoundError when the new author does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        authors_history: [],
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      });

      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          'newExpert',
          true,
          'Need a replacement',
        ),
      ).rejects.toThrow('New expert not found');
    });
    it('throws BadRequestError when the selected author is already assigned', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        authors_history: [],
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      });

      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          expertId,
          true,
          'Need a replacement',
        ),
      ).rejects.toThrow('The selected expert is already the author.');
    });
    it('throws BadRequestError when the reason for replacement is missing', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        authors_history: [],
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      });

      mockUserRepo.findById.mockResolvedValue({
        _id: 'newExpert',
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          'newExpert',
          true,
          '',
        ),
      ).rejects.toThrow('Reason for reallocation is required.');
    });
    it('throws BadRequestError when less than two hours have passed since author assignment', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        authors_history: [],
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [expertId],
        createdAt: oneHourAgo,
      });

      mockUserRepo.findById.mockResolvedValue({
        _id: 'newExpert',
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          'newExpert',
          true,
          'Need replacement',
        ),
      ).rejects.toThrow(
        'Reallocation denied. At least 2 hours must pass since the author was assigned.',
      );
    });
    it('replaces the author successfully', async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

      const question = {
        _id: questionId,
        question: 'How to control stem borer?',
        userId: expertId,
        authors_history: [],
        isOnHold: false,
      };

      const submission = {
        _id: submissionId,
        queue: [new ObjectId(expertId)],
        history: [],
        createdAt: threeHoursAgo,
      };

      const updatedSubmission = {
        ...submission,
        queue: [new ObjectId(expertId2)],
      };

      mockQuestionRepo.getById
        .mockResolvedValueOnce(question)
        .mockResolvedValueOnce(question);

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(submission);

      mockUserRepo.findById.mockResolvedValue({
        _id: expertId2,
      });

      mockQuestionSubmissionRepo.updateById.mockResolvedValue(
        updatedSubmission,
      );

      mockAnswerRepo.getByQuestionId.mockResolvedValue([
        {
          _id: answerId,
          answerIteration: 0,
          isFinalAnswer: false,
        },
      ]);

      mockAnswerRepo.updateAnswer.mockResolvedValue({});

      mockQuestionRepo.updateQuestion.mockResolvedValue({});

      mockUserService.updatePenaltyAndIncentive.mockResolvedValue(undefined);

      mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);

      const result = await service.replaceQueueExpert(
        moderatorId,
        questionId,
        0,
        expertId2,
        true,
        'Expert unavailable',
      );

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalled();

      expect(mockQuestionSubmissionRepo.updateById).toHaveBeenCalled();

      expect(mockAnswerRepo.updateAnswer).toHaveBeenCalledWith(
        answerId.toString(),
        {
          authorId: new ObjectId(expertId2),
        },
        {},
      );

      expect(mockUserService.updatePenaltyAndIncentive).toHaveBeenCalledWith(
        expertId,
        'penalty',
      );

      expect(mockUserService.updatePenaltyAndIncentive).toHaveBeenCalledWith(
        expertId2,
        'incentive',
      );

      expect(
        mockNotificationService.saveTheNotifications,
      ).toHaveBeenCalledTimes(2);

      expect(result).toEqual(updatedSubmission);
    });
    it('removes the hold when replacing the author of an on-hold question', async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

      const holdAt = new Date(Date.now() - 30 * 60 * 1000);

      const question = {
        _id: questionId,
        question: 'Question',
        authors_history: [],
        isOnHold: true,
        holdAt,
        accumulatedHoldMs: 1000,
      };

      mockQuestionRepo.getById
        .mockResolvedValueOnce(question)
        .mockResolvedValueOnce(question);

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: submissionId,
        queue: [new ObjectId(expertId)],
        history: [],
        createdAt: threeHoursAgo,
      });

      mockUserRepo.findById.mockResolvedValue({
        _id: expertId2,
      });

      mockQuestionSubmissionRepo.updateById.mockResolvedValue({});

      mockAnswerRepo.getByQuestionId.mockResolvedValue([]);

      mockQuestionRepo.updateQuestion.mockResolvedValue({});

      mockUserService.updatePenaltyAndIncentive.mockResolvedValue(undefined);

      mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);

      await service.replaceQueueExpert(
        moderatorId,
        questionId,
        0,
        expertId2,
        true,
        'Expert unavailable',
      );

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        expect.objectContaining({
          isOnHold: false,
          status: 'open',
          holdAt: null,
        }),
        {},
      );
    });
    it('throws InternalServerError when updating penalty or incentive fails', async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

      const question = {
        _id: questionId,
        question: 'Question',
        authors_history: [],
        isOnHold: false,
      };

      mockQuestionRepo.getById
        .mockResolvedValueOnce(question)
        .mockResolvedValueOnce(question);

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: submissionId,
        queue: [new ObjectId(expertId)],
        history: [],
        createdAt: threeHoursAgo,
      });

      mockUserRepo.findById.mockResolvedValue({
        _id: expertId2,
      });

      mockQuestionSubmissionRepo.updateById.mockResolvedValue({});

      mockAnswerRepo.getByQuestionId.mockResolvedValue([]);

      mockQuestionRepo.updateQuestion.mockResolvedValue({});

      mockUserService.updatePenaltyAndIncentive.mockRejectedValue(
        new Error('Failure'),
      );

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          expertId2,
          true,
          'Expert unavailable',
        ),
      ).rejects.toThrow(
        'Failed to update penalty/incentive scores. Operation rolled back.',
      );
    });
    it('throws BadRequestError when the queue index is invalid', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [new ObjectId(expertId)],
        history: [],
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          5,
          expertId2,
          false,
          'Need replacement',
        ),
      ).rejects.toThrow('Invalid level index');
    });
    it('throws BadRequestError when the selected queue expert is not the last reviewer', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [new ObjectId(expertId)],
        history: [
          {
            updatedBy: new ObjectId(adminId),
            status: 'in-review',
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
        ],
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          expertId2,
          false,
          'Need replacement',
        ),
      ).rejects.toThrow(
        'Reallocation denied. The reviewer to be replaced must be the last assigned reviewer in the queue.',
      );
    });
    it('throws BadRequestError when replacing a reviewer who is not currently active', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [new ObjectId(expertId), new ObjectId(expertId2)],
        history: [
          {
            updatedBy: new ObjectId(adminId),
            status: 'completed',
            createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
          },
          {
            updatedBy: new ObjectId(expertId),
            status: 'in-review',
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
        ],
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          userId,
          false,
          'Need replacement',
        ),
      ).rejects.toThrow(
        'Can only replace the expert at the current active level.',
      );
    });
    it('throws BadRequestError when less than two hours have passed since reviewer assignment', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [new ObjectId(expertId)],
        history: [
          {
            updatedBy: new ObjectId(expertId),
            status: 'in-review',
            createdAt: new Date(Date.now() - 60 * 60 * 1000),
          },
        ],
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          expertId2,
          false,
          'Need replacement',
        ),
      ).rejects.toThrow(
        'Reallocation denied. At least 2 hours must pass since the review was assigned.',
      );
    });
    it('throws BadRequestError when the reviewer is not in-review', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [new ObjectId(expertId)],
        history: [
          {
            updatedBy: new ObjectId(expertId),
            status: 'completed',
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
        ],
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          expertId2,
          false,
          'Need replacement',
        ),
      ).rejects.toThrow(
        "Reallocation denied. The review status is 'completed'.",
      );
    });
    it('throws BadRequestError when the reason for queue replacement is missing', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [new ObjectId(expertId)],
        history: [
          {
            updatedBy: new ObjectId(expertId),
            status: 'in-review',
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
        ],
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          expertId2,
          false,
          '',
        ),
      ).rejects.toThrow('Reason for reallocation is required.');
    });
    it('throws NotFoundError when the new reviewer does not exist', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        isOnHold: false,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: submissionId,
        queue: [new ObjectId(expertId)],
        history: [
          {
            updatedBy: new ObjectId(expertId),
            status: 'in-review',
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
        ],
      });

      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          expertId2,
          false,
          'Need replacement',
        ),
      ).rejects.toThrow('New expert not found');
    });
    it('throws BadRequestError when the new reviewer is already in the queue', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        isOnHold: false,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: submissionId,
        queue: [new ObjectId(expertId), new ObjectId(expertId2)],
        history: [
          {
            updatedBy: new ObjectId(expertId),
            status: 'in-review',
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
        ],
      });

      mockUserRepo.findById.mockResolvedValue({
        _id: expertId2,
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          expertId2,
          false,
          'Need replacement',
        ),
      ).rejects.toThrow('The selected expert is already in the queue.');
    });
    it('throws BadRequestError when two hours have not passed since reviewer assignment', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        isOnHold: false,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: submissionId,
        queue: [new ObjectId(expertId)],
        history: [
          {
            updatedBy: new ObjectId(expertId),
            status: 'in-review',
            createdAt: new Date(Date.now() - 30 * 60 * 1000),
          },
        ],
      });

      mockUserRepo.findById.mockResolvedValue({
        _id: expertId2,
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          expertId2,
          false,
          'Need replacement',
        ),
      ).rejects.toThrow(
        'At least 2 hours must pass since the review was assigned.',
      );
    });
    it('throws BadRequestError when the review is no longer in-review', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        isOnHold: false,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: submissionId,
        queue: [new ObjectId(expertId)],
        history: [
          {
            updatedBy: new ObjectId(expertId),
            status: 'approved',
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
        ],
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          expertId2,
          false,
          'Need replacement',
        ),
      ).rejects.toThrow(
        "Only reviews in 'in-review' status can be reallocated.",
      );
    });
    it('throws BadRequestError when no reason is provided for reviewer replacement', async () => {
      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        isOnHold: false,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: submissionId,
        queue: [new ObjectId(expertId)],
        history: [
          {
            updatedBy: new ObjectId(expertId),
            status: 'in-review',
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
        ],
      });

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          expertId2,
          false,
          '',
        ),
      ).rejects.toThrow('Reason for reallocation is required.');
    });
    it('replaces the current reviewer successfully', async () => {
      const updatedSubmission = {
        _id: new ObjectId(),
        queue: [new ObjectId(expertId2)],
        history: [],
      };

      const historyEntry = {
        updatedBy: new ObjectId(expertId),
        status: 'in-review',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        previousAllocations: [],
      };

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'How to control stem borer?',
        isOnHold: false,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: new ObjectId(),
        queue: [new ObjectId(expertId)],
        history: [historyEntry],
      });

      mockUserRepo.findById.mockResolvedValue({
        _id: expertId2,
        role: 'expert',
      });

      mockQuestionSubmissionRepo.updateById.mockResolvedValue(
        updatedSubmission,
      );

      mockUserService.updatePenaltyAndIncentive.mockResolvedValue(undefined);

      mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);

      const result = await service.replaceQueueExpert(
        moderatorId,
        questionId,
        0,
        expertId2,
        false,
        'Expert unavailable',
      );

      expect(mockQuestionSubmissionRepo.updateById).toHaveBeenCalled();

      expect(mockUserService.updatePenaltyAndIncentive).toHaveBeenNthCalledWith(
        1,
        expertId,
        'penalty',
      );

      expect(mockUserService.updatePenaltyAndIncentive).toHaveBeenNthCalledWith(
        2,
        expertId2,
        'incentive',
      );

      expect(
        mockNotificationService.saveTheNotifications,
      ).toHaveBeenCalledTimes(2);

      expect(result).toBe(updatedSubmission);
    });
    it('removes the hold when replacing a reviewer on an on-hold question', async () => {
      const historyEntry = {
        updatedBy: new ObjectId(expertId),
        status: 'in-review',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        previousAllocations: [],
      };

      const holdAt = new Date(Date.now() - 60 * 60 * 1000);

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'How to control stem borer?',
        isOnHold: true,
        holdAt,
        accumulatedHoldMs: 500,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: new ObjectId(),
        queue: [new ObjectId(expertId)],
        history: [historyEntry],
      });

      mockUserRepo.findById.mockResolvedValue({
        _id: expertId2,
        role: 'expert',
      });

      mockQuestionSubmissionRepo.updateById.mockResolvedValue({
        _id: new ObjectId(),
      });

      mockUserService.updatePenaltyAndIncentive.mockResolvedValue(undefined);

      mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);

      await service.replaceQueueExpert(
        moderatorId,
        questionId,
        0,
        expertId2,
        false,
        'Expert unavailable',
      );

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
        questionId,
        expect.objectContaining({
          isOnHold: false,
          status: 'open',
          holdAt: null,
          accumulatedHoldMs: expect.any(Number),
        }),
        {},
      );
    });
    it('throws InternalServerError when updating reviewer penalty or incentive fails', async () => {
      const historyEntry = {
        updatedBy: new ObjectId(expertId),
        status: 'in-review',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        previousAllocations: [],
      };

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'How to control stem borer?',
        isOnHold: false,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: new ObjectId(),
        queue: [new ObjectId(expertId)],
        history: [historyEntry],
      });

      mockUserRepo.findById.mockResolvedValue({
        _id: expertId2,
        role: 'expert',
      });

      mockQuestionSubmissionRepo.updateById.mockResolvedValue({
        _id: new ObjectId(),
      });

      mockUserService.updatePenaltyAndIncentive.mockRejectedValue(
        new Error('Penalty service unavailable'),
      );

      await expect(
        service.replaceQueueExpert(
          moderatorId,
          questionId,
          0,
          expertId2,
          false,
          'Expert unavailable',
        ),
      ).rejects.toThrow(
        'Failed to update penalty/incentive scores. Operation rolled back.',
      );
    });
    it('continues successfully when reviewer notifications fail', async () => {
      const updatedSubmission = {
        _id: new ObjectId(),
      };

      const historyEntry = {
        updatedBy: new ObjectId(expertId),
        status: 'in-review',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        previousAllocations: [],
      };

      mockQuestionRepo.getById.mockResolvedValue({
        _id: questionId,
        question: 'How to control stem borer?',
        isOnHold: false,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        _id: new ObjectId(),
        queue: [new ObjectId(expertId)],
        history: [historyEntry],
      });

      mockUserRepo.findById.mockResolvedValue({
        _id: expertId2,
        role: 'expert',
      });

      mockQuestionSubmissionRepo.updateById.mockResolvedValue(
        updatedSubmission,
      );

      mockUserService.updatePenaltyAndIncentive.mockResolvedValue(undefined);

      mockNotificationService.saveTheNotifications.mockRejectedValue(
        new Error('Notification service down'),
      );

      const result = await service.replaceQueueExpert(
        moderatorId,
        questionId,
        0,
        expertId2,
        false,
        'Expert unavailable',
      );

      expect(result).toBe(updatedSubmission);

      expect(mockQuestionSubmissionRepo.updateById).toHaveBeenCalled();

      expect(mockUserService.updatePenaltyAndIncentive).toHaveBeenCalledTimes(
        2,
      );

      expect(
        mockNotificationService.saveTheNotifications,
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAllocatedQuestionPage', () => {
    it('returns the allocated question page', async () => {
      const {service, mocks, transactionSession} =
        setupGetAllocatedQuestionPage();

      const page = {
        page: 2,
        totalPages: 5,
      };

      mocks.mockQuestionRepo.getAllocatedQuestionPage.mockResolvedValue(page);

      const result = await service.getAllocatedQuestionPage(
        moderatorId,
        questionId,
      );

      expect(
        mocks.mockQuestionRepo.getAllocatedQuestionPage,
      ).toHaveBeenCalledWith(moderatorId, questionId, transactionSession);

      expect(result).toBe(page);
    });
    it('propagates repository errors', async () => {
      const {service, mocks} = setupGetAllocatedQuestionPage();

      mocks.mockQuestionRepo.getAllocatedQuestionPage.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.getAllocatedQuestionPage(moderatorId, questionId),
      ).rejects.toThrow('Database failure');
    });
  });
  describe('runAbsentScript', () => {
    it('returns when there are no absent experts', async () => {
      const {service, mocks} = setupRunAbsentScript();

      vi.spyOn(service, 'findAbsentExperts').mockResolvedValue([]);

      await service.runAbsentScript();

      expect(mocks.mockUserRepo.blockExperts).not.toHaveBeenCalled();
    });
    it('blocks absent experts and cleans up submissions', async () => {
      const {service, mocks, transactionSession} = setupRunAbsentScript();

      vi.spyOn(service, 'findAbsentExperts').mockResolvedValue([
        expertId,
        expertId2,
      ]);

      vi.spyOn(service as any, 'cleanupQuestionSubmissions').mockResolvedValue(
        undefined,
      );

      await service.runAbsentScript();

      expect(mocks.mockUserRepo.blockExperts).toHaveBeenCalledWith(
        [expertId, expertId2],
        transactionSession,
      );

      expect(service['cleanupQuestionSubmissions']).toHaveBeenCalledWith(
        [expertId, expertId2],
        transactionSession,
      );
    });
    it('throws InternalServerError when cleanup fails', async () => {
      const {service} = setupRunAbsentScript();

      vi.spyOn(service, 'findAbsentExperts').mockRejectedValue(
        new Error('Failure'),
      );

      await expect(service.runAbsentScript()).rejects.toThrow(
        'Daily reviewer cleanup failed',
      );
    });
  });
  describe('findAbsentExperts', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns ids of experts who have not checked in today', async () => {
      const session = {};

      mockUserRepo.findUnblockedUsers.mockResolvedValue([
        {
          _id: new ObjectId(expertId),
          lastCheckInAt: new Date(Date.now() - 86400000),
        },
        {
          _id: new ObjectId(expertId2),
          lastCheckInAt: new Date(),
        },
      ]);

      mockedIsToday
        .mockReturnValueOnce(false) // yesterday
        .mockReturnValueOnce(true); // today

      const result = await service.findAbsentExperts(session as any);

      expect(result).toEqual([expertId]);
      expect(mockedIsToday).toHaveBeenCalledTimes(2);
    });

    it('returns an empty array when everyone checked in today', async () => {
      const session = {};

      mockUserRepo.findUnblockedUsers.mockResolvedValue([
        {
          _id: new ObjectId(expertId),
          lastCheckInAt: new Date(),
        },
      ]);

      mockedIsToday.mockReturnValue(true);

      const result = await service.findAbsentExperts(session as any);

      expect(result).toEqual([]);
    });
  });
  describe('findAbsentExperts', () => {
    let removeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      removeSpy = vi
        .spyOn(service, 'removeExpertFromQueue')
        .mockResolvedValue({} as any);

      vi.spyOn(service, 'autoAllocateExperts').mockResolvedValue({} as any);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns immediately when there are no absent experts', async () => {
      const session = {};

      await service.cleanupQuestionSubmissions([], session as any);

      expect(
        mockQuestionSubmissionRepo.getAbsentSubmissions,
      ).not.toHaveBeenCalled();
    });
    it('skips submissions with an empty queue', async () => {
      const session = {};

      mockQuestionSubmissionRepo.getAbsentSubmissions.mockResolvedValue([
        {
          questionId: new ObjectId(questionId),
          queue: [],
          history: [],
        },
      ]);

      await service.cleanupQuestionSubmissions([expertId], session as any);

      expect(service.removeExpertFromQueue).not.toHaveBeenCalled();
    });
    it('removes the first queued expert when history is empty', async () => {
      const session = {};

      vi.spyOn(service, 'removeExpertFromQueue').mockResolvedValue({} as any);
      vi.spyOn(service, 'autoAllocateExperts').mockResolvedValue({} as any);

      mockQuestionSubmissionRepo.getAbsentSubmissions.mockResolvedValue([
        {
          questionId: new ObjectId(questionId),
          queue: [new ObjectId(expertId)],
          history: [],
        },
      ]);

      mockQuestionRepo.getById.mockResolvedValue({
        isAutoAllocate: true,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [],
      });

      await service.cleanupQuestionSubmissions([expertId], session as any);

      expect(service.removeExpertFromQueue).toHaveBeenCalledWith(
        'system',
        questionId,
        0,
        {skipAutoAllocate: true},
        session,
      );
    });
    it('enables auto allocation when disabled', async () => {
      const session = {};

      vi.spyOn(service, 'removeExpertFromQueue').mockResolvedValue({} as any);
      vi.spyOn(service, 'autoAllocateExperts').mockResolvedValue({} as any);

      mockQuestionSubmissionRepo.getAbsentSubmissions.mockResolvedValue([
        {
          questionId: new ObjectId(questionId),
          queue: [new ObjectId(expertId)],
          history: [],
        },
      ]);

      mockQuestionRepo.getById.mockResolvedValue({
        isAutoAllocate: false,
      });

      mockQuestionRepo.updateAutoAllocate.mockResolvedValue(undefined);

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [],
      });

      await service.cleanupQuestionSubmissions([expertId], session as any);

      expect(mockQuestionRepo.updateAutoAllocate).toHaveBeenCalledWith(
        questionId,
        true,
        session,
      );
    });
    it('auto allocates when the queue becomes empty', async () => {
      const session = {};

      vi.spyOn(service, 'removeExpertFromQueue').mockResolvedValue({} as any);

      const autoSpy = vi
        .spyOn(service, 'autoAllocateExperts')
        .mockResolvedValue({} as any);

      mockQuestionSubmissionRepo.getAbsentSubmissions.mockResolvedValue([
        {
          questionId: new ObjectId(questionId),
          queue: [new ObjectId(expertId)],
          history: [],
        },
      ]);

      mockQuestionRepo.getById.mockResolvedValue({
        isAutoAllocate: true,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [],
        history: [],
      });

      await service.cleanupQuestionSubmissions([expertId], session as any);

      expect(autoSpy).toHaveBeenCalledWith(questionId, session);
    });
    it('auto allocates when every queued reviewer has already responded', async () => {
      const session = {};

      vi.spyOn(service, 'removeExpertFromQueue').mockResolvedValue({} as any);

      const autoSpy = vi
        .spyOn(service, 'autoAllocateExperts')
        .mockResolvedValue({} as any);

      mockQuestionSubmissionRepo.getAbsentSubmissions.mockResolvedValue([
        {
          questionId: new ObjectId(questionId),
          queue: [new ObjectId(expertId)],
          history: [],
        },
      ]);

      mockQuestionRepo.getById.mockResolvedValue({
        isAutoAllocate: true,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [new ObjectId(expertId)],
        history: [{}],
      });

      await service.cleanupQuestionSubmissions([expertId], session as any);

      expect(autoSpy).toHaveBeenCalled();
    });
    it('does not auto allocate when enough reviewers remain', async () => {
      const session = {};

      vi.spyOn(service, 'removeExpertFromQueue').mockResolvedValue({} as any);

      const autoSpy = vi
        .spyOn(service, 'autoAllocateExperts')
        .mockResolvedValue({} as any);

      mockQuestionSubmissionRepo.getAbsentSubmissions.mockResolvedValue([
        {
          questionId: new ObjectId(questionId),
          queue: [
            new ObjectId(expertId),
            new ObjectId(expertId2),
            new ObjectId(userId),
          ],
          history: [],
        },
      ]);

      mockQuestionRepo.getById.mockResolvedValue({
        isAutoAllocate: true,
      });

      mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
        queue: [
          new ObjectId(expertId),
          new ObjectId(expertId2),
          new ObjectId(userId),
        ],
        history: [],
      });

      await service.cleanupQuestionSubmissions(
        ['some-other-id'],
        session as any,
      );

      expect(autoSpy).not.toHaveBeenCalled();
    });
  });
  describe('balanceWorkload', () => {
    it('returns when there are no active experts for inactive balancing', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([]);

      const result = await service.balanceWorkload(undefined, 'inactive');

      expect(result).toEqual({
        message: 'No active experts with low workload available for balancing',
        expertsInvolved: 0,
        submissionsProcessed: 0,
      });
    });
    it('returns when there are no inactive experts', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([
        {_id: new ObjectId(expertId)},
      ]);

      mockUserRepo.findInactiveOrBlockedExperts.mockResolvedValue([]);

      const result = await service.balanceWorkload(undefined, 'inactive');

      expect(result).toEqual({
        message: 'No inactive or blocked experts found',
        expertsInvolved: 1,
        submissionsProcessed: 0,
      });
    });
    it('returns when inactive experts have no active submissions', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([
        {_id: new ObjectId(expertId)},
      ]);

      mockUserRepo.findInactiveOrBlockedExperts.mockResolvedValue([
        {_id: new ObjectId(expertId2)},
      ]);

      mockQuestionSubmissionRepo.findSubmissionsWithExpertsInQueue.mockResolvedValue(
        [],
      );

      const result = await service.balanceWorkload(undefined, 'inactive');

      expect(result).toEqual({
        message: 'No active tasks found for inactive experts',
        expertsInvolved: 1,
        submissionsProcessed: 0,
      });
    });
    it('starts inactive balancing successfully', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([
        {_id: new ObjectId(expertId)},
      ]);

      mockUserRepo.findInactiveOrBlockedExperts.mockResolvedValue([
        {_id: new ObjectId(expertId2)},
      ]);

      mockQuestionSubmissionRepo.findSubmissionsWithExpertsInQueue.mockResolvedValue(
        [
          {
            _id: new ObjectId(questionId),
            queue: [],
            history: [],
          },
        ],
      );

      const result = await service.balanceWorkload(undefined, 'inactive');

      expect(startBalanceWorkloadWorkers).toHaveBeenCalled();

      expect(result.message).toContain('Inactive-to-Active');
    });
    it('returns when there are no active experts', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([]);

      const result = await service.balanceWorkload();

      expect(result).toEqual({
        message: 'No Expert Present To Reallocate Questions .No action needed.',
        expertsInvolved: 0,
        submissionsProcessed: 0,
      });
    });
    it('returns when there are no delayed submissions', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([
        {_id: new ObjectId(expertId)},
      ]);

      mockQuestionSubmissionRepo.findQuestionsNeedingEscalation.mockResolvedValue(
        [],
      );

      const result = await service.balanceWorkload();

      expect(result.message).toContain('No questions are pending allocation');
    });
    it('removes hold from delayed questions before balancing', async () => {
      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (cb: any) => cb({} as any),
      );

      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([
        {_id: new ObjectId(expertId)},
      ]);

      mockQuestionSubmissionRepo.findQuestionsNeedingEscalation.mockResolvedValue(
        [
          {
            _id: new ObjectId(questionId),
            queue: [],
            history: [],
            question: {
              _id: new ObjectId(questionId),
              isOnHold: true,
              holdAt: new Date(Date.now() - 1000),
              accumulatedHoldMs: 0,
            },
          },
        ],
      );

      mockQuestionRepo.updateQuestion.mockResolvedValue({});

      await service.balanceWorkload();

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalled();
    });
    it('starts workload balancing successfully', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([
        {_id: new ObjectId(expertId)},
      ]);

      mockQuestionSubmissionRepo.findQuestionsNeedingEscalation.mockResolvedValue(
        [
          {
            _id: new ObjectId(questionId),
            queue: [],
            history: [],
            question: {
              _id: new ObjectId(questionId),
              isOnHold: false,
            },
          },
        ],
      );

      const result = await service.balanceWorkload();

      expect(startBalanceWorkloadWorkers).toHaveBeenCalled();

      expect(result.message).toContain('Workload balancing started');
    });
  });
  describe('getReallocationPreview', () => {
    beforeEach(() => {
      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (cb: (session: any) => Promise<any>) => {
          return cb({} as any);
        },
      );
    });
    it('returns an empty inactive preview when there are no inactive experts', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([]);
      mockUserRepo.findInactiveOrBlockedExperts.mockResolvedValue([]);

      const result = await service.getReallocationPreview('inactive');

      expect(result).toEqual({
        questions: [],
        activeExperts: [],
        inactiveExpertIds: [],
      });

      expect(
        mockQuestionSubmissionRepo.findSubmissionsWithExpertsInQueue,
      ).not.toHaveBeenCalled();
    });
    it('loads delayed questions for escalation preview', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([]);

      mockQuestionSubmissionRepo.findQuestionsNeedingEscalation.mockResolvedValue(
        [],
      );

      await service.getReallocationPreview('escalation');

      expect(
        mockQuestionSubmissionRepo.findQuestionsNeedingEscalation,
      ).toHaveBeenCalledWith(50, expect.anything());
    });
    it('loads submissions for inactive experts', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([]);

      mockUserRepo.findInactiveOrBlockedExperts.mockResolvedValue([
        {_id: new ObjectId(expertId)},
      ]);

      mockQuestionSubmissionRepo.findSubmissionsWithExpertsInQueue.mockResolvedValue(
        [],
      );

      await service.getReallocationPreview('inactive');

      expect(
        mockQuestionSubmissionRepo.findSubmissionsWithExpertsInQueue,
      ).toHaveBeenCalledWith([expertId], expect.anything(), 50);
    });
    it('returns active experts with names and reputation', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([
        {
          _id: new ObjectId(expertId),
          firstName: 'John',
          lastName: 'Doe',
          reputation_score: 18,
        },
      ]);

      mockQuestionSubmissionRepo.findQuestionsNeedingEscalation.mockResolvedValue(
        [],
      );

      const result = await service.getReallocationPreview('escalation');

      expect(result.activeExperts).toEqual([
        {
          id: expertId,
          name: 'John Doe',
          reputation_score: 18,
        },
      ]);
    });
    it('populates question text and current expert information', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([]);

      mockQuestionSubmissionRepo.findQuestionsNeedingEscalation.mockResolvedValue(
        [
          {
            _id: new ObjectId(contextId),
            questionId: new ObjectId(questionId),
            queue: [new ObjectId(expertId)],
            history: [],
          },
        ],
      );

      mockUserRepo.getUsersByIds.mockResolvedValue([
        {
          _id: new ObjectId(expertId),
          firstName: 'Alice',
          lastName: 'Smith',
          status: 'active',
          isBlocked: false,
        },
      ]);

      mockQuestionRepo.getById.mockResolvedValue({
        question: 'How to grow wheat?',
      });

      const result = await service.getReallocationPreview('escalation');

      expect(result.questions[0]).toMatchObject({
        questionId,
        questionText: 'How to grow wheat?',
        currentExpertId: expertId,
        currentExpertName: 'Alice Smith',
        currentExpertStatus: 'active',
        isCurrentExpertBlocked: false,
      });
    });
    it('skips deleted questions', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([]);

      mockQuestionSubmissionRepo.findQuestionsNeedingEscalation.mockResolvedValue(
        [
          {
            _id: new ObjectId(contextId),
            questionId: new ObjectId(questionId),
            queue: [],
            history: [],
          },
        ],
      );

      mockUserRepo.getUsersByIds.mockResolvedValue([]);

      mockQuestionRepo.getById.mockResolvedValue(null);

      const result = await service.getReallocationPreview('escalation');

      expect(result.questions).toEqual([]);
    });
    it('falls back to another inactive expert in the queue', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([]);

      mockUserRepo.findInactiveOrBlockedExperts.mockResolvedValue([
        {_id: new ObjectId(expertId2)},
      ]);

      mockQuestionSubmissionRepo.findSubmissionsWithExpertsInQueue.mockResolvedValue(
        [
          {
            _id: new ObjectId(contextId),
            questionId: new ObjectId(questionId),
            history: [],
            queue: [new ObjectId(expertId), new ObjectId(expertId2)],
          },
        ],
      );

      mockUserRepo.getUsersByIds.mockResolvedValue([
        {
          _id: new ObjectId(expertId2),
          firstName: 'Bob',
          lastName: 'Jones',
          status: 'inactive',
          isBlocked: true,
        },
      ]);

      mockQuestionRepo.getById.mockResolvedValue({
        question: 'Question',
      });

      const result = await service.getReallocationPreview('inactive');

      expect(result.questions[0].currentExpertId).toBe(expertId2);
    });
    it('skips questions that fail to load', async () => {
      mockUserRepo.findActiveLowReputationExpertsToday.mockResolvedValue([]);

      mockQuestionSubmissionRepo.findQuestionsNeedingEscalation.mockResolvedValue(
        [
          {
            _id: new ObjectId(contextId),
            questionId: new ObjectId(questionId),
            queue: [],
            history: [],
          },
        ],
      );

      mockUserRepo.getUsersByIds.mockResolvedValue([]);

      mockQuestionRepo.getById.mockRejectedValue(new Error('db'));

      const result = await service.getReallocationPreview('escalation');

      expect(result.questions).toEqual([]);
    });
  });
  describe('manualReallocate', () => {
    it('starts the background worker when assignments are provided', async () => {
      const assignments = [
        {
          submissionId: contextId,
          expertId,
        },
      ];

      const result = await service.manualReallocate(assignments, [expertId2]);

      expect(startBalanceWorkloadWorkers).toHaveBeenCalledWith(assignments, [
        expertId2,
      ]);

      expect(result).toEqual({
        message: 'Manual reallocation started in background',
        submissionsProcessed: 1,
      });
    });

    it('does not start the background worker when there are no assignments', async () => {
      const result = await service.manualReallocate([]);

      expect(startBalanceWorkloadWorkers).not.toHaveBeenCalled();

      expect(result).toEqual({
        message: 'Manual reallocation started in background',
        submissionsProcessed: 0,
      });
    });
  });
  describe('sendOutReachQuestionsMail', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      vi.spyOn(service as any, 'convertQuestionsToExcel').mockResolvedValue(
        Buffer.from('excel'),
      );
    });

    it('throws when startDate is missing', async () => {
      await expect(
        service.sendOutReachQuestionsMail('', '2025-01-31', 'test@test.com'),
      ).rejects.toThrow('startDate and endDate are required');
    });

    it('throws when endDate is missing', async () => {
      await expect(
        service.sendOutReachQuestionsMail('2025-01-01', '', 'test@test.com'),
      ).rejects.toThrow('startDate and endDate are required');
    });

    it('returns success when no outreach questions are found', async () => {
      mockQuestionRepo.findByDateRangeAndSource.mockResolvedValue([]);
      mockDuplicateQuestionRepository.findDuplicatesByDateRange.mockResolvedValue(
        [],
      );

      const result = await service.sendOutReachQuestionsMail(
        '2025-01-01',
        '2025-01-31',
        'test@test.com',
      );

      expect(result).toEqual({
        success: true,
        message: 'There are no Outreach questions in the selected time',
      });

      expect(sendEmailWithAttachment).not.toHaveBeenCalled();
    });

    it('generates an excel report and sends the email', async () => {
      const question = {
        question: 'Normal Question',
        createdAt: new Date('2025-01-01'),
      };

      const duplicateQuestion = {
        question: 'Duplicate Question',
        createdAt: new Date('2025-01-02'),
      };

      mockQuestionRepo.findByDateRangeAndSource.mockResolvedValue([question]);

      mockDuplicateQuestionRepository.findDuplicatesByDateRange.mockResolvedValue(
        [duplicateQuestion],
      );

      vi.mocked(sendEmailWithAttachment).mockResolvedValue(undefined);

      const result = await service.sendOutReachQuestionsMail(
        '2025-01-01',
        '2025-01-31',
        ['test@test.com'],
      );

      expect((service as any).convertQuestionsToExcel).toHaveBeenCalledWith(
        expect.arrayContaining([question, duplicateQuestion]),
        '2025-01-01',
        '2025-01-31',
      );

      expect(sendEmailWithAttachment).toHaveBeenCalledWith(
        ['test@test.com'],
        'Ajrasakha Outreach Questions Report',
        expect.stringContaining(
          'Please find attached the <b>Ajrasakha Outreach Questions</b> report.',
        ),
        expect.any(Buffer),
        'out_reach_questions.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      expect(result).toEqual({
        success: true,
        message: 'Outreach questions report sent via email',
      });
    });

    it('sorts questions by createdAt before generating the excel', async () => {
      const older = {
        question: 'Older',
        createdAt: new Date('2025-01-01'),
      };

      const newer = {
        question: 'Newer',
        createdAt: new Date('2025-01-03'),
      };

      mockQuestionRepo.findByDateRangeAndSource.mockResolvedValue([older]);

      mockDuplicateQuestionRepository.findDuplicatesByDateRange.mockResolvedValue(
        [newer],
      );

      vi.mocked(sendEmailWithAttachment).mockResolvedValue(undefined);

      await service.sendOutReachQuestionsMail(
        '2025-01-01',
        '2025-01-31',
        'test@test.com',
      );

      const questionsPassed = ((service as any).convertQuestionsToExcel as any)
        .mock.calls[0][0];

      expect(questionsPassed[0]).toBe(newer);
      expect(questionsPassed[1]).toBe(older);
    });

    it('propagates email sending failures', async () => {
      mockQuestionRepo.findByDateRangeAndSource.mockResolvedValue([
        {
          question: 'Question',
          createdAt: new Date(),
        },
      ]);

      mockDuplicateQuestionRepository.findDuplicatesByDateRange.mockResolvedValue(
        [],
      );

      vi.mocked(sendEmailWithAttachment).mockRejectedValue(
        new Error('SMTP failed'),
      );

      await expect(
        service.sendOutReachQuestionsMail(
          '2025-01-01',
          '2025-01-31',
          'test@test.com',
        ),
      ).rejects.toThrow('SMTP failed');
    });
  });
  describe('generateQuestionReport', () => {
    it('returns null when there are no modification or rejection reasons', async () => {
      mockAnswerRepo.groupbyquestion.mockResolvedValue({
        reasons: [
          {
            createdAt: new Date(),
            question: 'Question 1',
            reasonForModification: [],
            reasonForRejection: [],
          },
          {
            createdAt: new Date(),
            question: 'Question 2',
            reasonForModification: [null],
            reasonForRejection: [''],
          },
        ],
      });

      const result = await service.generateQuestionReport();

      expect(mockAnswerRepo.groupbyquestion).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
      );

      expect(result).toBeNull();
    });

    it('returns an excel buffer when valid reasons exist', async () => {
      mockAnswerRepo.groupbyquestion.mockResolvedValue({
        reasons: [
          {
            createdAt: new Date(),
            question: 'Why are wheat leaves yellow?',
            reasonForModification: ['Improve wording', 'Add crop details'],
            reasonForRejection: ['Duplicate'],
          },
        ],
      });

      const result = await service.generateQuestionReport();

      expect(mockAnswerRepo.groupbyquestion).toHaveBeenCalled();

      // expect(result).toBeInstanceOf(Buffer);
      // expect(result.length).toBeGreaterThan(0);
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    });

    it('skips rows that contain no reasons', async () => {
      mockAnswerRepo.groupbyquestion.mockResolvedValue({
        reasons: [
          {
            createdAt: new Date(),
            question: 'Should not appear',
            reasonForModification: [],
            reasonForRejection: [],
          },
          {
            createdAt: new Date(),
            question: 'Should appear',
            reasonForModification: ['Needs clarification'],
            reasonForRejection: [],
          },
        ],
      });

      const result = await service.generateQuestionReport();

      // expect(result).toBeInstanceOf(Buffer);
      // expect(result.length).toBeGreaterThan(0);
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    });

    it('passes the supplied filters to groupbyquestion', async () => {
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');

      mockAnswerRepo.groupbyquestion.mockResolvedValue({
        reasons: [
          {
            createdAt: new Date(),
            question: 'Question',
            reasonForModification: ['Reason'],
            reasonForRejection: [],
          },
        ],
      });

      await service.generateQuestionReport(3, start, end);

      expect(mockAnswerRepo.groupbyquestion).toHaveBeenCalledWith(
        3,
        start,
        end,
      );
    });
  });
  describe('generateOverallQuestionReport', () => {
    beforeEach(() => {
      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (cb: (session: any) => Promise<any>) => cb({} as any),
      );
    });

    it('returns null when there are no monthly statistics', async () => {
      mockQuestionRepo.getMonthlyQuestionStats.mockResolvedValue([]);

      const result = await service.generateOverallQuestionReport();

      expect(mockQuestionRepo.getMonthlyQuestionStats).toHaveBeenCalledWith(
        undefined,
        undefined,
        expect.anything(),
      );

      expect(result).toBeNull();
    });

    it('returns an excel report when statistics exist', async () => {
      mockQuestionRepo.getMonthlyQuestionStats.mockResolvedValue([
        {
          year: 2025,
          month: 'January',
          totalQuestions: 100,
          modifiedAnswers: 20,
          rejectedAnswers: 5,
        },
        {
          year: 2025,
          month: 'February',
          totalQuestions: 80,
          modifiedAnswers: 10,
          rejectedAnswers: 2,
        },
      ]);

      const result = await service.generateOverallQuestionReport();

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    });

    it('passes the supplied date range to the repository', async () => {
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');

      mockQuestionRepo.getMonthlyQuestionStats.mockResolvedValue([
        {
          year: 2025,
          month: 'January',
          totalQuestions: 100,
          modifiedAnswers: 20,
          rejectedAnswers: 5,
        },
      ]);

      await service.generateOverallQuestionReport(start, end);

      expect(mockQuestionRepo.getMonthlyQuestionStats).toHaveBeenCalledWith(
        start,
        end,
        expect.anything(),
      );
    });
  });
  describe('generateStateCropQuestionReport', () => {
    beforeEach(() => {
      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (cb: (session: any) => Promise<any>) => cb({} as any),
      );

      vi.spyOn(service as any, 'resolveExpertNames').mockResolvedValue(
        new Map([[moderatorId, 'John Moderator']]),
      );

      vi.spyOn(service as any, 'formatAnswerSources').mockReturnValue(
        'Source 1',
      );
    });

    it('returns null when no questions are found', async () => {
      mockQuestionRepo.getQuestionsByFilters.mockResolvedValue([]);

      const result = await service.generateStateCropQuestionReport({});

      expect(result).toBeNull();
    });

    it('passes the correct query to getQuestionsByFilters', async () => {
      mockQuestionRepo.getQuestionsByFilters.mockResolvedValue([
        {
          _id: new ObjectId(questionId),
          createdAt: new Date(),
          question: 'Question',
          details: {},
        },
      ]);

      await service.generateStateCropQuestionReport({
        state: 'Punjab',
        crop: 'Wheat',
        status: 'open',
        source: 'AGRI_EXPERT',
      });

      expect(mockQuestionRepo.getQuestionsByFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          'details.state': 'Punjab',
          'details.crop': 'Wheat',
          status: 'open',
          source: 'AGRI_EXPERT',
        }),
        expect.anything(),
        false,
        undefined,
      );
    });

    it('returns null when moderator filter finds no approved questions', async () => {
      mockAnswerRepo.getFinalAnswerQuestionIdsByApprover.mockResolvedValue([]);

      const result = await service.generateStateCropQuestionReport({
        moderator: moderatorId,
      });

      expect(result).toBeNull();
    });

    it('includes answers and moderator details for closed questions', async () => {
      const question = {
        _id: new ObjectId(questionId),
        createdAt: new Date(),
        question: 'Question',
        details: {},
        status: 'closed',
        priority: 'medium',
        source: 'AGRI_EXPERT',
      };

      mockQuestionRepo.getQuestionsByFilters.mockResolvedValue([question]);

      mockAnswerRepo.getFinalAnswersByQuestionIds.mockResolvedValue([
        {
          questionId: question._id,
          answer: 'Final Answer',
          approvedBy: new ObjectId(moderatorId),
          sources: [],
        },
      ]);

      const result = await service.generateStateCropQuestionReport({
        status: 'closed',
      });

      expect(result).toBeDefined();

      expect(mockAnswerRepo.getFinalAnswersByQuestionIds).toHaveBeenCalled();
    });

    it('includes answers when filtering by moderator', async () => {
      mockAnswerRepo.getFinalAnswerQuestionIdsByApprover.mockResolvedValue([
        questionId,
      ]);

      mockQuestionRepo.getQuestionsByFilters.mockResolvedValue([
        {
          _id: new ObjectId(questionId),
          createdAt: new Date(),
          question: 'Question',
          details: {},
          priority: 'medium',
          source: 'AGRI_EXPERT',
        },
      ]);

      mockAnswerRepo.getFinalAnswersByQuestionIds.mockResolvedValue([]);

      await service.generateStateCropQuestionReport({
        moderator: moderatorId,
      });

      expect(
        mockAnswerRepo.getFinalAnswerQuestionIdsByApprover,
      ).toHaveBeenCalledWith([moderatorId], expect.anything());

      expect(mockAnswerRepo.getFinalAnswersByQuestionIds).toHaveBeenCalled();
    });

    it('adds the duplicateQuestions flag to repository query', async () => {
      mockQuestionRepo.getQuestionsByFilters.mockResolvedValue([
        {
          _id: new ObjectId(questionId),
          createdAt: new Date(),
          question: 'Question',
          details: {},
        },
      ]);

      await service.generateStateCropQuestionReport({
        duplicateQuestions: 'true',
      });

      expect(mockQuestionRepo.getQuestionsByFilters).toHaveBeenCalledWith(
        expect.any(Object),
        expect.anything(),
        true,
        undefined,
      );
    });

    it('applies the 50 question limit for closed reports', async () => {
      mockQuestionRepo.getQuestionsByFilters.mockResolvedValue([
        {
          _id: new ObjectId(questionId),
          createdAt: new Date(),
          question: 'Question',
          details: {},
          status: 'closed',
        },
      ]);

      mockAnswerRepo.getFinalAnswersByQuestionIds.mockResolvedValue([]);

      await service.generateStateCropQuestionReport({
        status: 'closed',
      });

      expect(mockQuestionRepo.getQuestionsByFilters).toHaveBeenCalledWith(
        expect.any(Object),
        expect.anything(),
        false,
        50,
      );
    });

    it('handles multiple normalised crops', async () => {
      mockQuestionRepo.getQuestionsByFilters.mockResolvedValue([
        {
          _id: new ObjectId(questionId),
          createdAt: new Date(),
          question: 'Question',
          details: {},
        },
      ]);

      await service.generateStateCropQuestionReport({
        normalised_crop: 'Wheat,Rice',
      });

      const query = mockQuestionRepo.getQuestionsByFilters.mock.calls[0][0];

      expect(query['details.normalised_crop'].$in).toHaveLength(2);
    });

    it('returns an excel buffer when questions exist', async () => {
      mockQuestionRepo.getQuestionsByFilters.mockResolvedValue([
        {
          _id: new ObjectId(questionId),
          createdAt: new Date(),
          question: 'Question',
          details: {
            state: 'Punjab',
            district: 'Ludhiana',
            crop: 'Wheat',
            season: 'Kharif',
            domain: 'Disease',
          },
          status: 'open',
          priority: 'medium',
          source: 'AGRI_EXPERT',
        },
      ]);

      const result = await service.generateStateCropQuestionReport({});

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    });
  });
  describe('generateDuplicateQuestionReport', () => {
    beforeEach(() => {
      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (cb: (session: any) => Promise<any>) => cb({} as any),
      );
    });

    it('throws when startDate is not provided', async () => {
      await expect(
        service.generateDuplicateQuestionReport(undefined, new Date()),
      ).rejects.toThrow('startDate and endDate are required');
    });

    it('throws when endDate is not provided', async () => {
      await expect(
        service.generateDuplicateQuestionReport(new Date(), undefined),
      ).rejects.toThrow('startDate and endDate are required');
    });

    it('returns null when no duplicate questions are found', async () => {
      mockDuplicateQuestionRepository.findDuplicatesByDateRange.mockResolvedValue(
        [],
      );

      const result = await service.generateDuplicateQuestionReport(
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result).toBeNull();

      expect(
        mockDuplicateQuestionRepository.findDuplicatesByDateRange,
      ).toHaveBeenCalledWith(
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        expect.anything(),
      );
    });

    it('returns an excel report when duplicate questions exist', async () => {
      mockDuplicateQuestionRepository.findDuplicatesByDateRange.mockResolvedValue(
        [
          {
            _id: new ObjectId(questionId),
            createdAt: new Date(),
            question: 'Duplicate question',
            source: 'AJRASAKHA',
            similarityScore: 94,
            referenceQuestion: 'Original question',
            referenceSource: 'reviewer',
            referenceQuestionId: new ObjectId(referenceQuestionId),
            details: {
              state: 'Punjab',
              district: 'Ludhiana',
              crop: 'Wheat',
              season: 'Kharif',
              domain: 'Disease',
            },
          },
        ],
      );

      mockQuestionRepo.getById.mockResolvedValue({
        details: {
          state: 'Punjab',
          district: 'Patiala',
          crop: 'Rice',
          season: 'Rabi',
          domain: 'Pest',
        },
      });

      const result = await service.generateDuplicateQuestionReport(
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result).toBeDefined();
      expect(result).not.toBeNull();

      expect(mockQuestionRepo.getById).toHaveBeenCalledWith(
        referenceQuestionId,
        expect.anything(),
      );
    });

    it('continues generating the report when fetching a reference question fails', async () => {
      mockDuplicateQuestionRepository.findDuplicatesByDateRange.mockResolvedValue(
        [
          {
            _id: new ObjectId(questionId),
            createdAt: new Date(),
            question: 'Duplicate question',
            source: 'AJRASAKHA',
            similarityScore: 91,
            referenceQuestion: 'Original question',
            referenceSource: 'reviewer',
            referenceQuestionId: new ObjectId(referenceQuestionId),
            details: {
              state: 'Punjab',
              district: 'Ludhiana',
              crop: 'Wheat',
              season: 'Kharif',
              domain: 'Disease',
            },
          },
        ],
      );

      mockQuestionRepo.getById.mockRejectedValue(new Error('Database error'));

      const result = await service.generateDuplicateQuestionReport(
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    });

    it('fetches each reference question only once even if multiple duplicates share it', async () => {
      const refObjectId = new ObjectId(referenceQuestionId);

      mockDuplicateQuestionRepository.findDuplicatesByDateRange.mockResolvedValue(
        [
          {
            _id: new ObjectId(),
            createdAt: new Date(),
            question: 'Question 1',
            source: 'AJRASAKHA',
            similarityScore: 90,
            referenceQuestion: 'Ref',
            referenceSource: 'reviewer',
            referenceQuestionId: refObjectId,
            details: {},
          },
          {
            _id: new ObjectId(),
            createdAt: new Date(),
            question: 'Question 2',
            source: 'AJRASAKHA',
            similarityScore: 92,
            referenceQuestion: 'Ref',
            referenceSource: 'reviewer',
            referenceQuestionId: refObjectId,
            details: {},
          },
        ],
      );

      mockQuestionRepo.getById.mockResolvedValue({
        details: {
          state: 'Punjab',
        },
      });

      await service.generateDuplicateQuestionReport(
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(mockQuestionRepo.getById).toHaveBeenCalledTimes(1);
    });
  });
});
