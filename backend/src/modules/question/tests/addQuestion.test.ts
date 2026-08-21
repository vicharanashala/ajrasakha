import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {QuestionService} from '../services/QuestionService.js';
import {AddQuestionBodyDto} from '../classes/validators/QuestionVaidators.js';

// ── Shared test data ──────────────────────────────────────────────────────────

const FIXED_USER_ID = '664f00000000000000000001';

function makeBody(cropName: string): AddQuestionBodyDto {
  return {
    question: `Question_${Date.now()}`,
    priority: 'medium',
    source: 'AGRI_EXPERT',
    details: {
      state: 'Maharashtra',
      district: 'Pune',
      crop: cropName,
      season: 'Kharif',
      domain: ['Pest Management'],
    },
  } as unknown as AddQuestionBodyDto;
}

// ── Mock dependencies ─────────────────────────────────────────────────────────

const mockAiService = {
  getEmbedding: vi.fn().mockResolvedValue({embedding: [0.1, 0.2, 0.3]}),
  getQuestionByContextAndMetaData: vi.fn(),
};

const mockContextRepo = {addContext: vi.fn()};

const mockQuestionRepo = {
  addQuestion: vi.fn().mockResolvedValue({_id: '664f00000000000000000001'}),
};

const mockUserRepo = {
  findExpertsByPreference: vi.fn().mockResolvedValue([]),
  updateReputationScore: vi.fn(),
};

const mockQuestionSubmissionRepo = {
  addSubmission: vi.fn().mockResolvedValue(undefined),
};

const mockNotificationService = {
  saveTheNotifications: vi.fn().mockResolvedValue(undefined),
};

const mockCropRepository = {
  findByNameOrAlias: vi.fn(),
  createCrop: vi.fn().mockResolvedValue(undefined),
};

// ── Service factory ───────────────────────────────────────────────────────────

function buildService(): QuestionService {
  return new QuestionService(
    mockAiService as any,
    {} as any, // accAgentService
    mockContextRepo as any,
    mockQuestionRepo as any,
    mockUserRepo as any,
    mockQuestionSubmissionRepo as any,
    {} as any, // requestRepository
    {} as any, // answerRepo
    {} as any, // notificationRepository
    mockNotificationService as any,
    {} as any, // reRouteRepository
    {} as any, // duplicateQuestionRepository
    mockCropRepository as any,
    {} as any, // chatbotRepository
    {} as any, // mongoDatabase
    {} as any, // userService
    {} as any, // callDetailsRepository
    { log: vi.fn().mockResolvedValue(undefined) } as any, // auditTrailsService
    {} as any, // feedbackRepo
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('QuestionService.addQuestion', () => {
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuestionRepo.addQuestion.mockResolvedValue({_id: '664f00000000000000000001'});
    mockUserRepo.findExpertsByPreference.mockResolvedValue([]);
    mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);
    mockQuestionSubmissionRepo.addSubmission.mockResolvedValue(undefined);

    service = buildService();

    // Bypass MongoDB transaction — execute the callback directly with null session
    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      (fn: any) => fn(null),
    );
  });

  it('successfully creates a question and creates a submission record', async () => {
    const result = await service.addQuestion(FIXED_USER_ID, makeBody('Wheat'));

    expect(result.data).toHaveProperty('_id');
    expect(mockQuestionRepo.addQuestion).toHaveBeenCalled();
    expect(mockQuestionSubmissionRepo.addSubmission).toHaveBeenCalled();
  });

  it('saves question details correctly', async () => {
    await service.addQuestion(FIXED_USER_ID, makeBody('Bajra'));

    const passedQuestion = mockQuestionRepo.addQuestion.mock.calls[0][0];
    expect(passedQuestion.details.crop).toBe('Bajra');
    expect(passedQuestion.priority).toBe('medium');
    expect(passedQuestion.source).toBe('AGRI_EXPERT');
  });
});
