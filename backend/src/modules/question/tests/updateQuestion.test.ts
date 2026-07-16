import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestionService } from '../services/QuestionService.js';
import { BadRequestError } from 'routing-controllers';

// ── Mock dependencies ─────────────────────────────────────────────────────────
const mockQuestionRepo = {
  getById: vi.fn(),
  updateQuestion: vi.fn(),
};

const mockAnswerRepo = {
  getByQuestionId: vi.fn().mockResolvedValue([]),
};

function buildService(): QuestionService {
  return new QuestionService(
    {} as any, // aiService
    {} as any, // contextRepo
    mockQuestionRepo as any,
    {} as any, // userRepo
    {} as any, // questionSubmissionRepo
    {} as any, // requestRepository
    mockAnswerRepo as any, // answerRepo
    {} as any, // notificationRepository
    {} as any, // notificationService
    {} as any, // reRouteRepository
    {} as any, // duplicateQuestionRepository
    {} as any, // cropRepository
    {} as any, // mongoDatabase
  );
}

describe('QuestionService.updateQuestion — re-routed status validation', () => {
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = buildService();

    // Bypass MongoDB transaction — execute the callback directly with null session
    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      (fn: any) => fn(null),
    );
  });

  it('blocks changing status to open when existing status is re-routed', async () => {
    mockQuestionRepo.getById.mockResolvedValue({
      _id: 'q123',
      status: 're-routed',
    });

    const updates = { status: 'open' };

    await expect(service.updateQuestion('q123', updates as any)).rejects.toThrow(
      new BadRequestError('Cannot change the status, this question is currently re-routed.')
    );
  });

  it('blocks changing status to delayed when existing status is re-routed', async () => {
    mockQuestionRepo.getById.mockResolvedValue({
      _id: 'q123',
      status: 're-routed',
    });

    const updates = { status: 'delayed' };

    await expect(service.updateQuestion('q123', updates as any)).rejects.toThrow(
      new BadRequestError('Cannot change the status, this question is currently re-routed.')
    );
  });

  it('allows other status updates when existing status is re-routed', async () => {
    mockQuestionRepo.getById.mockResolvedValue({
      _id: 'q123',
      status: 're-routed',
    });
    mockQuestionRepo.updateQuestion.mockResolvedValue({ modifiedCount: 1 });

    const updates = { status: 'closed' };

    await expect(service.updateQuestion('q123', updates as any)).resolves.not.toThrow();
  });
});
