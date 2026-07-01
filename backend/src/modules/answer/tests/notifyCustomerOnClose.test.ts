import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

// Mock the webhook util so no real HTTP call is made. The mock path resolves to the
// same module file AnswerService imports ('../utils/triggerWebhook.js').
vi.mock('../utils/triggerWebhook.js', () => ({
  triggerWebhook: vi.fn().mockResolvedValue({ok: true, status: 200, body: 'ok'}),
}));

import {triggerWebhook} from '../utils/triggerWebhook.js';
import {AnswerService} from '../services/AnswerService.js';

const mockQuestionRepo = {
  updateQuestion: vi.fn().mockResolvedValue({modifiedCount: 1}),
};

// AnswerService constructor order:
// aiService, answerRepo, reviewRepo, questionRepo, questionSubmissionRepo, userRepo,
// questionService, notificationService, notificationRepository, reRouteRepository, mongoDatabase
function buildService(): AnswerService {
  return new AnswerService(
    {} as any, // aiService
    {} as any, // answerRepo
    {} as any, // reviewRepo
    mockQuestionRepo as any, // questionRepo
    {} as any, // questionSubmissionRepo
    {} as any, // userRepo
    {} as any, // questionService
    {} as any, // notificationService
    {} as any, // notificationRepository
    {} as any, // reRouteRepository
    {} as any, // mongoDatabase
  );
}

describe('AnswerService.notifyCustomerOnClose — per-question customer webhook', () => {
  let service: AnswerService;

  const call = (q: any) =>
    (service as any).notifyCustomerOnClose(q, 'the answer', [], 'Expert Name', null);

  beforeEach(() => {
    vi.clearAllMocks();
    (triggerWebhook as any).mockResolvedValue({ok: true, status: 200, body: 'ok'});
    mockQuestionRepo.updateQuestion.mockResolvedValue({modifiedCount: 1});
    service = buildService();
  });

  it('fires the WhatsApp webhook and marks isCustomerNotified for WHATSAPP questions', async () => {
    const result = await call({_id: 'q1', source: 'WHATSAPP'});

    expect(triggerWebhook).toHaveBeenCalledTimes(1);
    expect(triggerWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({question_id: 'q1', status: 'closed', answer: 'the answer'}),
      'WhatsApp',
    );
    expect(result).toBe(true);
    expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
      'q1',
      {isCustomerNotified: true},
      null,
      false,
    );
  });

  it('fires the Browser webhook with the question messageId/threadId for AJRASAKHA questions', async () => {
    const result = await call({
      _id: 'q2',
      source: 'AJRASAKHA',
      question: 'Q?',
      messageId: 'm2',
      threadId: 't2',
    });

    expect(triggerWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({question_id: 'q2', question: 'Q?', messageId: 'm2', threadId: 't2'}),
      'Browser',
    );
    expect(result).toBe(true);
  });

  it('is a no-op for non-chatbot sources (AGRI_EXPERT / OUTREACH)', async () => {
    const result = await call({_id: 'q3', source: 'AGRI_EXPERT'});

    expect(triggerWebhook).not.toHaveBeenCalled();
    expect(mockQuestionRepo.updateQuestion).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('records isCustomerNotified=false when the webhook throws (best-effort, never rethrows)', async () => {
    (triggerWebhook as any).mockRejectedValueOnce(new Error('webhook down'));

    const result = await call({_id: 'q4', source: 'WHATSAPP'});

    expect(result).toBe(false);
    expect(mockQuestionRepo.updateQuestion).toHaveBeenCalledWith(
      'q4',
      {isCustomerNotified: false},
      null,
      false,
    );
  });
});
