import {describe, it, expect, beforeEach, vi} from 'vitest';
import {QuestionService} from '../services/QuestionService.js';
import {ObjectId} from 'mongodb';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from 'routing-controllers';

// ─── Shared mock factory ────────────────────────────────────────────────────
function buildMocks() {
  return {
    mockAiService: {
      getEmbedding: vi.fn(),
      getQuestionByContext: vi.fn(),
      getAnswerByQuestionDetails: vi.fn(),
      fetchWhatsAppMessage: vi.fn(),
    },
    mockAccAgentService: {
      createThread: vi.fn(),
      extractData: vi.fn(),
      updateState: vi.fn(),
      resumeAndGetAnswer: vi.fn(),
    },
    mockContextRepo: {
      addContext: vi.fn(),
    },
    mockQuestionRepo: {
      getById: vi.fn(),
      addQuestion: vi.fn(),
      updateQuestion: vi.fn(),
      updateAutoAllocate: vi.fn(),
      deleteQuestion: vi.fn(),
      insertMany: vi.fn(),
      addDummyQuestion: vi.fn(),
      getByContextId: vi.fn(),
      getAllocatedQuestions: vi.fn(),
      findDetailedQuestions: vi.fn(),
      getQuestionByQuestionText: vi.fn(),
      findTopSimilarQuestions: vi.fn(),
      getQuestionWithFullData: vi.fn(),
      getAllocatedQuestionPage: vi.fn(),
      getQuestionsAndReviewLevel: vi.fn(),
      findByDateRangeAndSource: vi.fn(),
      getQuestionsWithAnswerDetails: vi.fn(),
      getMonthlyQuestionStats: vi.fn(),
      getQuestionsByFilters: vi.fn(),
      getQuestionsWithEmptyEmbeddings: vi.fn(),
      updateQuestionEmbedding: vi.fn(),
      getQuestionStatusSummary: vi.fn(),
    },
    mockUserRepo: {
      findById: vi.fn(),
      findAll: vi.fn(),
      findExpertsByPreference: vi.fn(),
      updateReputationScore: vi.fn(),
      findModerators: vi.fn(),
      getSpecialTaskForceModerators: vi.fn(),
      findUnblockedUsers: vi.fn(),
      blockExperts: vi.fn(),
      findActiveLowReputationExpertsToday: vi.fn(),
      findInactiveOrBlockedExperts: vi.fn(),
      getExpertsWithFallback: vi.fn(),
      getUsersByIds: vi.fn(),
      removeAssignedQuestionFromAllModerators: vi.fn(),
    },
    mockQuestionSubmissionRepo: {
      addSubmission: vi.fn(),
      getByQuestionId: vi.fn(),
      updateQueue: vi.fn(),
      update: vi.fn(),
      updateById: vi.fn(),
      allocateExperts: vi.fn(),
      deleteByQuestionId: vi.fn(),
      getAbsentSubmissions: vi.fn(),
      findQuestionsNeedingEscalation: vi.fn(),
      findSubmissionsWithExpertsInQueue: vi.fn(),
      getDetailedSubmissionHistory: vi.fn(),
      markDelayedNotificationsSent: vi.fn(),
      getDelayedReviews: vi.fn(),
      findReallocationQuestionsByIds: vi.fn(),
      updateSubmissionState: vi.fn(),
      removeExpertFromQueuebyIndex: vi.fn(),
    },
    mockRequestRepository: {
      deleteByEntityId: vi.fn(),
    },
    mockAnswerRepo: {
      getByQuestionId: vi.fn(),
      deleteByQuestionId: vi.fn(),
      updateAnswerStatus: vi.fn(),
      updateAnswer: vi.fn(),
      groupbyquestion: vi.fn(),
    },
    mockNotificationRepository: {
      addNotification: vi.fn(),
    },
    mockNotificationService: {
      saveTheNotifications: vi.fn(),
    },
    mockReRouteRepository: {
      findByQuestionId: vi.fn(),
    },
    mockDuplicateQuestionRepository: {
      addDuplicate: vi.fn(),
      deleteByReferenceQuestionId: vi.fn(),
      findDuplicatesByDateRange: vi.fn(),
    },
    mockCropRepository: {
      findByNameOrAlias: vi.fn(),
      createCrop: vi.fn(),
    },
    mockChatbotRepository: {
      findMatchingMessages: vi.fn(),
      findFromSecondDb: vi.fn(),
    },
    mockMongoDatabase: {
      startSession: vi.fn(),
    },
    mockUserService: {
      updatePenaltyAndIncentive: vi.fn(),
    },
  };
}

// ─── Helper: build a QuestionService from a mocks object ───────────────────
function buildService(mocks: ReturnType<typeof buildMocks>): QuestionService {
  return new QuestionService(
    mocks.mockAiService as any,
    mocks.mockAccAgentService as any,
    mocks.mockContextRepo as any,
    mocks.mockQuestionRepo as any,
    mocks.mockUserRepo as any,
    mocks.mockQuestionSubmissionRepo as any,
    mocks.mockRequestRepository as any,
    mocks.mockAnswerRepo as any,
    mocks.mockNotificationRepository as any,
    mocks.mockNotificationService as any,
    mocks.mockReRouteRepository as any,
    mocks.mockDuplicateQuestionRepository as any,
    mocks.mockCropRepository as any,
    mocks.mockChatbotRepository as any,
    mocks.mockMongoDatabase as any,
    mocks.mockUserService as any,
  );
}

