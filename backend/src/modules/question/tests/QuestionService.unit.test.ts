import {describe, expect, it, vi, beforeEach} from 'vitest';

describe('QuestionService', () => {
  let mockRepository: any;

  beforeEach(() => {
    mockRepository = {
      createQuestion: vi.fn(),
    };
  });

  it('creates question successfully', async () => {
    mockRepository.createQuestion.mockResolvedValue({
      id: '123',
      title: 'Test Question',
    });

    const result = await mockRepository.createQuestion({
      title: 'Test Question',
    });

    expect(result.title).toBe('Test Question');

    expect(mockRepository.createQuestion).toHaveBeenCalledOnce();
  });
});
