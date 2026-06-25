import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {QuestionService} from '../services/QuestionService.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const QUESTION_ID = '664f00000000000000000010';

const mockQuestionRepo = {
  getById: vi.fn(),
  updateQuestion: vi.fn().mockResolvedValue({modifiedCount: 1}),
  updateThreadId: vi.fn(),
};

const mockAnswerRepo = {
  getByQuestionId: vi.fn().mockResolvedValue([]),
};

const mockUserRepo = {
  removeAssignedQuestionFromAllModerators: vi.fn().mockResolvedValue(undefined),
};

// QuestionService constructor order:
// aiService, accAgentService, contextRepo, questionRepo, userRepo,
// questionSubmissionRepo, requestRepository, answerRepo, notificationRepository,
// notificationService, reRouteRepository, duplicateQuestionRepository,
// cropRepository, chatbotRepository, mongoDatabase, userService
function buildService(): QuestionService {
  return new QuestionService(
    {} as any, // aiService
    {} as any, // accAgentService
    {} as any, // contextRepo
    mockQuestionRepo as any, // questionRepo
    mockUserRepo as any, // userRepo
    {} as any, // questionSubmissionRepo
    {} as any, // requestRepository
    mockAnswerRepo as any, // answerRepo
    {} as any, // notificationRepository
    {} as any, // notificationService
    {} as any, // reRouteRepository
    {} as any, // duplicateQuestionRepository
    {} as any, // cropRepository
    {} as any, // chatbotRepository
    {} as any, // mongoDatabase
    {} as any, // userService
  );
}

describe('QuestionService.updateQuestion — workflow status transitions', () => {
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});
    mockAnswerRepo.getByQuestionId.mockResolvedValue([]);

    service = buildService();

    // Bypass MongoDB transaction — execute the callback directly with null session.
    vi.spyOn(service as any, '_withTransaction').mockImplementation((fn: any) =>
      fn(null),
    );
  });

  it('stamps isClosed and closedAt when a dynamic question is closed via Notify User (dynamic_closed)', async () => {
    mockQuestionRepo.getById.mockResolvedValue({
      _id: QUESTION_ID,
      status: 'dynamic',
    });

    await service.updateQuestion(QUESTION_ID, {status: 'dynamic_closed'} as any);

    const [, persistedUpdates] = mockQuestionRepo.updateQuestion.mock.calls[0];
    expect(persistedUpdates.status).toBe('dynamic_closed');
    expect(persistedUpdates.isClosed).toBe(true);
    expect(persistedUpdates.closedAt).toBeInstanceOf(Date);
  });

  it('keeps a duplicate question in duplicate when Push to Auditor attempts auditor_review', async () => {
    mockQuestionRepo.getById.mockResolvedValue({
      _id: QUESTION_ID,
      status: 'duplicate',
    });

    await service.updateQuestion(QUESTION_ID, {status: 'auditor_review'} as any);

    const [, persistedUpdates] = mockQuestionRepo.updateQuestion.mock.calls[0];
    // Duplicate questions must NOT transition to auditor_review.
    expect(persistedUpdates.status).toBe('duplicate');
    expect(persistedUpdates.isClosed).toBeUndefined();
    expect(persistedUpdates.closedAt).toBeUndefined();
  });

  it('keeps a dynamic question in dynamic when Push to Auditor attempts auditor_review', async () => {
    mockQuestionRepo.getById.mockResolvedValue({
      _id: QUESTION_ID,
      status: 'dynamic',
    });

    await service.updateQuestion(QUESTION_ID, {status: 'auditor_review'} as any);

    const [, persistedUpdates] = mockQuestionRepo.updateQuestion.mock.calls[0];
    // Dynamic questions must NOT transition to auditor_review either.
    expect(persistedUpdates.status).toBe('dynamic');
    expect(persistedUpdates.isClosed).toBeUndefined();
    expect(persistedUpdates.closedAt).toBeUndefined();
  });

  it('does not stamp closedAt for a queue_progress cancel back to open', async () => {
    mockQuestionRepo.getById.mockResolvedValue({
      _id: QUESTION_ID,
      status: 'queue_progress',
    });

    await service.updateQuestion(QUESTION_ID, {status: 'open'} as any);

    const [, persistedUpdates] = mockQuestionRepo.updateQuestion.mock.calls[0];
    expect(persistedUpdates.status).toBe('open');
    expect(persistedUpdates.isClosed).toBeUndefined();
  });
});
