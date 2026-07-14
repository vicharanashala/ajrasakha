import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('#root/modules/notification/services/NotificationService.js', () => ({
  NotificationService: class {
    saveTheNotifications = vi.fn();
  },
}));

vi.mock('#root/config/app.js', () => ({
  appConfig: {ENABLE_AI_SERVER: false},
}));

vi.mock('../logger/chatbot-similarity.logger.js', () => ({
  chatbotSimilarityLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {QuestionService} from '../services/QuestionService.js';
import {AddQuestionBodyDto} from '../classes/validators/QuestionVaidators.js';

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

const mockAiService = {
  getEmbedding: vi.fn().mockResolvedValue({embedding: [0.1, 0.2, 0.3]}),
};

const mockContextRepo = {
  addContext: vi.fn().mockResolvedValue({insertedId: '664f00000000000000000002'}),
};

const mockQuestionRepo = {
  addQuestion: vi.fn().mockResolvedValue({_id: '664f00000000000000000003'}),
  updateQuestion: vi.fn(),
};

const mockUserRepo = {
  findExpertsByPreference: vi.fn().mockResolvedValue([]),
  updateReputationScore: vi.fn(),
};

const mockQuestionSubmissionRepo = {
  addSubmission: vi.fn().mockResolvedValue(undefined),
  updateQueue: vi.fn().mockResolvedValue(undefined),
};

const mockNotificationService = {
  saveTheNotifications: vi.fn().mockResolvedValue(undefined),
};

const mockCropRepository = {
  findByNameOrAlias: vi.fn(),
};

function buildService(): QuestionService {
  return new QuestionService(
    mockAiService as any,
    {} as any,
    mockContextRepo as any,
    mockQuestionRepo as any,
    mockUserRepo as any,
    mockQuestionSubmissionRepo as any,
    {} as any,
    {} as any,
    {} as any,
    mockNotificationService as any,
    {} as any,
    {addDuplicate: vi.fn()} as any,
    mockCropRepository as any,
    {} as any,
    {getClient: vi.fn()} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe('QuestionService.addQuestion — crop normalization', () => {
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuestionRepo.addQuestion.mockResolvedValue({_id: '664f00000000000000000003'});
    mockQuestionSubmissionRepo.addSubmission.mockResolvedValue(undefined);
    mockUserRepo.findExpertsByPreference.mockResolvedValue([]);
    mockUserRepo.updateReputationScore.mockResolvedValue(undefined);
    mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);
    mockContextRepo.addContext.mockResolvedValue({insertedId: '664f00000000000000000002'});

    service = buildService();
    vi.spyOn(service as any, '_withTransaction').mockImplementation(async (operation: any) => operation(null));
    vi.spyOn(service as any, 'processQuestionInBackground').mockResolvedValue(undefined);
  });

  it('stores the canonical crop name when a matching crop exists', async () => {
    mockCropRepository.findByNameOrAlias.mockResolvedValue({name: 'wheat'});

    await service.addQuestion(FIXED_USER_ID, makeBody('Wheat'));

    const passedQuestion = mockQuestionRepo.addQuestion.mock.calls[0][0];
    expect(mockCropRepository.findByNameOrAlias).toHaveBeenCalledWith('Wheat');
    expect(passedQuestion.details.normalised_crop).toBe('wheat');
    expect(passedQuestion.details.crop).toBe('Wheat');
  });

  it('does not set a normalised crop when no match is found', async () => {
    mockCropRepository.findByNameOrAlias.mockResolvedValue(null);

    await service.addQuestion(FIXED_USER_ID, makeBody('Bajra'));

    const passedQuestion = mockQuestionRepo.addQuestion.mock.calls[0][0];
    expect(mockCropRepository.findByNameOrAlias).toHaveBeenCalledWith('Bajra');
    expect(passedQuestion.details.normalised_crop).toBeUndefined();
    expect(passedQuestion.details.crop).toBe('Bajra');
  });
});