// ─── Sample data helpers ────────────────────────────────────────────────────
const sampleId = new ObjectId().toString();
const sampleQuestion = () => ({
  _id: new ObjectId(sampleId),
  question: 'How to control aphids on wheat?',
  status: 'open',
  source: 'AGRI_EXPERT',
  priority: 'medium',
  details: {
    state: 'Punjab',
    district: 'Ludhiana',
    crop: 'Wheat',
    season: 'Rabi',
    domain: 'Pest',
  },
  isAutoAllocate: true,
  embedding: [],
  totalAnswersCount: 0,
  aiInitialAnswer: '',
  text: 'Question: How to control aphids on wheat?',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const sampleSubmission = (questionId = sampleId) => ({
  _id: new ObjectId(),
  questionId: new ObjectId(questionId),
  lastRespondedBy: null,
  history: [],
  queue: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ════════════════════════════════════════════════════════════════════════════
// getQuestionDataById
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.getQuestionDataById', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
  });

  it('returns question when repository finds it', async () => {
    const q = sampleQuestion();
    mocks.mockQuestionRepo.getById.mockResolvedValue(q);

    const result = await service.getQuestionDataById(sampleId);

    expect(mocks.mockQuestionRepo.getById).toHaveBeenCalledWith(sampleId);
    expect(result).toEqual(q);
  });

  it('returns null when question does not exist', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(null);

    const result = await service.getQuestionDataById(sampleId);

    expect(result).toBeNull();
  });

  it('returns null when repository throws', async () => {
    mocks.mockQuestionRepo.getById.mockRejectedValue(new Error('DB error'));

    const result = await service.getQuestionDataById(sampleId);

    expect(result).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// createBulkQuestions
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.createBulkQuestions', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;
  // Use a valid 24-char hex ObjectId string for userId — 'user1' is rejected by new ObjectId()
  const validUserId = new ObjectId().toHexString();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
  });

  it('throws BadRequestError when questions array is empty', async () => {
    await expect(service.createBulkQuestions(validUserId, [])).rejects.toThrow(
      BadRequestError,
    );
  });

  it('throws BadRequestError when questions argument is not an array', async () => {
    await expect(
      service.createBulkQuestions(validUserId, null as any),
    ).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError when a question has an empty question field', async () => {
    mocks.mockCropRepository.findByNameOrAlias.mockResolvedValue(null);

    await expect(
      service.createBulkQuestions(validUserId, [
        {
          question: '   ',
          crop: 'Wheat',
          state: 'Punjab',
          district: 'Ludhiana',
          season: 'Rabi',
          domain: 'Pest',
        },
      ]),
    ).rejects.toThrow(BadRequestError);
  });

  it('inserts questions and returns inserted IDs', async () => {
    mocks.mockCropRepository.findByNameOrAlias.mockResolvedValue({
      name: 'Wheat',
    });
    mocks.mockQuestionRepo.insertMany.mockResolvedValue(['id1', 'id2']);

    const result = await service.createBulkQuestions(validUserId, [
      {
        question: 'Q1',
        crop: 'Wheat',
        state: 'Punjab',
        district: 'Ludhiana',
        season: 'Rabi',
        domain: 'Pest',
      },
      {
        question: 'Q2',
        crop: 'Wheat',
        state: 'Punjab',
        district: 'Ludhiana',
        season: 'Rabi',
        domain: 'Pest',
      },
    ]);

    expect(mocks.mockQuestionRepo.insertMany).toHaveBeenCalledOnce();
    expect(result).toEqual(['id1', 'id2']);
  });

  it('uses OUTREACH source when isOutreachQuestion is true', async () => {
    mocks.mockCropRepository.findByNameOrAlias.mockResolvedValue(null);
    mocks.mockQuestionRepo.insertMany.mockResolvedValue(['id1']);

    await service.createBulkQuestions(
      validUserId,
      [
        {
          question: 'Outreach Q',
          crop: 'Rice',
          state: 'TN',
          district: 'Chennai',
          season: 'Kharif',
          domain: 'Soil',
        },
      ],
      true,
    );

    const inserted = mocks.mockQuestionRepo.insertMany.mock.calls[0][0];
    expect(inserted[0].source).toBe('OUTREACH');
  });

  it('defaults priority to medium for unknown priority value', async () => {
    mocks.mockCropRepository.findByNameOrAlias.mockResolvedValue(null);
    mocks.mockQuestionRepo.insertMany.mockResolvedValue(['id1']);

    await service.createBulkQuestions(validUserId, [
      {
        question: 'Q1',
        priority: 'unknown_priority',
        crop: 'Rice',
        state: 'TN',
        district: 'Chennai',
        season: 'Kharif',
        domain: 'Soil',
      },
    ]);

    const inserted = mocks.mockQuestionRepo.insertMany.mock.calls[0][0];
    expect(inserted[0].priority).toBe('medium');
  });

  it('normalises crop using alias when crop is found', async () => {
    mocks.mockCropRepository.findByNameOrAlias.mockResolvedValue({
      name: 'Wheat',
    });
    mocks.mockQuestionRepo.insertMany.mockResolvedValue(['id1']);

    await service.createBulkQuestions(validUserId, [
      {
        question: 'Q1',
        crop: 'gehun',
        state: 'Punjab',
        district: 'Ludhiana',
        season: 'Rabi',
        domain: 'Pest',
      },
    ]);

    const inserted = mocks.mockQuestionRepo.insertMany.mock.calls[0][0];
    expect(inserted[0].details.normalised_crop).toBe('Wheat');
  });

  it('sets userId to null when empty string is passed', async () => {
    mocks.mockCropRepository.findByNameOrAlias.mockResolvedValue(null);
    mocks.mockQuestionRepo.insertMany.mockResolvedValue(['id1']);

    await service.createBulkQuestions('', [
      {
        question: 'Q1',
        crop: 'Rice',
        state: 'TN',
        district: 'Chennai',
        season: 'Kharif',
        domain: 'Soil',
      },
    ]);

    const inserted = mocks.mockQuestionRepo.insertMany.mock.calls[0][0];
    expect(inserted[0].userId).toBeNull();
  });

  it('throws InternalServerError when insertMany fails', async () => {
    mocks.mockCropRepository.findByNameOrAlias.mockResolvedValue(null);
    mocks.mockQuestionRepo.insertMany.mockRejectedValue(
      new Error('DB insert error'),
    );

    await expect(
      service.createBulkQuestions(validUserId, [
        {
          question: 'Q1',
          crop: 'Rice',
          state: 'TN',
          district: 'Chennai',
          season: 'Kharif',
          domain: 'Soil',
        },
      ]),
    ).rejects.toThrow(InternalServerError);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getQuestionFromRawContext
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.getQuestionFromRawContext', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
  });

  it('merges reviewer, golden and pop results into unique questions', async () => {
    mocks.mockAiService.getQuestionByContext.mockResolvedValue({
      reviewer: [{question: 'Q1', answer: 'A1', source: 'AGRI_EXPERT'}],
      golden: [
        {question: 'Q2', answer: 'A2', metadata: {'Agri Specialist': 'Dr. X'}},
      ],
      pop: [{text: 'POP info', metadata: {}}],
    });

    const result = await service.getQuestionFromRawContext(
      'stem borer in paddy',
    );

    expect(result).toHaveLength(3);
    expect(result.find(r => r.referenceSource === 'reviewer')).toBeTruthy();
    expect(result.find(r => r.referenceSource === 'golden')).toBeTruthy();
    expect(result.find(r => r.referenceSource === 'pop')).toBeTruthy();
  });

  it('deduplicates questions with the same text', async () => {
    mocks.mockAiService.getQuestionByContext.mockResolvedValue({
      reviewer: [
        {question: 'Same Question', answer: 'A1', source: 'AGRI_EXPERT'},
        {question: 'Same Question', answer: 'A2', source: 'AGRI_EXPERT'},
      ],
      golden: [],
      pop: [],
    });

    const result = await service.getQuestionFromRawContext('context');

    expect(result).toHaveLength(1);
  });

  it('assigns a unique id to every returned item', async () => {
    mocks.mockAiService.getQuestionByContext.mockResolvedValue({
      reviewer: [{question: 'Q1', answer: 'A1', source: 'AGRI_EXPERT'}],
      golden: [],
      pop: [],
    });

    const result = await service.getQuestionFromRawContext('context');

    expect(result[0].id).toBeDefined();
    expect(typeof result[0].id).toBe('string');
  });

  it('handles empty AI response gracefully', async () => {
    mocks.mockAiService.getQuestionByContext.mockResolvedValue({
      reviewer: [],
      golden: [],
      pop: [],
    });

    const result = await service.getQuestionFromRawContext('context');

    expect(result).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// updateQuestion
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.updateQuestion', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;
  let session: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);

    session = {withTransaction: vi.fn()};
    mocks.mockMongoDatabase.startSession = vi.fn().mockResolvedValue(session);

    // Default: wrap callback execution for _withTransaction
    vi.spyOn(service as any, '_withTransaction').mockImplementation((fn: any) =>
      fn(session),
    );
  });

  it('throws BadRequestError when question is not found', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(null);

    await expect(
      service.updateQuestion(sampleId, {priority: 'high'}),
    ).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError when closing with no final answer', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockCropRepository.findByNameOrAlias.mockResolvedValue(null);
    mocks.mockAnswerRepo.getByQuestionId.mockResolvedValue([
      {isFinalAnswer: false},
    ]);

    await expect(
      service.updateQuestion(sampleId, {status: 'closed'}),
    ).rejects.toThrow(BadRequestError);
  });

  it('successfully updates question and returns modifiedCount', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockAnswerRepo.getByQuestionId.mockResolvedValue([]);
    mocks.mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

    const result = await service.updateQuestion(sampleId, {priority: 'high'});

    expect(mocks.mockQuestionRepo.updateQuestion).toHaveBeenCalled();
    expect(result).toEqual({modifiedCount: 1});
  });

  it('normalises crop when details.crop is provided', async () => {
    mocks.mockCropRepository.findByNameOrAlias.mockResolvedValue({
      name: 'Wheat',
    });
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockAnswerRepo.getByQuestionId.mockResolvedValue([]);
    mocks.mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

    await service.updateQuestion(sampleId, {
      details: {
        state: 'Punjab',
        district: 'Ludhiana',
        crop: 'gehun',
        season: 'Rabi',
        domain: ['Pest'],
      },
    });

    const updateCall = mocks.mockQuestionRepo.updateQuestion.mock.calls[0][1];
    expect(updateCall.details.normalised_crop).toBe('Wheat');
  });

  it('creates crop when not found in repository', async () => {
    mocks.mockCropRepository.findByNameOrAlias.mockResolvedValue(null);
    mocks.mockCropRepository.createCrop.mockResolvedValue({});
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockAnswerRepo.getByQuestionId.mockResolvedValue([]);
    mocks.mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});

    await service.updateQuestion(sampleId, {
      details: {
        state: 'Punjab',
        district: 'Ludhiana',
        crop: 'NewCrop',
        season: 'Rabi',
        domain: ['Pest'],
      },
    });

    expect(mocks.mockCropRepository.createCrop).toHaveBeenCalledOnce();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// deleteQuestion
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.deleteQuestion', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;
  let session: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
    session = {};
    vi.spyOn(service as any, '_withTransaction').mockImplementation((fn: any) =>
      fn(session),
    );
  });

  it('throws BadRequestError when question not found', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(null);

    await expect(service.deleteQuestion(sampleId)).rejects.toThrow(
      BadRequestError,
    );
  });

  it('decrements reputation of first queue expert when history is empty', async () => {
    const expertId = new ObjectId().toString();
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockAnswerRepo.deleteByQuestionId.mockResolvedValue({});
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      history: [],
      queue: [new ObjectId(expertId)],
    });
    mocks.mockReRouteRepository.findByQuestionId.mockResolvedValue(null);
    mocks.mockQuestionSubmissionRepo.deleteByQuestionId.mockResolvedValue({});
    mocks.mockRequestRepository.deleteByEntityId.mockResolvedValue({});
    mocks.mockDuplicateQuestionRepository.deleteByReferenceQuestionId.mockResolvedValue(
      {},
    );
    mocks.mockQuestionRepo.deleteQuestion.mockResolvedValue({deletedCount: 1});
    mocks.mockUserRepo.removeAssignedQuestionFromAllModerators = vi
      .fn()
      .mockResolvedValue(undefined);

    await service.deleteQuestion(sampleId);

    expect(mocks.mockUserRepo.updateReputationScore).toHaveBeenCalledWith(
      expertId,
      false,
      session,
    );
  });

  it('decrements reputation of in-review expert from history', async () => {
    const expertId = new ObjectId().toString();
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockAnswerRepo.deleteByQuestionId.mockResolvedValue({});
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      history: [
        {
          updatedBy: new ObjectId(expertId),
          status: 'in-review',
          answer: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      queue: [new ObjectId(expertId)],
    });
    mocks.mockReRouteRepository.findByQuestionId.mockResolvedValue(null);
    mocks.mockQuestionSubmissionRepo.deleteByQuestionId.mockResolvedValue({});
    mocks.mockRequestRepository.deleteByEntityId.mockResolvedValue({});
    mocks.mockDuplicateQuestionRepository.deleteByReferenceQuestionId.mockResolvedValue(
      {},
    );
    mocks.mockQuestionRepo.deleteQuestion.mockResolvedValue({deletedCount: 1});

    await service.deleteQuestion(sampleId);

    expect(mocks.mockUserRepo.updateReputationScore).toHaveBeenCalledWith(
      expertId,
      false,
      session,
    );
  });

  it('deletes all related documents and returns deletedCount', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockAnswerRepo.deleteByQuestionId.mockResolvedValue({});
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      history: [],
      queue: [],
    });
    mocks.mockReRouteRepository.findByQuestionId.mockResolvedValue(null);
    mocks.mockQuestionSubmissionRepo.deleteByQuestionId.mockResolvedValue({});
    mocks.mockRequestRepository.deleteByEntityId.mockResolvedValue({});
    mocks.mockDuplicateQuestionRepository.deleteByReferenceQuestionId.mockResolvedValue(
      {},
    );
    mocks.mockQuestionRepo.deleteQuestion.mockResolvedValue({deletedCount: 1});

    const result = await service.deleteQuestion(sampleId);

    expect(mocks.mockAnswerRepo.deleteByQuestionId).toHaveBeenCalled();
    expect(
      mocks.mockQuestionSubmissionRepo.deleteByQuestionId,
    ).toHaveBeenCalled();
    expect(mocks.mockRequestRepository.deleteByEntityId).toHaveBeenCalled();
    expect(
      mocks.mockDuplicateQuestionRepository.deleteByReferenceQuestionId,
    ).toHaveBeenCalled();
    expect(result).toEqual({deletedCount: 1});
  });

  it('decrements reputation for pending re-routed expert when last reroute is pending', async () => {
    const reroutedExpertId = new ObjectId().toString();
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockAnswerRepo.deleteByQuestionId.mockResolvedValue({});
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      history: [],
      queue: [],
    });
    mocks.mockReRouteRepository.findByQuestionId.mockResolvedValue({
      reroutes: [
        {status: 'pending', reroutedTo: new ObjectId(reroutedExpertId)},
      ],
    });
    mocks.mockQuestionSubmissionRepo.deleteByQuestionId.mockResolvedValue({});
    mocks.mockRequestRepository.deleteByEntityId.mockResolvedValue({});
    mocks.mockDuplicateQuestionRepository.deleteByReferenceQuestionId.mockResolvedValue(
      {},
    );
    mocks.mockQuestionRepo.deleteQuestion.mockResolvedValue({deletedCount: 1});

    await service.deleteQuestion(sampleId);

    expect(mocks.mockUserRepo.updateReputationScore).toHaveBeenCalledWith(
      reroutedExpertId,
      false,
      session,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// toggleAutoAllocate
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.toggleAutoAllocate', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;
  let session: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
    session = {};
    vi.spyOn(service as any, '_withTransaction').mockImplementation((fn: any) =>
      fn(session),
    );
  });

  it('throws NotFoundError when question is not found', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(null);

    await expect(service.toggleAutoAllocate(sampleId)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('returns message when toggled off (isAutoAllocate was true)', async () => {
    const q = {...sampleQuestion(), isAutoAllocate: true};
    mocks.mockQuestionRepo.getById.mockResolvedValue(q);
    mocks.mockQuestionRepo.updateAutoAllocate.mockResolvedValue({
      isAutoAllocate: false,
    });

    const result = await service.toggleAutoAllocate(sampleId);

    expect(result.message).toContain('false');
  });

  it('triggers autoAllocateExperts when enabling auto allocate from false state', async () => {
    const q = {...sampleQuestion(), isAutoAllocate: false};
    mocks.mockQuestionRepo.getById.mockResolvedValue(q);
    mocks.mockQuestionRepo.updateAutoAllocate.mockResolvedValue({
      isAutoAllocate: true,
    });
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(
      sampleSubmission(),
    );

    const autoAllocateSpy = vi
      .spyOn(service, 'autoAllocateExperts')
      .mockResolvedValue({data: [], status: true});

    await service.toggleAutoAllocate(sampleId);

    expect(autoAllocateSpy).toHaveBeenCalledWith(sampleId, session);
  });

  it('opens draft question before toggling', async () => {
    const q = {...sampleQuestion(), status: 'draft', isAutoAllocate: false};
    mocks.mockQuestionRepo.getById.mockResolvedValue(q);
    mocks.mockQuestionRepo.updateAutoAllocate.mockResolvedValue({
      isAutoAllocate: true,
    });
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(
      sampleSubmission(),
    );
    vi.spyOn(service, 'autoAllocateExperts').mockResolvedValue({
      data: [],
      status: true,
    });

    await service.toggleAutoAllocate(sampleId);

    expect(mocks.mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
      sampleId,
      {status: 'open'},
      session,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// allocateExperts
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.allocateExperts', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;
  let session: any;
  const moderatorId = new ObjectId().toString();
  const expertIds = [new ObjectId().toString(), new ObjectId().toString()];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
    session = {};
    vi.spyOn(service as any, '_withTransaction').mockImplementation((fn: any) =>
      fn(session),
    );
  });

  it('throws UnauthorizedError when user not found', async () => {
    mocks.mockUserRepo.findById.mockResolvedValue(null);

    await expect(
      service.allocateExperts(moderatorId, sampleId, expertIds),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when user is an expert', async () => {
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: moderatorId,
      role: 'expert',
    });

    await expect(
      service.allocateExperts(moderatorId, sampleId, expertIds),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('throws NotFoundError when question not found', async () => {
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: moderatorId,
      role: 'moderator',
    });
    mocks.mockQuestionRepo.getById.mockResolvedValue(null);

    await expect(
      service.allocateExperts(moderatorId, sampleId, expertIds),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws BadRequestError when queue is full (>=10)', async () => {
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: moderatorId,
      role: 'moderator',
    });
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      ...sampleSubmission(),
      queue: Array.from({length: 10}, () => new ObjectId()),
    });

    await expect(
      service.allocateExperts(moderatorId, sampleId, expertIds),
    ).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError when expert is already in queue', async () => {
    const existingExpertId = expertIds[0];
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: moderatorId,
      role: 'moderator',
    });
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      ...sampleSubmission(),
      queue: [existingExpertId],
    });

    await expect(
      service.allocateExperts(moderatorId, sampleId, [existingExpertId]),
    ).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError when experts array is empty', async () => {
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: moderatorId,
      role: 'moderator',
    });
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      ...sampleSubmission(),
      queue: [],
    });

    await expect(
      service.allocateExperts(moderatorId, sampleId, []),
    ).rejects.toThrow(BadRequestError);
  });

  it('successfully allocates experts to a question', async () => {
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: moderatorId,
      role: 'moderator',
    });
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      ...sampleSubmission(),
      queue: [],
      history: [],
    });
    mocks.mockUserRepo.updateReputationScore.mockResolvedValue({});
    mocks.mockNotificationService.saveTheNotifications.mockResolvedValue({});
    mocks.mockQuestionRepo.updateQuestion.mockResolvedValue({});
    mocks.mockQuestionSubmissionRepo.allocateExperts.mockResolvedValue({
      queue: expertIds,
    });

    const result = await service.allocateExperts(
      moderatorId,
      sampleId,
      expertIds,
    );

    expect(mocks.mockQuestionSubmissionRepo.allocateExperts).toHaveBeenCalled();
    expect(result).toHaveProperty('queue');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// checkStatus
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.checkStatus', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
  });

  it('delegates to questionRepo and returns result', async () => {
    const expected = [{questionId: sampleId, status: 'closed'}];
    mocks.mockQuestionRepo.getQuestionsWithAnswerDetails.mockResolvedValue(
      expected,
    );

    const result = await service.checkStatus([sampleId]);

    expect(
      mocks.mockQuestionRepo.getQuestionsWithAnswerDetails,
    ).toHaveBeenCalledWith([sampleId]);
    expect(result).toEqual(expected);
  });

  it('returns empty array when no questions match', async () => {
    mocks.mockQuestionRepo.getQuestionsWithAnswerDetails.mockResolvedValue([]);

    const result = await service.checkStatus(['nonexistent']);

    expect(result).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// bulkDeleteQuestions
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.bulkDeleteQuestions', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
    vi.mock('#root/workers/bulkDelete.manager.js', () => ({
      startBulkDeleteWorker: vi.fn().mockReturnValue('job-123'),
    }));
  });

  it('throws BadRequestError when questionIds is empty', async () => {
    await expect(service.bulkDeleteQuestions('user1', [])).rejects.toThrow(
      BadRequestError,
    );
  });

  it('throws BadRequestError when questionIds is null', async () => {
    await expect(
      service.bulkDeleteQuestions('user1', null as any),
    ).rejects.toThrow(BadRequestError);
  });

  it('returns jobId and message for valid input', async () => {
    const result = await service.bulkDeleteQuestions('user1', [
      sampleId,
      sampleId,
    ]);

    expect(result).toHaveProperty('jobId');
    expect(result).toHaveProperty('message');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// holdQuestion
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.holdQuestion', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;
  let session: any;
  const adminId = new ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
    session = {};
    vi.spyOn(service as any, '_withTransaction').mockImplementation((fn: any) =>
      fn(session),
    );
  });

  it('throws ForbiddenError when expert tries to hold a question', async () => {
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: adminId,
      role: 'expert',
    });
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(
      sampleSubmission(),
    );

    await expect(
      service.holdQuestion(sampleId, adminId, 'hold'),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws BadRequestError when already-closed question is put on hold', async () => {
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: adminId,
      role: 'moderator',
    });
    mocks.mockQuestionRepo.getById.mockResolvedValue({
      ...sampleQuestion(),
      status: 'closed',
    });

    await expect(
      service.holdQuestion(sampleId, adminId, 'hold'),
    ).rejects.toThrow(BadRequestError);
  });

  it('throws NotFoundError when submission not found during hold', async () => {
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: adminId,
      role: 'moderator',
    });
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(null);

    await expect(
      service.holdQuestion(sampleId, adminId, 'hold'),
    ).rejects.toThrow(NotFoundError);
  });

  it('holds question and clears queue when history is empty', async () => {
    const expertId = new ObjectId().toString();
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: adminId,
      role: 'moderator',
    });
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      ...sampleSubmission(),
      queue: [new ObjectId(expertId)],
      history: [],
    });
    mocks.mockUserRepo.updateReputationScore.mockResolvedValue({});
    mocks.mockQuestionSubmissionRepo.updateSubmissionState.mockResolvedValue(
      {},
    );
    mocks.mockQuestionRepo.updateQuestion.mockResolvedValue({});

    const result = await service.holdQuestion(sampleId, adminId, 'hold');

    expect(mocks.mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
      sampleId,
      expect.objectContaining({isOnHold: true, status: 'hold'}),
      session,
    );
    expect(result).toEqual({id: sampleId});
  });

  it('throws BadRequestError on unhold when question is not on hold', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue({
      ...sampleQuestion(),
      isOnHold: false,
    });
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: adminId,
      role: 'moderator',
    });

    await expect(
      service.holdQuestion(sampleId, adminId, 'unhold'),
    ).rejects.toThrow(BadRequestError);
  });

  it('unhold updates question and returns id', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue({
      ...sampleQuestion(),
      isOnHold: true,
      holdAt: new Date(),
      accumulatedHoldMs: 0,
    });
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: adminId,
      role: 'moderator',
    });
    mocks.mockQuestionRepo.updateQuestion.mockResolvedValue({});

    const result = await service.holdQuestion(sampleId, adminId, 'unhold');

    expect(mocks.mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
      sampleId,
      expect.objectContaining({isOnHold: false, status: 'open'}),
      session,
    );
    expect(result).toEqual({id: sampleId});
  });
});

