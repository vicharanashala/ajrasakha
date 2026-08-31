import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestionService } from '../services/QuestionService.js';
import { AddQuestionBodyDto } from '../classes/validators/QuestionVaidators.js';

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
  } as AddQuestionBodyDto;
}

// ── Mock dependencies ─────────────────────────────────────────────────────────

const mockAiService = {
  getEmbedding: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
  getQuestionByContextAndMetaData: vi.fn(),
};

const mockContextRepo = { addContext: vi.fn() };

const mockQuestionRepo = {
  addQuestion: vi.fn().mockResolvedValue({ _id: '664f00000000000000000001' }),
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
    mockContextRepo as any,
    mockQuestionRepo as any,
    mockUserRepo as any,
    mockQuestionSubmissionRepo as any,
    {} as any, // requestRepository
    {} as any, // answerRepo
    mockNotificationService as any,
    {} as any, // reRouteRepository
    {} as any, // duplicateQuestionRepository
    mockCropRepository as any,
    {} as any, // chatbotRepository
    {} as any, // mongoDatabase
    {} as any, // userService
    { createAuditTrail: vi.fn() } as any, // auditTrailsService
    {} as any, // feedbackRepo
    {} as any, // questionReportService
    {} as any, // paeValidationService
    {} as any, // feedbackService
    {} as any, // questionAiService
    {} as any, // duplicateService
    {} as any, // queueService
    { freeRoleAssigneeOnStatusChange: vi.fn() } as any, // roleAssigneeService
    {} as any, // allocationService
    {} as any, // moderatorQueueService
    {} as any, // maintenanceService
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('QuestionService.addQuestion — crop normalisation', () => {
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuestionRepo.addQuestion.mockResolvedValue({
      _id: '664f00000000000000000001',
    });
    mockUserRepo.findExpertsByPreference.mockResolvedValue([]);
    mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);
    mockQuestionSubmissionRepo.addSubmission.mockResolvedValue(undefined);
    mockCropRepository.createCrop.mockResolvedValue(undefined);

    service = buildService();

    // Bypass MongoDB transaction — execute the callback directly with null session
    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      (fn: any) => fn(null),
    );
  });

  // ── Crop exists in crop_master ────────────────────────────────────────────

  describe('when crop exists in crop_master', () => {
    it('sets normalised_crop to the canonical name and does not create a new crop', async () => {
      mockCropRepository.findByNameOrAlias.mockResolvedValue({ name: 'wheat' });

      await service.addQuestion(FIXED_USER_ID, makeBody('Wheat'));

      const passedQuestion = mockQuestionRepo.addQuestion.mock.calls[0][0];
      expect(passedQuestion.details.normalised_crop).toBe('wheat');
      expect(mockCropRepository.createCrop).not.toHaveBeenCalled();
    });
  });

  // ── Crop does NOT exist in crop_master ────────────────────────────────────

  describe('when crop does NOT exist in crop_master', () => {
    it('omits normalised_crop so that a moderator can add it via Agri Tech Management', async () => {
      mockCropRepository.findByNameOrAlias.mockResolvedValue(null);

      await service.addQuestion(FIXED_USER_ID, makeBody('Bajra'));

      const passedQuestion = mockQuestionRepo.addQuestion.mock.calls[0][0];
      expect(passedQuestion.details.normalised_crop).toBeUndefined();
      expect(passedQuestion.details.crop).toBe('Bajra');
    });
  });
});
