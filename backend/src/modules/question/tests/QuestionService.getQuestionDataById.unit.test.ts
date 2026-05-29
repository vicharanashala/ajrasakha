import {describe, it, expect, beforeEach, vi} from 'vitest';
import {QuestionService} from '../services/QuestionService.js';

describe('QuestionService', () => {
  let service: QuestionService;

  let mockQuestionRepo: any;
  let mockUserRepo: any;
  let mockQuestionSubmissionRepo: any;
  let mockAnswerRepo: any;
  let mockRequestRepository: any;
  let mockContextRepo: any;
  let mockNotificationRepository: any;
  let mockNotificationService: any;
  let mockReRouteRepository: any;
  let mockDuplicateQuestionRepository: any;
  let mockCropRepository: any;
  let mockChatbotRepository: any;
  let mockAiService: any;
  let mockUserService: any;
  let mockMongoDatabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAiService = {};

    mockContextRepo = {};

    mockQuestionRepo = {
      getById: vi.fn(),
    };

    mockUserRepo = {};

    mockQuestionSubmissionRepo = {};

    mockRequestRepository = {};

    mockAnswerRepo = {};

    mockNotificationRepository = {};

    mockNotificationService = {};

    mockReRouteRepository = {};

    mockDuplicateQuestionRepository = {};

    mockCropRepository = {};

    mockChatbotRepository = {};

    mockMongoDatabase = {};

    mockUserService = {};

    service = new QuestionService(
      mockAiService,
      mockContextRepo,
      mockQuestionRepo,
      mockUserRepo,
      mockQuestionSubmissionRepo,
      mockRequestRepository,
      mockAnswerRepo,
      mockNotificationRepository,
      mockNotificationService,
      mockReRouteRepository,
      mockDuplicateQuestionRepository,
      mockCropRepository,
      mockChatbotRepository,
      mockMongoDatabase,
      mockUserService,
    );
  });

  it('returns question when repository finds it', async () => {
    const question = {
      _id: '123',
      question: 'What is wheat?',
    };

    mockQuestionRepo.getById.mockResolvedValue(question);

    const result = await service.getQuestionDataById('123');

    expect(mockQuestionRepo.getById).toHaveBeenCalledWith('123');

    expect(result).toEqual(question);
  });

  it('returns null when question does not exist', async () => {
    mockQuestionRepo.getById.mockResolvedValue(null);

    const result = await service.getQuestionDataById('123');

    expect(mockQuestionRepo.getById).toHaveBeenCalledWith('123');

    expect(result).toBeNull();
  });

  it('returns null when repository throws an error', async () => {
    mockQuestionRepo.getById.mockRejectedValue(new Error('Database failure'));

    const result = await service.getQuestionDataById('123');

    expect(mockQuestionRepo.getById).toHaveBeenCalledWith('123');

    expect(result).toBeNull();
  });
  // it('returns null when repository throws an error', async () => {
  //   vi.spyOn(console, 'error').mockImplementation(() => {});

  //   mockQuestionRepo.getById.mockRejectedValue(new Error('Database failure'));

  //   const result = await service.getQuestionDataById('123');

  //   expect(result).toBeNull();
  // });
});