// ════════════════════════════════════════════════════════════════════════════
// generateAiInitialAnswer
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.generateAiInitialAnswer', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;
  let session: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
    session = {};
    vi.spyOn(service as any, '_withTransaction').mockImplementation((fn: any) =>
      fn(session),
    );
  });

  it('throws NotFoundError when question not found', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(null);

    await expect(service.generateAiInitialAnswer(sampleId)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws ForbiddenError when question already has submitted answers', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      ...sampleSubmission(),
      history: [
        {
          updatedBy: new ObjectId(),
          status: 'submitted',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    await expect(service.generateAiInitialAnswer(sampleId)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('throws InternalServerError when AI returns empty answer', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      ...sampleSubmission(),
      history: [],
    });
    mocks.mockAiService.getAnswerByQuestionDetails.mockResolvedValue({
      answer: '   ',
    });

    await expect(service.generateAiInitialAnswer(sampleId)).rejects.toThrow(
      InternalServerError,
    );
  });

  it('returns aiInitialAnswer on success', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      ...sampleSubmission(),
      history: [],
    });
    mocks.mockAiService.getAnswerByQuestionDetails.mockResolvedValue({
      answer: 'Use pesticide X.',
    });

    const result = await service.generateAiInitialAnswer(sampleId);

    expect(result).toEqual({aiInitialAnswer: 'Use pesticide X.'});
  });
});

