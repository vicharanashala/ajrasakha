import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {ObjectId} from 'mongodb';

vi.mock('#root/workers/balanceWorkload.manager.js', () => ({
  startBalanceWorkloadWorkers: vi.fn(),
}));

import {AllocationService} from '../services/AllocationService.js';
import {startBalanceWorkloadWorkers} from '#root/workers/balanceWorkload.manager.js';

describe('AllocationService - TimeBound Reallocation', () => {
  let allocationService: AllocationService;

  let mockQuestionRepo: any;
  let mockUserRepo: any;
  let mockQuestionSubmissionRepo: any;
  let mockAnswerRepo: any;
  let mockRequestRepo: any;
  let mockNotificationService: any;
  let mockUserService: any;
  let mockAuditTrailsService: any;
  let mockDatabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(startBalanceWorkloadWorkers).mockResolvedValue({
      processed: 1,
      failedWorkers: 0,
    });

    mockQuestionRepo = {};

    mockUserRepo = {
      findExpertsByReputationScore: vi.fn(),
    };

    mockQuestionSubmissionRepo = {
      findTimeBoundQuestionsForReallocation: vi.fn(),
      findUnallocatedTimeBoundQuestions: vi.fn().mockResolvedValue([]),
      findAnsweredQuestionsNeedingReviewer: vi.fn().mockResolvedValue([]),
      getTimeBoundActiveCountPerExpert: vi.fn(),
    };

    mockAnswerRepo = {};
    mockRequestRepo = {};
    mockNotificationService = {};
    mockUserService = {};

    mockAuditTrailsService = {
      createAuditTrail: vi.fn().mockResolvedValue(true),
    };

    mockDatabase = {};

    allocationService = new AllocationService(
      mockQuestionRepo,
      mockUserRepo,
      mockQuestionSubmissionRepo,
      mockAnswerRepo,
      mockRequestRepo,
      mockNotificationService,
      mockUserService,
      mockAuditTrailsService,
      mockDatabase,
    );
  });

  it('should reallocate a stuck AJRASAKHA question to a new eligible expert', async () => {
    const questionId = new ObjectId();
    const submissionId = new ObjectId();

    const oldExpertId = new ObjectId();
    const newExpertId = new ObjectId();

    const allocatedAt = new Date(Date.now() - 50 * 60 * 1000);

    const mockStuckSubmission = {
      _id: submissionId,
      questionId,

      currentExpertAllocatedAt: allocatedAt,
      currentExpertOpenedAt: null,

      history: [
        {
          updatedBy: oldExpertId,
          status: 'in-review',
        },
      ],

      queue: [oldExpertId],

      question: {
        _id: questionId,
        question: 'Time-bound reallocation test question',
        source: 'AJRASAKHA',
        status: 'open',
        isAutoAllocate: true,
        isTrainingQuestion: false,
      },
    };

    mockQuestionSubmissionRepo.findTimeBoundQuestionsForReallocation.mockResolvedValue(
      [mockStuckSubmission],
    );

    mockUserRepo.findExpertsByReputationScore.mockResolvedValue([
      {
        _id: oldExpertId,
        isTrainingUser: false,
        isBlocked: false,
        special_task_force: false,
        firstName: 'Old',
        lastName: 'Expert',
      },
      {
        _id: newExpertId,
        isTrainingUser: false,
        isBlocked: false,
        special_task_force: false,
        firstName: 'New',
        lastName: 'Expert',
      },
    ]);

    mockQuestionSubmissionRepo.getTimeBoundActiveCountPerExpert.mockResolvedValue(
      new Map([
        [newExpertId.toString(), 0],
        [oldExpertId.toString(), 1],
      ]),
    );

    const result =
      await allocationService.reallocateTimeBoundQuestions();

    expect(result.reallocated).toBe(1);

    expect(startBalanceWorkloadWorkers).toHaveBeenCalledTimes(1);

    const workerCallArgs =
      vi.mocked(startBalanceWorkloadWorkers).mock.calls[0][0];

    expect(workerCallArgs).toHaveLength(1);

    expect(workerCallArgs[0].expertId).toBe(
      newExpertId.toString(),
    );

    expect(workerCallArgs[0].expertId).not.toBe(
      oldExpertId.toString(),
    );

    expect(workerCallArgs[0].submissionId).toBe(
      submissionId.toString(),
    );
  });

  it('should skip a concurrent time-bound reallocation while the first call holds the lock', async () => {
    let releaseFirstCall!: (value: any[]) => void;
    let signalFirstCallStarted!: () => void;
    const firstCallStarted = new Promise<void>(resolve => {
      signalFirstCallStarted = resolve;
    });
    const firstCallFetch = new Promise<any[]>(resolve => {
      releaseFirstCall = resolve;
    });

    mockQuestionSubmissionRepo.findTimeBoundQuestionsForReallocation
      .mockImplementationOnce(async () => {
        signalFirstCallStarted();
        return firstCallFetch;
      });

    const firstCall = allocationService.reallocateTimeBoundQuestions();
    await firstCallStarted;

    const secondResult =
      await allocationService.reallocateTimeBoundQuestions();

    expect(secondResult).toEqual({
      message: 'Reallocation already in progress',
      reallocated: 0,
      skipped: 0,
    });

    releaseFirstCall([]);
    await expect(firstCall).resolves.toMatchObject({
      reallocated: 0,
      skipped: 0,
    });
  });
});