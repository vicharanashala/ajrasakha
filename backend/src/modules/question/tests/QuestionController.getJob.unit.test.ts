import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

vi.mock('#root/workers/workerManager.js', () => ({
  getBackgroundJobs: vi.fn(),
  getJobById: vi.fn(),
  startBackgroundProcessing: vi.fn(),
}));

import {QuestionController} from '../controllers/QuestionController.js';
import * as workerManager from '#root/workers/workerManager.js';

describe('QuestionController.getJob', () => {
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

  it('returns job when found', () => {
    const mockJob = {
      total: 10,
      processed: 10,
      status: 'completed',
      startedAt: new Date(),
      logs: [],
    } as any;

    vi.mocked(workerManager.getJobById).mockReturnValue(mockJob);

    const result = controller.getJob('job-1');

    expect(workerManager.getJobById).toHaveBeenCalledWith('job-1');
    expect(result).toEqual(mockJob);
  });

  it('returns job not found message', () => {
    vi.mocked(workerManager.getJobById).mockReturnValue(undefined);

    const result = controller.getJob('unknown-job');

    expect(workerManager.getJobById).toHaveBeenCalledWith('unknown-job');

    expect(result).toEqual({
      message: 'Job not found',
    });
  });

  it('calls getJobById exactly once', () => {
    const mockJob = {
      total: 1,
      processed: 1,
      status: 'completed',
      startedAt: new Date(),
      logs: [],
    } as any;

    vi.mocked(workerManager.getJobById).mockReturnValue(mockJob);

    controller.getJob('job-1');

    expect(workerManager.getJobById).toHaveBeenCalledTimes(1);
  });
});