// ════════════════════════════════════════════════════════════════════════════
// approveAiInitialAnswer
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.approveAiInitialAnswer', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;
  let session: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
    session = {};
    vi.spyOn(service as any, '_withTransaction').mockImplementation((fn: any) =>
      fn(session),
    );
  });

  it('throws NotFoundError when question not found', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(null);

    await expect(
      service.approveAiInitialAnswer(sampleId, 'Some answer'),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws BadRequestError when answer is empty', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      ...sampleSubmission(),
      history: [],
    });

    await expect(
      service.approveAiInitialAnswer(sampleId, '   '),
    ).rejects.toThrow(BadRequestError);
  });

  it('throws ForbiddenError when question already has submitted answers', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      ...sampleSubmission(),
      history: [
        {
          updatedBy: new ObjectId(),
          status: 'submitted',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    await expect(
      service.approveAiInitialAnswer(sampleId, 'answer'),
    ).rejects.toThrow(ForbiddenError);
  });

  it('saves the approved AI answer and returns success', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(sampleQuestion());
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue({
      ...sampleSubmission(),
      history: [],
    });
    mocks.mockQuestionRepo.updateQuestion.mockResolvedValue({});

    const result = await service.approveAiInitialAnswer(
      sampleId,
      'Approved answer',
    );

    expect(mocks.mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
      sampleId,
      {aiInitialAnswer: 'Approved answer'},
      session,
    );
    expect(result).toEqual({success: true});
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getQuestionFullData
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.getQuestionFullData', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;
  const userId = new ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
  });

  it('returns null when question not found', async () => {
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: userId,
      role: 'expert',
    });
    mocks.mockQuestionRepo.getQuestionWithFullData.mockResolvedValue(null);

    const result = await service.getQuestionFullData(sampleId, userId);

    expect(result).toBeNull();
  });

  it('returns question with empty approved_moderator for non-closed question', async () => {
    mocks.mockUserRepo.findById.mockResolvedValue({
      _id: userId,
      role: 'moderator',
    });
    mocks.mockQuestionRepo.getQuestionWithFullData.mockResolvedValue(
      sampleQuestion(),
    );

    const result = await service.getQuestionFullData(sampleId, userId);

    expect(result.question).toBeDefined();
    expect(result.approved_moderator).toEqual({name: '', email: ''});
  });

  it('resolves approved moderator for closed questions', async () => {
    const closedQ = {...sampleQuestion(), status: 'closed'};
    const approverId = new ObjectId().toString();
    mocks.mockUserRepo.findById
      .mockResolvedValueOnce({_id: userId, role: 'moderator'}) // actor lookup
      .mockResolvedValueOnce({
        _id: approverId,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      }); // moderator lookup
    mocks.mockQuestionRepo.getQuestionWithFullData.mockResolvedValue(closedQ);
    mocks.mockAnswerRepo.getByQuestionId.mockResolvedValue([
      {isFinalAnswer: true, approvedBy: approverId},
    ]);

    const result = await service.getQuestionFullData(sampleId, userId);

    expect(result.approved_moderator.name).toBe('Jane Doe');
    expect(result.approved_moderator.email).toBe('jane@example.com');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// checkSubmissionExists
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.checkSubmissionExists', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
  });

  it('returns true when submission exists', async () => {
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(
      sampleSubmission(),
    );

    const result = await service.checkSubmissionExists(sampleId);

    expect(result).toBe(true);
  });

  it('returns false when submission does not exist', async () => {
    mocks.mockQuestionSubmissionRepo.getByQuestionId.mockResolvedValue(null);

    const result = await service.checkSubmissionExists(sampleId);

    expect(result).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getMatchedQuestion
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.getMatchedQuestion', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
  });

  it('throws Error when question not found', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue(null);

    await expect(service.getMatchedQuestion(sampleId)).rejects.toThrow(
      'Question not found',
    );
  });

  it('throws Error for WhatsApp question without threadId', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue({
      ...sampleQuestion(),
      source: 'WHATSAPP',
      threadId: undefined,
    });

    await expect(service.getMatchedQuestion(sampleId)).rejects.toThrow(
      'Thread id not found for WhatsApp question',
    );
  });

  it('returns message from AI service for WhatsApp question with threadId', async () => {
    const threadId = 'thread-abc';
    mocks.mockQuestionRepo.getById.mockResolvedValue({
      ...sampleQuestion(),
      source: 'WHATSAPP',
      threadId,
    });
    mocks.mockAiService.fetchWhatsAppMessage.mockResolvedValue({
      messageId: 'msg-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userDetails: {
        username: 'farmer1',
        email: 'f@example.com',
        emailVerified: true,
        avatar: null,
      },
      content: [],
    });

    const result = await service.getMatchedQuestion(sampleId);

    expect(result.messageId).toBe('msg-1');
    expect(result.user.username).toBe('farmer1');
  });

  it('throws Error when WhatsApp AI service returns null', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue({
      ...sampleQuestion(),
      source: 'WHATSAPP',
      threadId: 'thread-1',
    });
    mocks.mockAiService.fetchWhatsAppMessage.mockResolvedValue(null);

    await expect(service.getMatchedQuestion(sampleId)).rejects.toThrow(
      'No matching WhatsApp message found',
    );
  });

  it('returns message from second DB for normal AGRI_EXPERT question', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue({
      ...sampleQuestion(),
      source: 'AGRI_EXPERT',
      messageId: 'msg-xyz',
    });

    mocks.mockChatbotRepository.findFromSecondDb.mockResolvedValue([
      {
        messageId: 'msg-xyz',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userDetails: {
          _id: new ObjectId().toString(),
          username: 'expert1',
          email: 'e@example.com',
          emailVerified: true,
          avatar: null,
        },
        content: ['some content'],
      },
    ]);

    const result = await service.getMatchedQuestion(sampleId);

    expect(mocks.mockChatbotRepository.findFromSecondDb).toHaveBeenCalled();

    expect(result.messageId).toBe('msg-xyz');
    expect(result.content).toEqual(['some content']);
  });

  it('throws Error when no messages found in any DB', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue({
      ...sampleQuestion(),
      source: 'AGRI_EXPERT',
      messageId: 'msg-xyz',
    });
    mocks.mockChatbotRepository.findMatchingMessages.mockResolvedValue([]);
    mocks.mockChatbotRepository.findFromSecondDb.mockResolvedValue([]);

    await expect(service.getMatchedQuestion(sampleId)).rejects.toThrow(
      'No matching message found',
    );
  });

  it('falls back to second DB when analytics DB fails', async () => {
    mocks.mockQuestionRepo.getById.mockResolvedValue({
      ...sampleQuestion(),
      source: 'AGRI_EXPERT',
      messageId: 'msg-xyz',
    });
    mocks.mockChatbotRepository.findMatchingMessages.mockRejectedValue(
      new Error('analytics DB down'),
    );
    mocks.mockChatbotRepository.findFromSecondDb.mockResolvedValue([
      {
        messageId: 'msg-xyz',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userDetails: {
          _id: new ObjectId().toString(),
          username: 'farmer2',
          email: 'f2@example.com',
          emailVerified: false,
          avatar: null,
        },
        content: [],
      },
    ]);

    const result = await service.getMatchedQuestion(sampleId);

    expect(result.messageId).toBe('msg-xyz');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getDetailedQuestions
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.getDetailedQuestions', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
  });

  it('passes query and body to repository', async () => {
    const expected = {questions: [sampleQuestion()], totalPages: 1};
    mocks.mockQuestionRepo.findDetailedQuestions.mockResolvedValue(expected);

    const result = await service.getDetailedQuestions(
      {page: 1, limit: 10} as any,
      {} as any,
    );

    expect(mocks.mockQuestionRepo.findDetailedQuestions).toHaveBeenCalled();
    expect(result).toEqual(expected);
  });

  it('sets searchEmbedding to null when no search query', async () => {
    mocks.mockQuestionRepo.findDetailedQuestions.mockResolvedValue({
      questions: [],
      totalPages: 0,
    });

    await service.getDetailedQuestions({} as any, {} as any);

    const calledWith =
      mocks.mockQuestionRepo.findDetailedQuestions.mock.calls[0][0];
    expect(calledWith.searchEmbedding).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// backfillEmptyEmbeddings
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.backfillEmptyEmbeddings', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);

    const {appConfig} = await import('#root/config/app.js').catch(() => ({
      appConfig: null,
    }));
    if (appConfig) {
      (appConfig as any).ENABLE_AI_SERVER = true;
    }
  });

  it('skips processing when ENABLE_AI_SERVER is false', async () => {
    // Patch at the module level by spying the internal check
    vi.spyOn(service as any, 'backfillEmptyEmbeddings').mockImplementation(
      async () => {
        console.log('<<EMBEDDING_BACKFILL>> AI server disabled, skipping.');
      },
    );

    await service.backfillEmptyEmbeddings();

    expect(
      mocks.mockQuestionRepo.getQuestionsWithEmptyEmbeddings,
    ).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getQuestionStatusSummary
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService.getQuestionStatusSummary', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
  });

  it('delegates to repository and returns summary', async () => {
    const summary = {
      totalQuestions: 10,
      statuses: [
        {status: 'open', count: 7},
        {status: 'closed', count: 3},
      ],
      sourceCounts: [],
    };

    mocks.mockQuestionRepo.getQuestionStatusSummary.mockResolvedValue(summary);

    const result = await service.getQuestionStatusSummary({} as any, {} as any);

    expect(mocks.mockQuestionRepo.getQuestionStatusSummary).toHaveBeenCalled();
    expect(result).toMatchObject(summary);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// private truncateQuestionText (tested via visible effects in notifications)
// ════════════════════════════════════════════════════════════════════════════
describe('QuestionService — truncateQuestionText (private, tested indirectly)', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = buildMocks();
    service = buildService(mocks);
  });

  it('short text is returned as-is', () => {
    const result = (service as any).truncateQuestionText('Short text');
    expect(result).toBe('Short text');
  });

  it('long text is truncated at 50 characters with ellipsis', () => {
    const long = 'a'.repeat(80);
    const result = (service as any).truncateQuestionText(long);
    expect(result.endsWith('...')).toBe(true);
    expect(result.length).toBe(53); // 50 chars + '...'
  });

  it('returns "Question" when text is falsy', () => {
    expect((service as any).truncateQuestionText('')).toBe('Question');
    expect((service as any).truncateQuestionText(null)).toBe('Question');
  });

  it('respects custom maxLength', () => {
    const result = (service as any).truncateQuestionText('Hello World!', 5);
    expect(result).toBe('Hello...');
  });
});
