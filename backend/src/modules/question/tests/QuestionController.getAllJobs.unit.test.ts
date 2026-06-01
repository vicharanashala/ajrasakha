import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

vi.mock('#root/workers/workerManager.js', () => ({
  getBackgroundJobs: vi.fn(),
  getJobById: vi.fn(),
  startBackgroundProcessing: vi.fn(),
}));

import {QuestionController} from '../controllers/QuestionController.js';
import * as workerManager from '#root/workers/workerManager.js';

describe('QuestionController.getAllJobs', () => {
  let controller: QuestionController;

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new QuestionController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('returns all background jobs', () => {
    const jobs = [
      {
        total: 10,
        processed: 5,
        status: 'running',
        startedAt: new Date(),
        logs: [],
      },
      {
        total: 20,
        processed: 20,
        status: 'completed',
        startedAt: new Date(),
        logs: [],
      },
    ] as any;

    vi.mocked(workerManager.getBackgroundJobs).mockReturnValue(jobs);

    const result = controller.getAllJobs();

    expect(workerManager.getBackgroundJobs).toHaveBeenCalledTimes(1);
    expect(result).toEqual(jobs);
  });
});
